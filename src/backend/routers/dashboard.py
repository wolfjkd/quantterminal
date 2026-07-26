"""总览/全域指挥中心 router

聚合展示：
  - 市场总览（涨跌分布、最新交易日）
  - 数据健康度（股票总数、K线总数、新鲜度）
  - 自选股快照（最新价、涨跌）
  - 最近信号扫描（最新一次 SignalRun 的 Top）
  - 最近同步日志
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_

from backend.models import User, Stock, DailyBar, Watchlist, SignalRun, SignalResult, SyncLog
from backend.database import get_db
from backend.services.auth_service import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def dashboard_overview(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """总览页：市场总览 + 健康度 + 自选股 + 最近信号 + 同步日志"""
    return {
        "market": _market_overview(db),
        "health": _data_health(db),
        "watchlist": _watchlist_snapshot(db),
        "last_signal_run": _last_signal_run(db),
        "recent_sync": _recent_sync_logs(db, limit=5),
        "quick_stats": _quick_stats(db),
    }


# ============ 市场总览 ============

def _market_overview(db: Session) -> dict:
    """最近交易日的涨跌分布"""
    latest_date = db.query(func.max(DailyBar.trade_date)).scalar()
    if not latest_date:
        return {"ready": False, "latest_date": None}

    # 取最近交易日所有股票的涨跌幅（vs 前一交易日收盘价）
    prev_date = (
        db.query(func.max(DailyBar.trade_date))
        .filter(DailyBar.trade_date < latest_date)
        .scalar()
    )

    rows = db.query(DailyBar).filter(DailyBar.trade_date == latest_date).all()
    if not rows:
        return {"ready": False, "latest_date": latest_date.isoformat(), "prev_date": prev_date.isoformat() if prev_date else None}

    # 涨跌统计
    up = 0
    down = 0
    flat = 0
    limit_up = 0
    limit_down = 0
    total_amount = 0.0
    advances = []
    declines = []

    prev_close_map = {}
    if prev_date:
        prev_rows = db.query(DailyBar.stock_id, DailyBar.close).filter(DailyBar.trade_date == prev_date).all()
        prev_close_map = {r[0]: float(r[1]) for r in prev_rows}

    for bar in rows:
        close = float(bar.close or 0)
        prev_close = prev_close_map.get(bar.stock_id, 0)
        amount = float(bar.amount or 0)
        total_amount += amount

        if prev_close > 0:
            pct = (close - prev_close) / prev_close
            if pct > 0.001:
                up += 1
                if pct >= 0.095:
                    limit_up += 1
                advances.append({"code": bar.stock_id, "pct": pct, "amount": amount})
            elif pct < -0.001:
                down += 1
                if pct <= -0.095:
                    limit_down += 1
                declines.append({"code": bar.stock_id, "pct": pct, "amount": amount})
            else:
                flat += 1
        else:
            flat += 1

    # Top5 涨跌（按 code 找名字）
    advances.sort(key=lambda x: x["pct"], reverse=True)
    declines.sort(key=lambda x: x["pct"])

    top_advances = advances[:5]
    top_declines = declines[:5]

    def _enrich(items):
        codes = [item["code"] for item in items]
        if not codes:
            return []
        stocks = db.query(Stock).filter(Stock.id.in_(codes)).all()
        name_map = {s.id: (s.code, s.name) for s in stocks}
        out = []
        for item in items:
            info = name_map.get(item["code"])
            if info:
                out.append({
                    "code": info[0], "name": info[1],
                    "pct": round(item["pct"] * 100, 2),
                    "amount": round(item["amount"] / 1e8, 2),  # 亿
                })
        return out

    return {
        "ready": True,
        "latest_date": latest_date.isoformat(),
        "prev_date": prev_date.isoformat() if prev_date else None,
        "up": up, "down": down, "flat": flat,
        "limit_up": limit_up, "limit_down": limit_down,
        "total_amount_yi": round(total_amount / 1e8, 2),
        "top_advances": _enrich(top_advances),
        "top_declines": _enrich(top_declines),
    }


# ============ 数据健康度 ============

def _data_health(db: Session) -> dict:
    """数据健康度摘要"""
    from datetime import date, timedelta
    total_stocks = db.query(Stock).filter(Stock.is_st == 0, Stock.status == 1).count()
    total_bars = db.query(DailyBar).count()
    latest = db.query(func.max(DailyBar.trade_date)).scalar()
    cutoff = (latest or date.today()) - timedelta(days=7)
    fresh_stocks = (
        db.query(func.count(func.distinct(DailyBar.stock_id)))
        .filter(DailyBar.trade_date >= cutoff)
        .scalar() or 0
    )
    return {
        "total_stocks": total_stocks,
        "total_bars": total_bars,
        "latest_date": latest.isoformat() if latest else None,
        "fresh_stocks": fresh_stocks,
        "fresh_ratio": round(fresh_stocks / total_stocks, 3) if total_stocks else 0,
    }


# ============ 自选股快照 ============

def _watchlist_snapshot(db: Session, limit=10) -> list:
    """第一份自选股的快照（最新价）"""
    wl = db.query(Watchlist).order_by(Watchlist.id).first()
    if not wl:
        return []

    from backend.models import WatchlistItem
    items = (
        db.query(WatchlistItem, Stock)
        .join(Stock, WatchlistItem.stock_id == Stock.id)
        .filter(WatchlistItem.watchlist_id == wl.id)
        .limit(limit)
        .all()
    )
    if not items:
        return []

    stock_ids = [s.id for _, s in items]
    latest_date = db.query(func.max(DailyBar.trade_date)).scalar()

    out = []
    for item, stock in items:
        bar = (
            db.query(DailyBar)
            .filter(DailyBar.stock_id == stock.id)
            .order_by(DailyBar.trade_date.desc())
            .first()
        ) if latest_date else None
        out.append({
            "code": stock.code, "name": stock.name,
            "close": float(bar.close) if bar and bar.close else None,
            "pct_change": _calc_pct(db, stock.id, bar) if bar else None,
            "note": item.note or "",
        })
    return out


def _calc_pct(db: Session, stock_id: int, today_bar) -> float | None:
    if not today_bar or not today_bar.close:
        return None
    prev = (
        db.query(DailyBar.close)
        .filter(DailyBar.stock_id == stock_id, DailyBar.trade_date < today_bar.trade_date)
        .order_by(DailyBar.trade_date.desc())
        .first()
    )
    if not prev or not prev[0]:
        return None
    return round((float(today_bar.close) - float(prev[0])) / float(prev[0]) * 100, 2)


# ============ 最近信号扫描 ============

def _last_signal_run(db: Session) -> dict | None:
    run = db.query(SignalRun).order_by(SignalRun.created_at.desc()).first()
    if not run:
        return None
    top = (
        db.query(SignalResult)
        .filter(SignalResult.run_id == run.id)
        .order_by(SignalResult.rank_no.asc())
        .limit(5)
        .all()
    )
    return {
        "run_id": run.id,
        "name": run.name,
        "as_of_date": run.as_of_date.isoformat() if run.as_of_date else None,
        "scanned": run.scanned,
        "matched": run.matched,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "top": [
            {
                "code": r.code, "name": r.name,
                "signal": r.signal, "score": r.score,
                "close_price": r.close_price,
            }
            for r in top
        ],
    }


# ============ 最近同步日志 ============

def _recent_sync_logs(db: Session, limit=5) -> list:
    rows = db.query(SyncLog).order_by(SyncLog.id.desc()).limit(limit).all()
    return [
        {
            "id": r.id, "source": r.source, "code": r.code,
            "status": r.status, "message": r.message,
            "bars_count": r.bars_count,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# ============ 快速统计 ============

def _quick_stats(db: Session) -> dict:
    """顶部 KPI 卡片"""
    return {
        "total_stocks": db.query(Stock).filter(Stock.is_st == 0, Stock.status == 1).count(),
        "total_bars": db.query(DailyBar).count(),
        "total_signal_runs": db.query(SignalRun).count(),
        "total_sync_logs": db.query(SyncLog).count(),
    }
