"""实时分析 service

单股深度分析（基于 daily_bars，无实时行情源时用最新 bar 模拟"最新价"）：
  - 最新行情：close/open/high/low/volume/amount/pre_close
  - 涨跌 / 涨跌幅 / 振幅
  - 近 N 日统计：5/20/60 日涨跌幅、均价、波动率
  - 年内高低 / 年内涨跌
  - 近 60 日 K 线（给前端画 candlestick）
  - 近 20 日量能
"""
from __future__ import annotations

import math
from datetime import date
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.models import Stock, DailyBar


def stock_detail(db: Session, code: str) -> Dict[str, Any]:
    """单股深度分析"""
    stock = db.query(Stock).filter_by(code=code.upper()).first()
    if not stock:
        return {"error": f"股票不存在：{code}"}

    # 最新 bar
    latest_bar = (
        db.query(DailyBar)
        .filter(DailyBar.stock_id == stock.id)
        .order_by(DailyBar.trade_date.desc())
        .first()
    )
    if not latest_bar:
        return {"error": f"无行情数据：{code}"}

    # 近 60 日 K 线
    bars: List[DailyBar] = (
        db.query(DailyBar)
        .filter(DailyBar.stock_id == stock.id)
        .order_by(DailyBar.trade_date.desc())
        .limit(60)
        .all()
    )
    bars.reverse()  # 升序

    # 年内数据
    year_start = date(latest_bar.trade_date.year, 1, 1)
    year_bars = (
        db.query(DailyBar)
        .filter(DailyBar.stock_id == stock.id, DailyBar.trade_date >= year_start)
        .order_by(DailyBar.trade_date.asc())
        .all()
    )

    # 计算指标
    closes = [float(b.close) for b in bars]
    latest_close = float(latest_bar.close)
    pre_close = float(latest_bar.pre_close) if latest_bar.pre_close else None

    chg = 0.0
    chg_pct = 0.0
    if pre_close and pre_close > 0:
        chg = latest_close - pre_close
        chg_pct = chg / pre_close

    amplitude = 0.0  # 振幅
    if pre_close and pre_close > 0:
        amplitude = (float(latest_bar.high) - float(latest_bar.low)) / pre_close

    # 近 N 日涨跌幅
    def period_return(n: int) -> float | None:
        if len(closes) < n + 1:
            return None
        return closes[-1] / closes[-n - 1] - 1

    # 近 N 日均价
    def period_avg(n: int) -> float | None:
        if len(closes) < n:
            return None
        return sum(closes[-n:]) / n

    # 波动率（日收益率标准差 * sqrt(252)）
    def period_volatility(n: int) -> float | None:
        if len(closes) < n + 1:
            return None
        rets = []
        for i in range(len(closes) - n, len(closes)):
            if closes[i - 1] > 0:
                rets.append(closes[i] / closes[i - 1] - 1)
        if len(rets) < 2:
            return None
        avg = sum(rets) / len(rets)
        var = sum((r - avg) ** 2 for r in rets) / (len(rets) - 1)
        return math.sqrt(var) * math.sqrt(252)

    # 年内高低
    year_high = max(float(b.high) for b in year_bars) if year_bars else None
    year_low = min(float(b.low) for b in year_bars) if year_bars else None
    year_open = float(year_bars[0].open) if year_bars else None
    year_chg_pct = None
    if year_open and year_open > 0:
        year_chg_pct = latest_close / year_open - 1

    # 5/10/20/60 均线
    ma5 = period_avg(5)
    ma10 = period_avg(10)
    ma20 = period_avg(20)
    ma60 = period_avg(60)

    # K 线数据（前端画 candlestick）
    klines = [
        {
            "date": b.trade_date.isoformat(),
            "open": float(b.open),
            "close": float(b.close),
            "low": float(b.low),
            "high": float(b.high),
            "volume": int(b.volume or 0),
            "amount": float(b.amount or 0),
        }
        for b in bars
    ]

    return {
        "code": stock.code,
        "name": stock.name,
        "market": stock.market,
        "board": stock.board,
        "industry": stock.industry,
        "is_st": bool(stock.is_st),
        "latest_date": latest_bar.trade_date.isoformat(),
        "latest": {
            "open": float(latest_bar.open),
            "high": float(latest_bar.high),
            "low": float(latest_bar.low),
            "close": latest_close,
            "pre_close": pre_close,
            "volume": int(latest_bar.volume or 0),
            "amount": float(latest_bar.amount or 0),
            "change": round(chg, 4),
            "change_pct": round(chg_pct, 4),
            "amplitude": round(amplitude, 4),
        },
        "stats": {
            "ma5": round(ma5, 4) if ma5 else None,
            "ma10": round(ma10, 4) if ma10 else None,
            "ma20": round(ma20, 4) if ma20 else None,
            "ma60": round(ma60, 4) if ma60 else None,
            "ret_5d": round(period_return(5), 4) if period_return(5) is not None else None,
            "ret_20d": round(period_return(20), 4) if period_return(20) is not None else None,
            "ret_60d": round(period_return(60), 4) if period_return(60) is not None else None,
            "vol_20d": round(period_volatility(20), 4) if period_volatility(20) is not None else None,
            "vol_60d": round(period_volatility(60), 4) if period_volatility(60) is not None else None,
        },
        "year": {
            "high": year_high,
            "low": year_low,
            "open": year_open,
            "change_pct": round(year_chg_pct, 4) if year_chg_pct is not None else None,
            "days": len(year_bars),
        },
        "klines": klines,
    }
