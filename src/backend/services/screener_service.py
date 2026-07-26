"""条件选股 service

桥接 quantengine.Screener（5类30+条件）：
  - conditions: 可选条件清单 + 分类
  - screen: 多条件组合筛选
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
    from quantengine.core.screener import Screener  # type: ignore
    _AVAILABLE = True
    _IMPORT_ERROR = ""
except Exception as e:
    Screener = None  # type: ignore
    _AVAILABLE = False
    _IMPORT_ERROR = str(e)


# ============ 目录 ============

def conditions() -> Dict[str, Any]:
    """条件清单 + 分类 + 引擎可用性"""
    if not _AVAILABLE:
        return {"available": False, "error": _IMPORT_ERROR, "conditions": {}, "categories": {}}
    return {
        "available": True,
        "conditions": Screener.get_conditions(),
        "categories": Screener.get_categories(),
    }


def is_available() -> bool:
    return _AVAILABLE


# ============ 数据组装（复用 factor_service 思路） ============

def _load_stocks_data(
    db: Session,
    limit: int = 1000,
    days: int = 70,
    board: str | None = None,
    industry: str | None = None,
    exclude_st: bool = True,
) -> Dict[str, List[Dict[str, Any]]]:
    """从 SQLite 拉股票 K 线，组装为 {code: [kline_dict, ...]}"""
    latest = db.query(func.max(DailyBar.trade_date)).scalar()
    if latest is None:
        return {}

    q = db.query(DailyBar.stock_id, DailyBar.amount).filter(DailyBar.trade_date == latest)
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

    from datetime import timedelta
    start = latest - timedelta(days=days * 2)

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


# ============ 筛选 ============

def screen(
    db: Session,
    conditions: Dict[str, Dict[str, Any]] | None = None,
    filters: Dict[str, Any] | None = None,
    limit: int = 1000,
    board: str | None = None,
    industry: str | None = None,
    top_n: int = 100,
) -> Dict[str, Any]:
    """多条件组合筛选"""
    if not _AVAILABLE:
        return {"error": f"quantengine 不可用：{_IMPORT_ERROR}"}

    if not conditions:
        return {"error": "请至少选择一个条件"}

    stocks_data = _load_stocks_data(db, limit=limit, board=board, industry=industry)
    if not stocks_data:
        return {"error": "无可用股票数据"}

    results = Screener.screen(stocks_data, conditions, filters=filters)

    # 截取 Top N + 补充名称
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
            "close": round(r.get("close", 0), 2),
            "volume": r.get("volume", 0),
            "matched_conditions": r.get("matched_conditions", []),
        })

    return {
        "data": top,
        "count": len(top),
        "total_matched": len(results),
        "total_scanned": len(stocks_data),
        "conditions": conditions,
    }
