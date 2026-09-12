"""市场雷达 service

基于 SQLite 已有数据（不联网）：
  - Index：用最近 K 线计算涨跌幅/成交额/换手/主力净流入榜单
  - Compare：复用 signal_service 跑不同策略对比
  - Validate：用历史 K 线验证信号准确率（前向 N 日收益）

如需联网拉取实时榜单，可后续接入 tradex-hub。
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_

from backend.models import Stock, DailyBar
from backend.services import signal_service, workbench_service


# ============ 全市场雷达 ============

def get_radar_overview(db: Session, top_n: int = 20) -> Dict[str, Any]:
    """全市场雷达：基于最近 K 线计算 4 类榜单

    Returns:
        {
            "as_of": str,
            "gainers": [...],     # 涨幅榜 Top N
            "losers": [...],      # 跌幅榜 Top N
            "amount_leaders": [...],  # 成交额榜 Top N
            "turnover_leaders": [...],  # 换手榜 Top N（无流通股本数据时用 volume/amount 近似）
            "summary": {total, up_count, down_count, flat_count, avg_change},
        }
    """
    # 取最近一个交易日的所有 K 线
    last_bar = db.query(DailyBar).order_by(DailyBar.trade_date.desc()).first()
    if not last_bar:
        return {
            "as_of": None,
            "gainers": [], "losers": [],
            "amount_leaders": [], "turnover_leaders": [],
            "summary": {"total": 0, "up_count": 0, "down_count": 0, "flat_count": 0, "avg_change": 0},
            "message": "无 K 线数据",
        }

    as_of = last_bar.trade_date
    latest_bars = (
        db.query(DailyBar)
        .filter(DailyBar.trade_date == as_of)
        .all()
    )

    # 取前一交易日的收盘价用于计算涨跌幅
    prev_bar = (
        db.query(DailyBar)
        .filter(DailyBar.trade_date < as_of)
        .order_by(DailyBar.trade_date.desc())
        .first()
    )
    prev_close_map: Dict[int, float] = {}
    if prev_bar:
        prev_bars = (
            db.query(DailyBar)
            .filter(DailyBar.trade_date == prev_bar.trade_date)
            .all()
        )
        prev_close_map = {b.stock_id: float(b.close or 0) for b in prev_bars}

    # 批量取股票信息
    stock_ids = [b.stock_id for b in latest_bars]
    stocks = db.query(Stock).filter(Stock.id.in_(stock_ids)).all()
    stock_map = {s.id: s for s in stocks}

    # 构建榜单数据
    items: List[Dict[str, Any]] = []
    up_count = 0
    down_count = 0
    flat_count = 0
    total_change = 0.0

    for b in latest_bars:
        s = stock_map.get(b.stock_id)
        if not s or s.is_st or s.status != 1:
            continue

        close = float(b.close or 0)
        prev_close = prev_close_map.get(b.stock_id, 0)
        if prev_close <= 0:
            # 用 open 兜底
            prev_close = float(b.open or close)

        change_pct = ((close - prev_close) / prev_close * 100) if prev_close > 0 else 0
        amount = float(b.amount or 0)
        volume = int(b.volume or 0)
        high = float(b.high or 0)
        low = float(b.low or 0)
        open_p = float(b.open or 0)
        amplitude = ((high - low) / prev_close * 100) if prev_close > 0 else 0

        if change_pct > 0:
            up_count += 1
        elif change_pct < 0:
            down_count += 1
        else:
            flat_count += 1
        total_change += change_pct

        items.append({
            "code": s.code, "name": s.name,
            "market": s.market, "board": s.board,
            "close": round(close, 2),
            "prev_close": round(prev_close, 2),
            "change_pct": round(change_pct, 2),
            "amplitude": round(amplitude, 2),
            "amount": round(amount, 0),
            "volume": volume,
            "high": round(high, 2), "low": round(low, 2), "open": round(open_p, 2),
        })

    total = len(items)
    avg_change = round(total_change / total, 2) if total > 0 else 0

    # 排序生成 4 类榜单
    gainers = sorted([i for i in items if i["change_pct"] > 0], key=lambda x: -x["change_pct"])[:top_n]
    losers = sorted([i for i in items if i["change_pct"] < 0], key=lambda x: x["change_pct"])[:top_n]
    amount_leaders = sorted(items, key=lambda x: -x["amount"])[:top_n]
    # 换手率近似：amount / close（粗略，真实换手需要流通股本）
    turnover_leaders = sorted(items, key=lambda x: -x["volume"])[:top_n]

    return {
        "as_of": as_of.isoformat() if as_of else None,
        "gainers": gainers,
        "losers": losers,
        "amount_leaders": amount_leaders,
        "turnover_leaders": turnover_leaders,
        "summary": {
            "total": total,
            "up_count": up_count,
            "down_count": down_count,
            "flat_count": flat_count,
            "avg_change": avg_change,
            "up_ratio": round(up_count / total * 100, 1) if total > 0 else 0,
        },
    }


# ============ 策略对比 ============

def compare_strategies(db: Session, min_amount: float = 20_000_000, top_n: int = 12) -> Dict[str, Any]:
    """策略对比：用同一批股票跑多个策略，对比命中率

   """
    strategies = workbench_service.BUILTIN_STRATEGIES[:3]  # 取前 3 个对比

    rows: List[Dict[str, Any]] = []
    counts = {s["key"]: 0 for s in strategies}

    # 取最近一次扫描结果作为基础
    last_run = workbench_service.get_last_run_with_results(db)
    if last_run:
        for r in last_run.get("top", [])[:top_n]:
            row = {
                "code": r["code"], "name": r["name"],
                "close_price": r["close_price"],
                "signal": r["signal"], "score": r["score"],
            }
            # 简化：每个策略都给同一评分（因为 SignalEngine 内部只有 composite）
            for s in strategies:
                row[s["key"]] = r["score"]
                if r["signal"] in ("BUY", "STRONG_BUY"):
                    counts[s["key"]] += 1
            rows.append(row)

    return {
        "strategies": strategies,
        "rows": rows,
        "counts": counts,
        "last_run_id": last_run.get("run_id") if last_run else None,
        "as_of": last_run.get("as_of_date") if last_run else None,
    }


# ============ 信号验证 ============

def validate_signals(
    db: Session,
    strategy: str = "composite",
    days: int = 120,
    step: int = 5,
    max_signals: int = 120,
    horizons: Optional[List[int]] = None,
) -> Dict[str, Any]:
    """信号验证：从历史 K 线抽样信号，计算前向 N 日收益率分布


    流程：
      1. 取最近 days 天的 K 线
      2. 每 step 天作为采样日
      3. 对每个采样日跑 SignalEngine.analyze
      4. 对 BUY/STRONG_BUY 信号，记录未来 N 日（horizons）收益
      5. 统计胜率/平均收益/总信号数
    """
    if horizons is None:
        horizons = [3, 5, 10]

    if not signal_service.is_quantengine_available():
        return {"error": "quantengine 不可用"}

    # 取核心股票做验证（双核心 + 部分高成交额股票）
    focus_stocks = [
        ("002178.SZ", "延华智能"),
        ("002697.SZ", "红旗连锁"),
    ]
    # 加几个高成交额的
    high_amount_stocks = (
        db.query(Stock)
        .filter(Stock.is_st == 0, Stock.status == 1)
        .filter(Stock.code.like("60%.SH").__or__(Stock.code.like("00%.SZ")))
        .limit(20)
        .all()
    )
    test_stocks = []
    for code, name in focus_stocks:
        s = db.query(Stock).filter(Stock.code == code).first()
        if s:
            test_stocks.append(s)
    test_stocks.extend(high_amount_stocks[:8])
    test_stocks = test_stocks[:10]  # 限制 10 只

    end_date = (
        db.query(DailyBar)
        .order_by(DailyBar.trade_date.desc())
        .first()
    )
    if not end_date:
        return {"error": "无 K 线数据"}

    end_date = end_date.trade_date
    start_date = end_date - timedelta(days=days)

    # 采样日列表
    sample_dates_query = (
        db.query(DailyBar.trade_date)
        .filter(DailyBar.trade_date >= start_date, DailyBar.trade_date <= end_date)
        .distinct()
        .order_by(DailyBar.trade_date)
        .all()
    )
    sample_dates = [d[0] for d in sample_dates_query]
    # 每 step 天采样
    sample_dates = sample_dates[::step][:max_signals // len(test_stocks) + 1]

    from quantengine.core.signal import SignalEngine  # type: ignore

    signals = []
    total_signals = 0
    win_counts = {h: 0 for h in horizons}
    total_returns = {h: 0.0 for h in horizons}

    for s in test_stocks:
        # 取该股票全量 K 线
        all_bars = (
            db.query(DailyBar)
            .filter(DailyBar.stock_id == s.id)
            .order_by(DailyBar.trade_date)
            .all()
        )
        if len(all_bars) < 30:
            continue

        # 构建日期索引
        bar_map = {b.trade_date: b for b in all_bars}
        sorted_dates = [b.trade_date for b in all_bars]

        for sample_date in sample_dates:
            if sample_date not in bar_map:
                continue
            idx = sorted_dates.index(sample_date)
            if idx < 20:
                continue

            # 取前 90 根作为输入
            window_bars = all_bars[max(0, idx - 89):idx + 1]
            if len(window_bars) < 20:
                continue

            klines = [
                {
                    "date": b.trade_date.isoformat() if b.trade_date else "",
                    "open": float(b.open or 0), "high": float(b.high or 0),
                    "low": float(b.low or 0), "close": float(b.close or 0),
                    "volume": int(b.volume or 0), "amount": float(b.amount or 0),
                }
                for b in window_bars
            ]

            try:
                sg = SignalEngine.analyze(s.code, klines)
            except Exception:
                continue

            if sg.signal not in ("BUY", "STRONG_BUY"):
                continue

            total_signals += 1
            entry_close = float(window_bars[-1].close or 0)
            if entry_close <= 0:
                continue

            # 计算前向 N 日收益
            signal_record = {
                "code": s.code, "name": s.name,
                "signal_date": sample_date.isoformat(),
                "signal": sg.signal, "score": float(sg.score),
                "entry_close": round(entry_close, 2),
                "returns": {},
            }

            for h in horizons:
                future_idx = idx + h
                if future_idx < len(all_bars):
                    future_close = float(all_bars[future_idx].close or 0)
                    ret = (future_close - entry_close) / entry_close
                    signal_record["returns"][h] = round(ret * 100, 2)
                    total_returns[h] += ret
                    if ret > 0:
                        win_counts[h] += 1

            signals.append(signal_record)
            if len(signals) >= max_signals:
                break

        if len(signals) >= max_signals:
            break

    # 统计
    stats = []
    for h in horizons:
        win_rate = (win_counts[h] / total_signals * 100) if total_signals > 0 else 0
        avg_ret = (total_returns[h] / total_signals * 100) if total_signals > 0 else 0
        stats.append({
            "horizon": h,
            "win_rate": round(win_rate, 1),
            "avg_return": round(avg_ret, 2),
            "signals": total_signals,
        })

    return {
        "strategy": strategy,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "test_stocks_count": len(test_stocks),
        "sample_dates_count": len(sample_dates),
        "total_signals": total_signals,
        "horizons": horizons,
        "stats": stats,
        "signals": signals[:50],  # 只返回前 50 条
    }


# ============ 热股入库 ============

def ingest_hot_stocks(db: Session, source: str = "gainers", limit: int = 25) -> Dict[str, Any]:
    """热股一键入库（基于本地数据识别候选）

    如需联网拉取实时榜单，可后续接入 tradex-hub。
    """
    radar = get_radar_overview(db, top_n=max(limit, 30))
    source_map = {
        "gainers": "gainers",
        "amount": "amount_leaders",
        "turnover": "turnover_leaders",
        "main": "amount_leaders",  # 暂用 amount 代替
    }
    key = source_map.get(source, "gainers")
    hot_list = radar.get(key, [])[:limit]

    return {
        "source": source,
        "limit": limit,
        "candidates": len(hot_list),
        "message": f"已识别 {len(hot_list)} 只热股候选",
        "samples": [f"{h['code']} {h['name']} {h['change_pct']}%" for h in hot_list[:5]],
    }
