"""因子中心 service

桥接 quantengine.FactorEngine（5类22因子）：
  - catalog: 因子目录 + 分类
  - score: 多因子加权打分选股
  - ic_analysis: 单因子 IC 分析
"""
from __future__ import annotations

import sys
from typing import Any, Dict, List

from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.config import QUANT_PROJECTS_ROOT
from backend.models import Stock, DailyBar


def _ensure_quantengine_on_path() -> None:
    p = str(QUANT_PROJECTS_ROOT / "quantengine")
    if p not in sys.path:
        sys.path.insert(0, p)


_ensure_quantengine_on_path()

try:
    from quantengine.core.factor import FactorEngine  # type: ignore
    _AVAILABLE = True
    _IMPORT_ERROR = ""
except Exception as e:
    FactorEngine = None  # type: ignore
    _AVAILABLE = False
    _IMPORT_ERROR = str(e)


# ============ 目录 ============

def catalog() -> Dict[str, Any]:
    """因子目录 + 分类 + 引擎可用性"""
    if not _AVAILABLE:
        return {"available": False, "error": _IMPORT_ERROR, "factors": {}, "categories": {}}
    return {
        "available": True,
        "factors": FactorEngine.catalog(),
        "categories": FactorEngine.get_categories(),
    }


def is_available() -> bool:
    return _AVAILABLE


# ============ 数据组装 ============

def _load_stocks_data(
    db: Session,
    limit: int = 1000,
    days: int = 60,
    board: str | None = None,
    industry: str | None = None,
    exclude_st: bool = True,
) -> Dict[str, List[Dict[str, Any]]]:
    """从 SQLite 拉股票 K 线，组装为 {code: [kline_dict, ...]}

    按 最新交易日成交额降序 取前 limit 只（有流动性的股票）
    """
    # 找最新交易日
    latest = db.query(func.max(DailyBar.trade_date)).scalar()
    if latest is None:
        return {}

    # 找该日有数据的股票，按成交额降序
    q = (
        db.query(DailyBar.stock_id, DailyBar.amount)
        .filter(DailyBar.trade_date == latest)
    )
    if exclude_st:
        q = q.join(Stock, DailyBar.stock_id == Stock.id).filter(Stock.is_st == 0)
    if board:
        if not exclude_st:
            q = q.join(Stock, DailyBar.stock_id == Stock.id)
        q = q.filter(Stock.board == board)
    if industry:
        if not (exclude_st or board):
            q = q.join(Stock, DailyBar.stock_id == Stock.id)
        q = q.filter(Stock.industry == industry)

    q = q.order_by(DailyBar.amount.desc()).limit(limit)
    stock_ids = [r[0] for r in q.all()]

    if not stock_ids:
        return {}

    # 拉这些股票近 days 日 K 线
    from datetime import timedelta
    start = latest - timedelta(days=days * 2)  # 多取一些过滤非交易日

    rows = (
        db.query(DailyBar, Stock)
        .join(Stock, DailyBar.stock_id == Stock.id)
        .filter(
            DailyBar.stock_id.in_(stock_ids),
            DailyBar.trade_date >= start,
        )
        .order_by(DailyBar.stock_id, DailyBar.trade_date.asc())
        .all()
    )

    stocks_data: Dict[str, List[Dict[str, Any]]] = {}
    for bar, stock in rows:
        code = stock.code
        stocks_data.setdefault(code, []).append({
            "date": bar.trade_date.isoformat(),
            "open": float(bar.open or 0),
            "high": float(bar.high or 0),
            "low": float(bar.low or 0),
            "close": float(bar.close or 0),
            "volume": int(bar.volume or 0),
            "amount": float(bar.amount or 0),
            "code": stock.code,
            "name": stock.name,
            "is_st": bool(stock.is_st),
            "board_type": stock.board,
        })
    return stocks_data


# ============ 打分 ============

def score(
    db: Session,
    factor_weights: Dict[str, float] | None = None,
    top_n: int = 20,
    filters: Dict[str, Any] | None = None,
    limit: int = 1000,
    board: str | None = None,
    industry: str | None = None,
) -> Dict[str, Any]:
    """多因子打分选股"""
    if not _AVAILABLE:
        return {"error": f"quantengine 不可用：{_IMPORT_ERROR}"}

    stocks_data = _load_stocks_data(db, limit=limit, board=board, industry=industry)
    if not stocks_data:
        return {"error": "无可用股票数据"}

    results = FactorEngine.score(stocks_data, factor_weights=factor_weights, filters=filters)

    # 补充股票名称
    codes = [r["stock_code"] for r in results[:top_n]]
    name_map = {
        s.code: s.name
        for s in db.query(Stock).filter(Stock.code.in_(codes)).all()
    }

    top = []
    for r in results[:top_n]:
        top.append({
            "rank": len(top) + 1,
            "code": r["stock_code"],
            "name": name_map.get(r["stock_code"], ""),
            "score": round(r["score"], 4),
            "close": round(r.get("close", 0), 2),
            "factor_scores": {
                k: round(v, 4) for k, v in r.get("factor_scores", {}).items()
            },
        })

    return {
        "data": top,
        "count": len(top),
        "total_scanned": len(stocks_data),
        "factor_weights": factor_weights or {},
    }


# ============ IC 分析 ============

def ic_analysis(
    db: Session,
    factor_code: str,
    limit: int = 500,
    period: int = 60,
) -> Dict[str, Any]:
    """单因子 IC 分析"""
    if not _AVAILABLE:
        return {"error": f"quantengine 不可用：{_IMPORT_ERROR}"}

    stocks_data = _load_stocks_data(db, limit=limit, days=period + 10)
    if not stocks_data:
        return {"error": "无可用股票数据"}

    result = FactorEngine.ic_analysis(factor_code, stocks_data, period=period)
    return result
