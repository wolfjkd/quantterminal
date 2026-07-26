"""全A动向 service

基于 daily_bars 最新交易日的全市场统计：
  - 涨跌分布：涨停/跌停/涨>5%/跌>5%/涨/跌/平
  - 成交额 / 换手率
  - 板块（industry）涨跌平均
  - 板块（board：main/gem/star）统计
  - 近 N 日涨跌家数趋势
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List

from sqlalchemy import func, case, and_
from sqlalchemy.orm import Session

from backend.models import Stock, DailyBar


# 指数代码（如果在 stocks 表里就展示）
INDEX_CODES = [
    "000001.SH",  # 上证指数
    "399001.SZ",  # 深证成指
    "399006.SZ",  # 创业板指
    "000300.SH",  # 沪深300
    "000905.SH",  # 中证500
    "000852.SH",  # 中证1000
]


def _latest_trade_date(db: Session) -> date | None:
    """最新有数据的交易日"""
    r = db.query(func.max(DailyBar.trade_date)).scalar()
    return r


def overview(db: Session) -> Dict[str, Any]:
    """全A动向总览"""
    latest = _latest_trade_date(db)
    if latest is None:
        return {
            "latest_date": None,
            "indices": [],
            "distribution": {},
            "total_amount": 0,
            "total_volume": 0,
            "active_stocks": 0,
            "sector_stats": [],
            "board_stats": [],
            "trend": [],
        }

    # 当日所有股票 bar（排除指数，指数 code 以 000/399 开头但 .SH/.SZ）
    # 简单处理：取所有 stock_id 对应的 bar
    bars = (
        db.query(DailyBar, Stock)
        .join(Stock, DailyBar.stock_id == Stock.id)
        .filter(DailyBar.trade_date == latest, Stock.status == 1)
        .all()
    )

    # 涨跌分布
    up = 0
    down = 0
    flat = 0
    limit_up = 0
    limit_down = 0
    up_gt5 = 0
    down_gt5 = 0
    total_amount = 0.0
    total_volume = 0

    for bar, stock in bars:
        if bar.pre_close is None or bar.pre_close <= 0:
            continue
        chg = (bar.close - bar.pre_close) / bar.pre_close
        total_amount += float(bar.amount or 0)
        total_volume += int(bar.volume or 0)

        # 涨跌停判断
        limit = 0.2 if stock.board in ("gem", "star") else 0.1
        if stock.is_st:
            limit = 0.05

        if chg > 0:
            up += 1
            if chg >= limit - 0.001:
                limit_up += 1
            elif chg >= 0.05:
                up_gt5 += 1
        elif chg < 0:
            down += 1
            if chg <= -limit + 0.001:
                limit_down += 1
            elif chg <= -0.05:
                down_gt5 += 1
        else:
            flat += 1

    active = up + down + flat

    # 指数行情
    indices = _indices(db, latest)

    # 板块统计（按 industry）
    sector_stats = _sector_stats(bars)

    # 板块统计（按 board）
    board_stats = _board_stats(bars)

    # 近 20 日涨跌家数趋势
    trend = _trend(db, latest, 20)

    return {
        "latest_date": latest.isoformat(),
        "indices": indices,
        "distribution": {
            "up": up,
            "down": down,
            "flat": flat,
            "limit_up": limit_up,
            "limit_down": limit_down,
            "up_gt5": up_gt5,
            "down_gt5": down_gt5,
            "active": active,
        },
        "total_amount": round(total_amount, 2),
        "total_volume": total_volume,
        "active_stocks": active,
        "sector_stats": sector_stats,
        "board_stats": board_stats,
        "trend": trend,
    }


def _indices(db: Session, latest: date) -> List[Dict[str, Any]]:
    """指数行情"""
    result: List[Dict[str, Any]] = []
    for code in INDEX_CODES:
        stock = db.query(Stock).filter_by(code=code).first()
        if not stock:
            continue
        bar = db.query(DailyBar).filter_by(stock_id=stock.id, trade_date=latest).first()
        if not bar:
            # 取最新一条
            bar = db.query(DailyBar).filter_by(stock_id=stock.id).order_by(DailyBar.trade_date.desc()).first()
        if not bar:
            continue
        chg = 0.0
        chg_pct = 0.0
        if bar.pre_close and bar.pre_close > 0:
            chg = float(bar.close) - float(bar.pre_close)
            chg_pct = chg / float(bar.pre_close)
        result.append({
            "code": stock.code,
            "name": stock.name,
            "close": float(bar.close),
            "pre_close": float(bar.pre_close) if bar.pre_close else None,
            "change": round(chg, 4),
            "change_pct": round(chg_pct, 4),
            "volume": int(bar.volume or 0),
            "amount": float(bar.amount or 0),
        })
    return result


def _sector_stats(bars) -> List[Dict[str, Any]]:
    """按 industry 聚合涨跌幅"""
    buckets: Dict[str, List[float]] = {}
    for bar, stock in bars:
        ind = stock.industry or "未分类"
        if bar.pre_close is None or bar.pre_close <= 0:
            continue
        chg = (bar.close - bar.pre_close) / bar.pre_close
        buckets.setdefault(ind, []).append(chg)

    stats: List[Dict[str, Any]] = []
    for ind, chgs in buckets.items():
        if not chgs:
            continue
        avg = sum(chgs) / len(chgs)
        up_n = sum(1 for c in chgs if c > 0)
        down_n = sum(1 for c in chgs if c < 0)
        stats.append({
            "industry": ind,
            "count": len(chgs),
            "avg_change": round(avg, 4),
            "up_count": up_n,
            "down_count": down_n,
        })
    stats.sort(key=lambda x: x["avg_change"], reverse=True)
    return stats[:30]  # 前 30


def _board_stats(bars) -> List[Dict[str, Any]]:
    """按 board 聚合"""
    buckets: Dict[str, List[float]] = {}
    for bar, stock in bars:
        b = stock.board or "main"
        if bar.pre_close is None or bar.pre_close <= 0:
            continue
        chg = (bar.close - bar.pre_close) / bar.pre_close
        buckets.setdefault(b, []).append(chg)

    board_name = {"main": "主板", "gem": "创业板", "star": "科创板", "bse": "北交所"}
    stats: List[Dict[str, Any]] = []
    for b, chgs in buckets.items():
        if not chgs:
            continue
        avg = sum(chgs) / len(chgs)
        stats.append({
            "board": b,
            "board_name": board_name.get(b, b),
            "count": len(chgs),
            "avg_change": round(avg, 4),
            "up_count": sum(1 for c in chgs if c > 0),
            "down_count": sum(1 for c in chgs if c < 0),
        })
    return stats


def _trend(db: Session, latest: date, days: int) -> List[Dict[str, Any]]:
    """近 N 日涨跌家数趋势"""
    start = latest - timedelta(days=days + 15)  # 多取一些过滤非交易日
    rows = (
        db.query(
            DailyBar.trade_date,
            func.sum(case((DailyBar.close > DailyBar.pre_close, 1), else_=0)).label("up"),
            func.sum(case((DailyBar.close < DailyBar.pre_close, 1), else_=0)).label("down"),
            func.sum(case((DailyBar.close == DailyBar.pre_close, 1), else_=0)).label("flat"),
            func.sum(DailyBar.amount).label("amount"),
        )
        .filter(DailyBar.trade_date >= start, DailyBar.trade_date <= latest)
        .group_by(DailyBar.trade_date)
        .order_by(DailyBar.trade_date.asc())
        .all()
    )
    return [
        {
            "date": r.trade_date.isoformat(),
            "up": int(r.up or 0),
            "down": int(r.down or 0),
            "flat": int(r.flat or 0),
            "amount": round(float(r.amount or 0), 2),
        }
        for r in rows[-days:]
    ]


def sectors(db: Session) -> Dict[str, Any]:
    """板块行情（与 overview 的 sector_stats 相同，独立接口给前端用）"""
    latest = _latest_trade_date(db)
    if latest is None:
        return {"data": [], "latest_date": None}
    bars = (
        db.query(DailyBar, Stock)
        .join(Stock, DailyBar.stock_id == Stock.id)
        .filter(DailyBar.trade_date == latest, Stock.status == 1)
        .all()
    )
    return {"data": _sector_stats(bars), "latest_date": latest.isoformat()}
