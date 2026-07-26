"""量化工作台 service

一站式工作台
  - 数据健康度（fresh / total / as_of）
  - 策略目录（6 个内置策略）
  - 最近一次扫描结果（buy / sell / top）
  - 一键准备行情（占位，暂不实现真实同步）
  - 运行策略选股（桥接 signal_service.run_signal_scan）
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from backend.models import Stock, DailyBar, Strategy
from backend.models.signal import SignalRun, SignalResult
from backend.services import signal_service


# ============ 内置策略目录 ============

BUILTIN_STRATEGIES = [
    {
        "key": "composite",
        "name": "综合策略",
        "type": "composite",
        "description": "6 维度综合评分（趋势/动量/量能/RSI/风控/形态），适合日常扫描",
        "min_score": 55,
        "top_n": 20,
    },
    {
        "key": "trend",
        "name": "趋势跟踪",
        "type": "trend",
        "description": "以趋势维度为主，捕捉中长期上涨标的",
        "min_score": 60,
        "top_n": 15,
    },
    {
        "key": "momentum",
        "name": "动量突破",
        "type": "momentum",
        "description": "动量维度为主，捕捉短期强势突破",
        "min_score": 65,
        "top_n": 10,
    },
    {
        "key": "reversal",
        "name": "超跌反转",
        "type": "reversal",
        "description": "RSI 超卖 + 量能放大，捕捉反弹机会",
        "min_score": 50,
        "top_n": 15,
    },
    {
        "key": "value",
        "name": "价值低估",
        "type": "value",
        "description": "低价+低波动，适合长期布局",
        "min_score": 50,
        "top_n": 20,
    },
    {
        "key": "volume",
        "name": "量价齐升",
        "type": "volume",
        "description": "量能放大 + 价格突破，资金活跃",
        "min_score": 60,
        "top_n": 15,
    },
]


def get_workbench_overview(db: Session, strategy: str = "composite") -> Dict[str, Any]:
    """工作台首页数据"""
    health = compute_data_health(db)
    catalog = get_strategy_catalog(db)
    last_run = get_last_run_with_results(db)

    return {
        "health": health,
        "strategies": catalog,
        "current_strategy": strategy,
        "last_run": last_run,
    }


def compute_data_health(db: Session) -> Dict[str, Any]:
    """数据健康度

    Returns:
        {
            "total_stocks": int,
            "fresh_stocks": int,  # 最近 7 天有 K 线
            "stale_stocks": int,
            "fresh_ratio": float,
            "as_of": str,  # 最近一次 K 线日期
            "ready": bool,  # fresh_stocks >= 10
            "total_bars": int,
            "oldest": str,
        }
    """
    total_stocks = db.query(Stock).filter(Stock.is_st == 0, Stock.status == 1).count()

    # 最近的 K 线日期
    last_bar = db.query(DailyBar).order_by(DailyBar.trade_date.desc()).first()
    as_of = last_bar.trade_date.isoformat() if last_bar and last_bar.trade_date else None

    # 新鲜股票数：最近 7 天有数据
    cutoff = date.today() - timedelta(days=7)
    fresh_q = (
        db.query(DailyBar.stock_id)
        .filter(DailyBar.trade_date >= cutoff)
        .distinct()
    )
    fresh_stocks = fresh_q.count()

    # 最老 K 线
    oldest_bar = db.query(DailyBar).order_by(DailyBar.trade_date.asc()).first()
    oldest = oldest_bar.trade_date.isoformat() if oldest_bar and oldest_bar.trade_date else None

    total_bars = db.query(DailyBar).count()

    return {
        "total_stocks": total_stocks,
        "fresh_stocks": fresh_stocks,
        "stale_stocks": max(0, total_stocks - fresh_stocks),
        "fresh_ratio": round(fresh_stocks / total_stocks, 3) if total_stocks > 0 else 0,
        "as_of": as_of,
        "oldest": oldest,
        "total_bars": total_bars,
        "ready": fresh_stocks >= 10,
    }


def get_strategy_catalog(db: Session) -> List[Dict[str, Any]]:
    """策略目录：内置 6 个 + 数据库自定义"""
    catalog = list(BUILTIN_STRATEGIES)

    # 合并数据库里的策略
    db_strategies = db.query(Strategy).filter(Strategy.status == 1).all()
    for s in db_strategies:
        catalog.append({
            "key": f"db_{s.id}",
            "name": s.name,
            "type": s.strategy_type,
            "description": s.remark or "",
            "min_score": 55,
            "top_n": 20,
            "params": json.loads(s.params_json) if s.params_json else None,
        })

    return catalog


def get_last_run_with_results(db: Session) -> Optional[Dict[str, Any]]:
    """最近一次扫描 + Top 30 / Buy 20 / Sell 10"""
    run = db.query(SignalRun).order_by(SignalRun.created_at.desc()).first()
    if not run:
        return None

    top = (
        db.query(SignalResult)
        .filter(SignalResult.run_id == run.id)
        .order_by(SignalResult.rank_no.asc())
        .limit(30)
        .all()
    )
    buy = (
        db.query(SignalResult)
        .filter(SignalResult.run_id == run.id,
                SignalResult.signal.in_(["BUY", "STRONG_BUY"]))
        .order_by(SignalResult.score.desc())
        .limit(20)
        .all()
    )
    sell = (
        db.query(SignalResult)
        .filter(SignalResult.run_id == run.id,
                SignalResult.signal.in_(["SELL", "STRONG_SELL"]))
        .order_by(SignalResult.score.asc())
        .limit(10)
        .all()
    )

    return {
        "run_id": run.id,
        "name": run.name,
        "as_of_date": run.as_of_date.isoformat() if run.as_of_date else None,
        "scanned": run.scanned,
        "matched": run.matched,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "top": [_result_to_dict(r) for r in top],
        "buy": [_result_to_dict(r) for r in buy],
        "sell": [_result_to_dict(r) for r in sell],
    }


def run_strategy(
    db: Session,
    user_id: int,
    strategy: str = "composite",
    top_n: int = 15,
    min_score: float = 55,
    min_amount: float = 20_000_000,
    only_buy: bool = True,
    fresh_days: int = 7,
    scan_all_limit: int = 800,
) -> Dict[str, Any]:
    """运行策略选股（桥接 signal_service.run_signal_scan）"""
    # 简化：所有内置策略都用 SignalEngine.scan，strategy key 仅作为 run.name 标识
    catalog_map = {s["key"]: s for s in BUILTIN_STRATEGIES}
    st_conf = catalog_map.get(strategy, BUILTIN_STRATEGIES[0])

    result = signal_service.run_signal_scan(
        db,
        user_id=user_id,
        scope="all",
        watchlist_id=None,
        top_n=top_n or st_conf["top_n"],
        min_score=min_score or st_conf["min_score"],
        min_amount=min_amount,
        only_buy=only_buy,
        fresh_days=fresh_days,
        scan_all_limit=scan_all_limit,
    )

    # 在 run.name 里标记策略
    if "run_id" in result and result["run_id"]:
        from backend.models.signal import SignalRun
        run = db.query(SignalRun).filter(SignalRun.id == result["run_id"]).first()
        if run:
            run.name = f"{st_conf['key']}_{run.as_of_date.isoformat() if run.as_of_date else ''}"
            db.commit()

    result["strategy"] = st_conf
    return result


def _result_to_dict(r: SignalResult) -> Dict[str, Any]:
    return {
        "id": r.id, "run_id": r.run_id, "rank_no": r.rank_no,
        "code": r.code, "name": r.name,
        "signal": r.signal, "score": r.score, "confidence": r.confidence,
        "close_price": r.close_price,
        "entry_price": r.entry_price, "stop_loss": r.stop_loss,
        "take_profit": r.take_profit, "position_pct": r.position_pct,
        "action_text": r.action_text,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
