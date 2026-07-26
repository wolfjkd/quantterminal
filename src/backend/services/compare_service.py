"""双核对比 service

双核心股票同时跑 SignalEngine 分析，对比评分。

双核心来源（优先级）：
  1. system_settings 表 key='focus_stocks'（JSON 数组，每项 {code, name, note}）
  2. 默认 watchlist_id=2（核心策略池）
  3. 硬编码默认：002178.SZ 延华智能 + 002697.SZ 红旗连锁

API：
  GET /compare                  取双核心对比数据
  GET /compare/stocks/{code}    单股详细分析
  PUT /compare/focus            更新双核心配置
"""
from __future__ import annotations

import json
from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.models import Stock, DailyBar, WatchlistItem, SystemSetting
from backend.models.signal import SignalRun, SignalResult
from backend.services import signal_service


# ============ 默认双核心 ============

DEFAULT_FOCUS_STOCKS = [
    {"code": "002178.SZ", "name": "延华智能", "note": "核心标的", "color": "#22d3ee"},
    {"code": "002697.SZ", "name": "红旗连锁", "note": "核心标的", "color": "#818cf8"},
]


def get_focus_stocks(db: Session) -> List[Dict[str, str]]:
    """从 system_settings 取双核心配置，没有则用默认"""
    s = db.query(SystemSetting).filter(SystemSetting.setting_key == "focus_stocks").first()
    if s and s.setting_value:
        try:
            data = json.loads(s.setting_value)
            if isinstance(data, list) and len(data) >= 2:
                return data
        except Exception:
            pass
    return DEFAULT_FOCUS_STOCKS


def set_focus_stocks(db: Session, stocks: List[Dict[str, str]]) -> None:
    """更新双核心配置"""
    s = db.query(SystemSetting).filter(SystemSetting.setting_key == "focus_stocks").first()
    if not s:
        s = SystemSetting(setting_key="focus_stocks",
                         setting_value=json.dumps(stocks, ensure_ascii=False),
                         remark="双核心配置")
        db.add(s)
    else:
        s.setting_value = json.dumps(stocks, ensure_ascii=False)
    db.commit()


# ============ 单股分析 ============

def analyze_stock(db: Session, code: str, name: str = "", note: str = "", color: str = "#22d3ee") -> Dict[str, Any]:
    """SignalEngine::analyzeStock

    返回结构：
      {
        "meta": {code, name, note, color},
        "stock": {id, code, name, market, board, industry, ...},
        "analysis": {signal, score, confidence, trade_plan, dimensions},
        "bars": [{date, close, high, low, volume}, ...],  # 最近 80 根
        "dims": [{label, value}, ...],  # 6 维度雷达图用
        "stats": {range_pos, hh, ll, dist_stop, dist_tp},
      }
    """
    stock = db.query(Stock).filter(Stock.code == code).first()
    if not stock:
        return {
            "meta": {"code": code, "name": name, "note": note, "color": color},
            "stock": None,
            "analysis": None,
            "bars": [],
            "dims": [],
            "stats": None,
            "message": f"股票 {code} 不在数据库",
        }

    # 取最近 90 根 K 线（多取 10 根保证指标计算）
    bars = (
        db.query(DailyBar)
        .filter(DailyBar.stock_id == stock.id)
        .order_by(DailyBar.trade_date.desc())
        .limit(90)
        .all()
    )
    bars = list(reversed(bars))

    if len(bars) < 20:
        return {
            "meta": {"code": code, "name": name, "note": note, "color": color},
            "stock": _stock_to_dict(stock),
            "analysis": None,
            "bars": [],
            "dims": [],
            "stats": None,
            "message": "K 线数据不足",
        }

    # 调用 quantengine SignalEngine.analyze
    klines = [
        {
            "date": b.trade_date.isoformat() if b.trade_date else "",
            "open": float(b.open or 0), "high": float(b.high or 0),
            "low": float(b.low or 0), "close": float(b.close or 0),
            "volume": int(b.volume or 0), "amount": float(b.amount or 0),
        }
        for b in bars
    ]

    if not signal_service.is_quantengine_available():
        return {
            "meta": {"code": code, "name": name, "note": note, "color": color},
            "stock": _stock_to_dict(stock),
            "analysis": None,
            "bars": [_bar_to_dict(b) for b in bars[-80:]],
            "dims": [],
            "stats": None,
            "message": "quantengine 不可用",
        }

    from quantengine.core.signal import SignalEngine  # type: ignore
    sg = SignalEngine.analyze(code, klines)

    # 6 维度雷达图
    dim_labels = [
        ("trend", "趋势"), ("momentum", "动量"), ("volume", "量能"),
        ("rsi", "摆动"), ("risk", "风控"), ("pattern", "形态"),
    ]
    dims = [
        {"label": lab, "value": round(float(sg.dimensions.get(k, 50)), 1)}
        for k, lab in dim_labels
    ]

    # 统计指标
    trade_plan = sg.trade_plan.to_dict() if sg.trade_plan else None
    close = float(bars[-1].close or 0)
    highs = [float(b.high or 0) for b in bars]
    lows = [float(b.low or 0) for b in bars]
    hh = max(highs) if highs else close
    ll = min(lows) if lows else close
    range_pos = ((close - ll) / (hh - ll)) if (hh > ll) else 0.5

    stats = None
    if trade_plan:
        stop = float(trade_plan.get("stop_loss", 0))
        tp = float(trade_plan.get("take_profit", 0))
        stats = {
            "range_pos": round(range_pos, 3),
            "hh": round(hh, 2),
            "ll": round(ll, 2),
            "dist_stop": round((close - stop) / close, 4) if close > 0 else 0,
            "dist_tp": round((tp - close) / close, 4) if close > 0 else 0,
        }

    return {
        "meta": {"code": code, "name": name or stock.name, "note": note, "color": color},
        "stock": _stock_to_dict(stock),
        "analysis": {
            "signal": sg.signal,
            "score": float(sg.score),
            "confidence": signal_service._score_to_confidence(sg.score),
            "close": close,
            "trade_plan": trade_plan,
            "dimensions": sg.dimensions,
        },
        "bars": [_bar_to_dict(b) for b in bars[-80:]],
        "dims": dims,
        "stats": stats,
    }


# ============ 双核对比 ============

def get_compare_overview(db: Session) -> Dict[str, Any]:
    """双核心全屏对比：返回两只股票的分析 + 对比结论"""
    focus = get_focus_stocks(db)
    cards: List[Dict[str, Any]] = []
    for f in focus[:2]:  # 只取前两只作为双核心
        card = analyze_stock(
            db, code=f["code"], name=f.get("name", ""),
            note=f.get("note", ""), color=f.get("color", "#22d3ee"),
        )
        cards.append(card)

    # 对比结论
    compare = None
    if len(cards) >= 2 and cards[0]["analysis"] and cards[1]["analysis"]:
        a, b = cards[0]["analysis"], cards[1]["analysis"]
        sa, sb = float(a["score"]), float(b["score"])
        total = sa + sb
        compare = {
            "bias": round(sa / total * 100, 1) if total > 0 else 50,
            "diff": round(abs(sa - sb), 1),
            "summary": (
                "评分接近，均衡观察" if abs(sa - sb) < 5
                else f"{a if sa > sb else b} 更强"  # type: ignore
            ),
            "winner": cards[0]["meta"]["name"] if sa > sb else cards[1]["meta"]["name"],
            "scores": {"a": sa, "b": sb},
        }

    return {
        "focus_stocks": focus[:2],
        "cards": cards,
        "compare": compare,
        "as_of_date": date.today().isoformat(),
    }


def get_stock_detail(db: Session, code: str) -> Dict[str, Any]:
    """单股详细分析（用于对比页点击展开）"""
    return analyze_stock(db, code=code)


# ============ 工具函数 ============

def _stock_to_dict(s: Stock) -> Dict[str, Any]:
    return {
        "id": s.id, "code": s.code, "name": s.name,
        "market": s.market, "board": s.board, "industry": s.industry,
        "is_st": s.is_st, "status": s.status,
        "list_date": s.list_date.isoformat() if s.list_date else None,
    }


def _bar_to_dict(b: DailyBar) -> Dict[str, Any]:
    return {
        "date": b.trade_date.isoformat() if b.trade_date else "",
        "open": float(b.open or 0), "high": float(b.high or 0),
        "low": float(b.low or 0), "close": float(b.close or 0),
        "volume": int(b.volume or 0), "amount": float(b.amount or 0),
    }
