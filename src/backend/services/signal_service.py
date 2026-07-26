"""SignalEngine 桥接服务

职责：
1. 从 SQLite 拉取股票池 + K 线
2. 转换为 quantengine 期望的格式
3. 调用 SignalEngine.scan 批量扫描
4. 持久化到 signal_runs + signal_results 表
5. 提供查询接口给 decision router

注意：quantengine signal 字段已统一使用大写
STRONG_BUY / BUY / HOLD / SELL / STRONG_SELL / AVOID
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from backend.config import QUANT_PROJECTS_ROOT
from backend.models import Stock, DailyBar, Watchlist, WatchlistItem
from backend.models.signal import SignalRun, SignalResult


# ============ 动态导入 quantengine ============

def _ensure_quantengine_on_path() -> None:
    """把 quantengine 项目根目录加入 sys.path（仅一次）"""
    p = str(QUANT_PROJECTS_ROOT / "quantengine")
    if p not in sys.path:
        sys.path.insert(0, p)


_ensure_quantengine_on_path()

try:
    from quantengine.core.signal import SignalEngine, TradingSignal  # type: ignore
    _QUANTENGINE_AVAILABLE = True
except Exception as e:  # 导入失败时不阻断服务
    SignalEngine = None  # type: ignore
    TradingSignal = None  # type: ignore
    _QUANTENGINE_AVAILABLE = False
    _IMPORT_ERROR = str(e)


# ============ K 线加载 ============

def load_klines_for_stock(
    db: Session,
    stock_id: int,
    days: int = 90,
) -> List[Dict[str, Any]]:
    """拉取某股票最近 days 个交易日的 K 线，转换为 quantengine 格式

    quantengine 期望：list of dict(date/open/high/low/close/volume/amount)
    """
    rows = (
        db.query(DailyBar)
        .filter(DailyBar.stock_id == stock_id)
        .order_by(DailyBar.trade_date.desc())
        .limit(days)
        .all()
    )
    if not rows:
        return []

    # 反序为升序（旧→新），quantengine 用末尾数据计算
    rows = list(reversed(rows))
    return [
        {
            "date": r.trade_date.isoformat() if r.trade_date else "",
            "open": float(r.open or 0),
            "high": float(r.high or 0),
            "low": float(r.low or 0),
            "close": float(r.close or 0),
            "volume": int(r.volume or 0),
            "amount": float(r.amount or 0),
        }
        for r in rows
    ]


def load_stocks_for_scan(
    db: Session,
    scope: str = "all",
    watchlist_id: Optional[int] = None,
    min_amount: float = 0,
    fresh_days: int = 7,
    limit: Optional[int] = None,
) -> List[Stock]:
    """获取待扫描的股票列表

    scope:
      - all: 全市场（is_st=0, status=1）
      - watchlist: 指定 watchlist_id 的成分股
      - main: 主板（沪+深，排除创业板/科创板/北交所）

    min_amount: 最近一个交易日成交额下限（单位：元，过滤低流动性）
    fresh_days: 要求最近 fresh_days 天内有 K 线数据
    """
    q = db.query(Stock).filter(Stock.is_st == 0, Stock.status == 1)

    if scope == "watchlist" and watchlist_id:
        # join watchlist_items
        wl_items = (
            db.query(WatchlistItem)
            .filter(WatchlistItem.watchlist_id == watchlist_id)
            .all()
        )
        stock_ids = [it.stock_id for it in wl_items]
        if not stock_ids:
            return []
        q = q.filter(Stock.id.in_(stock_ids))
    elif scope == "main":
        q = q.filter(Stock.market.in_(["SH", "SZ"]))
        q = q.filter(Stock.board == "main")

    stocks = q.all()

    # 过滤低流动性 + 最近有数据
    cutoff = date.today() - timedelta(days=fresh_days)
    result: List[Stock] = []
    for s in stocks:
        last_bar = (
            db.query(DailyBar)
            .filter(DailyBar.stock_id == s.id)
            .order_by(DailyBar.trade_date.desc())
            .first()
        )
        if not last_bar:
            continue
        if last_bar.trade_date < cutoff:
            continue
        if min_amount > 0 and (last_bar.amount or 0) < min_amount:
            continue
        result.append(s)
        if limit and len(result) >= limit:
            break

    return result


# ============ 扫描执行 ============

def run_signal_scan(
    db: Session,
    user_id: int,
    scope: str = "all",
    watchlist_id: Optional[int] = None,
    top_n: int = 20,
    min_score: float = 55.0,
    min_amount: float = 20_000_000.0,
    only_buy: bool = True,
    fresh_days: int = 7,
    atr_stop_k: float = 2.0,
    rr_ratio: float = 2.0,
    kline_days: int = 90,
    scan_all_limit: Optional[int] = 800,
) -> Dict[str, Any]:
    """执行一次扫描

    Returns:
        {
            "run_id": int,
            "as_of_date": str,
            "scanned": int,
            "matched": int,
            "top": List[SignalResult dict],
            "summary": {...},
        }
    """
    if not _QUANTENGINE_AVAILABLE:
        return {
            "error": "quantengine 不可用",
            "detail": _IMPORT_ERROR,
            "scanned": 0,
            "matched": 0,
        }

    # 1. 取股票池
    limit = scan_all_limit if scope == "all" else None
    stocks = load_stocks_for_scan(
        db, scope=scope, watchlist_id=watchlist_id,
        min_amount=min_amount, fresh_days=fresh_days, limit=limit,
    )
    if not stocks:
        return {
            "run_id": 0,
            "scanned": 0,
            "matched": 0,
            "message": "无符合条件的股票",
        }

    # 2. 构建 stocks_data
    stocks_data: Dict[str, List[Dict[str, Any]]] = {}
    stock_map: Dict[str, Stock] = {}
    for s in stocks:
        klines = load_klines_for_stock(db, s.id, days=kline_days)
        if len(klines) < 20:
            continue
        # 用 code 作为 key（剥离后缀，与 quantengine 习惯一致）
        code_key = s.code.split(".")[0] if "." in s.code else s.code
        stocks_data[code_key] = klines
        stock_map[code_key] = s

    if not stocks_data:
        return {
            "run_id": 0,
            "scanned": 0,
            "matched": 0,
            "message": "K 线数据不足",
        }

    # 3. 调用 SignalEngine.scan
    filters: Dict[str, Any] = {"min_score": min_score}
    if only_buy:
        # STRONG_BUY / BUY 视为买入信号
        filters["signal"] = ["STRONG_BUY", "BUY"]

    signals: List[TradingSignal] = SignalEngine.scan(stocks_data, filters=filters)  # type: ignore[arg-type]

    # 4. 创建 SignalRun
    today = date.today()
    run = SignalRun(
        name=f"scan_{scope}_{today.isoformat()}",
        as_of_date=today,
        scanned=len(stocks_data),
        matched=len(signals),
        summary_json=json.dumps({
            "scope": scope,
            "watchlist_id": watchlist_id,
            "min_score": min_score,
            "min_amount": min_amount,
            "only_buy": only_buy,
            "fresh_days": fresh_days,
            "atr_stop_k": atr_stop_k,
            "rr_ratio": rr_ratio,
        }, ensure_ascii=False),
        created_by=user_id,
    )
    db.add(run)
    db.flush()  # 拿 run.id

    # 5. 持久化 Top N 结果
    top_signals = signals[:top_n]
    results_to_save: List[SignalResult] = []
    for rank, sg in enumerate(top_signals, start=1):
        stock = stock_map.get(sg.stock_code)
        trade_plan = sg.trade_plan.to_dict() if sg.trade_plan else None
        action_text = _build_action_text(sg, trade_plan)
        results_to_save.append(SignalResult(
            run_id=run.id,
            stock_id=stock.id if stock else 0,
            code=stock.code if stock else sg.stock_code,
            name=stock.name if stock else "",
            signal=sg.signal,
            score=float(sg.score),
            confidence=_score_to_confidence(sg.score),
            close_price=_safe_get_close(stocks_data.get(sg.stock_code)),
            entry_price=trade_plan.get("entry_price") if trade_plan else None,
            stop_loss=trade_plan.get("stop_loss") if trade_plan else None,
            take_profit=trade_plan.get("take_profit") if trade_plan else None,
            position_pct=trade_plan.get("position_pct") if trade_plan else 0,
            action_text=action_text,
            reasons_json=json.dumps({"dimensions": sg.dimensions}, ensure_ascii=False),
            detail_json=json.dumps({"trade_plan": trade_plan}, ensure_ascii=False) if trade_plan else None,
            rank_no=rank,
        ))
    if results_to_save:
        db.bulk_save_objects(results_to_save)
    db.commit()

    return {
        "run_id": run.id,
        "as_of_date": today.isoformat(),
        "scanned": len(stocks_data),
        "matched": len(signals),
        "saved": len(top_signals),
        "top": [_result_to_dict(r) for r in results_to_save],
        "summary": {
            "scope": scope,
            "only_buy": only_buy,
            "min_score": min_score,
        },
    }


# ============ 查询接口 ============

def get_today_decision(db: Session) -> Dict[str, Any]:
    """今日决策：取当天最近一次 run 的结果，分 buy/sell/top 三组"""
    today = date.today()
    run = (
        db.query(SignalRun)
        .filter(SignalRun.as_of_date == today)
        .order_by(SignalRun.created_at.desc())
        .first()
    )
    if not run:
        return {
            "as_of_date": today.isoformat(),
            "has_data": False,
            "message": "今日尚未扫描，请点击「一键扫描」",
            "buy": [],
            "sell": [],
            "top": [],
            "last_run": None,
        }

    results = (
        db.query(SignalResult)
        .filter(SignalResult.run_id == run.id)
        .order_by(SignalResult.rank_no.asc())
        .all()
    )

    buy_signals = [r for r in results if r.signal in ("STRONG_BUY", "BUY")]
    sell_signals = [r for r in results if r.signal in ("STRONG_SELL", "SELL")]
    hold_signals = [r for r in results if r.signal == "HOLD"]

    return {
        "as_of_date": today.isoformat(),
        "has_data": True,
        "last_run": {
            "run_id": run.id,
            "name": run.name,
            "scanned": run.scanned,
            "matched": run.matched,
            "created_at": run.created_at.isoformat() if run.created_at else None,
        },
        "buy": [_result_to_dict(r) for r in buy_signals],
        "sell": [_result_to_dict(r) for r in sell_signals],
        "top": [_result_to_dict(r) for r in results[:10]],
        "summary": {
            "buy_count": len(buy_signals),
            "sell_count": len(sell_signals),
            "hold_count": len(hold_signals),
            "total_saved": len(results),
        },
    }


def get_history_runs(
    db: Session, page: int = 1, page_size: int = 20
) -> Dict[str, Any]:
    """历史扫描记录列表"""
    q = db.query(SignalRun).order_by(SignalRun.created_at.desc())
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "data": [
            {
                "id": r.id,
                "name": r.name,
                "as_of_date": r.as_of_date.isoformat() if r.as_of_date else None,
                "scanned": r.scanned,
                "matched": r.matched,
                "created_by": r.created_by,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


def get_run_detail(db: Session, run_id: int) -> Dict[str, Any]:
    """单次扫描结果详情"""
    run = db.query(SignalRun).filter(SignalRun.id == run_id).first()
    if not run:
        return {"error": "运行记录不存在", "run_id": run_id}

    results = (
        db.query(SignalResult)
        .filter(SignalResult.run_id == run_id)
        .order_by(SignalResult.rank_no.asc())
        .all()
    )

    summary = json.loads(run.summary_json) if run.summary_json else {}

    return {
        "run_id": run.id,
        "name": run.name,
        "as_of_date": run.as_of_date.isoformat() if run.as_of_date else None,
        "scanned": run.scanned,
        "matched": run.matched,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "summary": summary,
        "results": [_result_to_dict(r) for r in results],
    }


def get_stock_history(db: Session, code: str) -> Dict[str, Any]:
    """个股历史信号记录

    code 形如 "000001" 或 "000001.SZ" 都接受
    """
    code_key = code.split(".")[0] if "." in code else code
    rows = (
        db.query(SignalResult)
        .filter(SignalResult.code.like(f"%{code_key}%"))
        .order_by(SignalResult.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        "code": code_key,
        "count": len(rows),
        "history": [_result_to_dict(r) for r in rows],
    }


# ============ 工具函数 ============

def _result_to_dict(r: SignalResult) -> Dict[str, Any]:
    return {
        "id": r.id,
        "run_id": r.run_id,
        "rank_no": r.rank_no,
        "code": r.code,
        "name": r.name,
        "signal": r.signal,
        "score": r.score,
        "confidence": r.confidence,
        "close_price": r.close_price,
        "entry_price": r.entry_price,
        "stop_loss": r.stop_loss,
        "take_profit": r.take_profit,
        "position_pct": r.position_pct,
        "action_text": r.action_text,
        "reasons": json.loads(r.reasons_json) if r.reasons_json else None,
        "detail": json.loads(r.detail_json) if r.detail_json else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _build_action_text(sg: TradingSignal, trade_plan: Optional[Dict[str, Any]]) -> str:
    """根据信号+交易计划生成一句话行动指引"""
    sig_label = {
        "STRONG_BUY": "强烈买入",
        "BUY": "买入",
        "HOLD": "持有",
        "SELL": "卖出",
        "STRONG_SELL": "强烈卖出",
        "AVOID": "回避",
    }.get(sg.signal, sg.signal)

    if not trade_plan:
        return f"{sig_label}｜评分 {sg.score:.1f}"

    entry = trade_plan.get("entry_price")
    sl = trade_plan.get("stop_loss")
    tp = trade_plan.get("take_profit")
    pos = trade_plan.get("position_pct", 0) * 100
    return (
        f"{sig_label}｜评分 {sg.score:.1f}｜"
        f"入场 {entry} 止损 {sl} 止盈 {tp}｜建议仓位 {pos:.1f}%"
    )


def _score_to_confidence(score: float) -> int:
    """评分 → 置信度（0-100）"""
    if score >= 90:
        return 95
    elif score >= 70:
        return 80
    elif score >= 55:
        return 65
    elif score >= 40:
        return 50
    elif score >= 20:
        return 35
    return 20


def _safe_get_close(klines: Optional[List[Dict[str, Any]]]) -> Optional[float]:
    if not klines:
        return None
    return klines[-1].get("close")


def is_quantengine_available() -> bool:
    """供 router 检查引擎可用性"""
    return _QUANTENGINE_AVAILABLE
