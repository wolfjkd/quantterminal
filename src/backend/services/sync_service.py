"""行情同步 service

接入东方财富公开接口（push2his / push2）实现真实行情同步：
  - sync_stock_bars: 拉取单股日K线并写入 SQLite
  - sync_stock_list: 拉取全市场股票列表（股票池扩容）
  - sync_realtime: 实时报价快照（不写库）
  - list_logs / health / run / stock_refresh: 原有日志与健康度（保留向后兼容）
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models import Stock, DailyBar, SyncLog, TradeCalendar
from backend.services import market_data_service
from backend.services.audit_service import log_action


FRESH_DAYS = 3  # 3 天内有数据视为"新鲜"


def list_logs(
    db: Session,
    page: int = 1,
    page_size: int = 50,
    status: str | None = None,
    source: str | None = None,
) -> Dict[str, Any]:
    """同步日志列表"""
    q = db.query(SyncLog)
    if status:
        q = q.filter(SyncLog.status == status)
    if source:
        q = q.filter(SyncLog.source == source)
    total = q.count()
    rows = (
        q.order_by(SyncLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "data": [
            {
                "id": r.id,
                "source": r.source,
                "code": r.code,
                "status": r.status,
                "message": r.message,
                "bars_count": r.bars_count,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def health(db: Session) -> Dict[str, Any]:
    """数据健康度"""
    total_stocks = db.query(func.count(Stock.id)).filter(Stock.status == 1).scalar() or 0
    total_bars = db.query(func.count(DailyBar.id)).scalar() or 0
    latest_date = db.query(func.max(DailyBar.trade_date)).scalar()
    fresh_cutoff = (latest_date or date.today()) - timedelta(days=FRESH_DAYS)
    fresh_stocks = (
        db.query(func.count(func.distinct(DailyBar.stock_id)))
        .filter(DailyBar.trade_date >= fresh_cutoff)
        .scalar() or 0
    )

    # 按 source 统计日志
    by_source = (
        db.query(SyncLog.source, func.count(SyncLog.id))
        .group_by(SyncLog.source)
        .all()
    )
    # 按 status 统计
    by_status = (
        db.query(SyncLog.status, func.count(SyncLog.id))
        .group_by(SyncLog.status)
        .all()
    )

    return {
        "total_stocks": int(total_stocks),
        "total_bars": int(total_bars),
        "latest_date": latest_date.isoformat() if latest_date else None,
        "fresh_stocks": int(fresh_stocks),
        "fresh_days": FRESH_DAYS,
        "logs_by_source": {s: int(c) for s, c in by_source},
        "logs_by_status": {s: int(c) for s, c in by_status},
    }


def run(
    db: Session,
    user_id: int,
    stock_code: str = "",
    mode: str = "incremental",
) -> Dict[str, Any]:
    """触发同步

    quantterminal 无内置数据源，本接口：
      1. 记录同步尝试日志
      2. 如果指定 stock_code，检查该股票数据完整性
      3. 返回数据健康度
    """
    # 检查股票
    stock = None
    if stock_code:
        stock = db.query(Stock).filter_by(code=stock_code.upper()).first()

    if stock_code and not stock:
        # 写失败日志
        log = SyncLog(
            source="manual",
            code=stock_code.upper(),
            status="failed",
            message=f"股票不存在：{stock_code}",
            bars_count=0,
        )
        db.add(log)
        db.commit()
        return {"error": f"股票不存在：{stock_code}"}

    if stock:
        # 检查单股数据完整性
        latest = (
            db.query(DailyBar.trade_date)
            .filter(DailyBar.stock_id == stock.id)
            .order_by(DailyBar.trade_date.desc())
            .first()
        )
        count = (
            db.query(func.count(DailyBar.id))
            .filter(DailyBar.stock_id == stock.id)
            .scalar() or 0
        )
        latest_date = latest[0] if latest else None
        msg = f"{stock.code} {stock.name} 共 {count} 条 K 线，最新 {latest_date}"
        log = SyncLog(
            source="manual",
            code=stock.code,
            status="success",
            message=msg + "（嵌入式终端未接实时源，请用 trader-finance-hub 同步）",
            bars_count=count,
        )
        db.add(log)
        db.commit()
        log_action(db, user_id, "sync_run", f"check {stock.code} bars={count}")
        db.commit()
        return {
            "message": msg,
            "code": stock.code,
            "name": stock.name,
            "bars_count": count,
            "latest_date": latest_date.isoformat() if latest_date else None,
            "hint": "嵌入式终端未接实时数据源，如需拉新数据请通过 trader-finance-hub 同步后导出 SQLite",
        }

    # 全量同步尝试
    h = health(db)
    log = SyncLog(
        source="manual",
        code="",
        status="success" if h["total_bars"] > 0 else "failed",
        message=f"全量检查：{h['total_stocks']} 只股票 / {h['total_bars']} 条 K 线，最新 {h['latest_date']}",
        bars_count=h["total_bars"],
    )
    db.add(log)
    db.commit()
    log_action(db, user_id, "sync_run", f"full check stocks={h['total_stocks']}")
    db.commit()
    return {
        "message": "全量数据检查完成",
        "health": h,
        "hint": "嵌入式终端未接实时数据源，如需拉新数据请通过 trader-finance-hub 同步后导出 SQLite",
    }


def stock_refresh(db: Session, stock_id: int) -> Dict[str, Any]:
    """单股数据刷新检查"""
    stock = db.query(Stock).filter_by(id=stock_id).first()
    if not stock:
        return {"error": "股票不存在"}
    latest = (
        db.query(DailyBar.trade_date)
        .filter(DailyBar.stock_id == stock.id)
        .order_by(DailyBar.trade_date.desc())
        .first()
    )
    count = (
        db.query(func.count(DailyBar.id))
        .filter(DailyBar.stock_id == stock.id)
        .scalar() or 0
    )
    return {
        "code": stock.code,
        "name": stock.name,
        "bars_count": count,
        "latest_date": latest[0].isoformat() if latest else None,
    }


# ============ 东方财富真实行情同步 ============


def _parse_date(s: str) -> Optional[date]:
    """'2024-01-02' -> date；失败返回 None"""
    if not s or len(s) < 10:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _norm_date_param(s: str, default: str) -> str:
    """日期参数归一化为 YYYYMMDD

    接受：'20240101' / '2024-01-01' / ''（用 default）
    """
    s = (s or "").strip()
    if not s:
        return default
    digits = "".join(c for c in s if c.isdigit())
    if len(digits) == 8:
        return digits
    return default


def sync_stock_bars(
    db: Session,
    stock_code: str,
    beg_date: str = "",
    end_date: str = "",
    fqt: int = 1,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """拉取单股日K线并写入 SQLite

    - 通过 stock_code 找到 stock_id（如不存在则自动创建）
    - 调用 market_data_service.fetch_kline
    - upsert 到 daily_bars 表（按 stock_id + trade_date 唯一）
    - 写入 sync_logs 日志
    """
    if not stock_code:
        return {"success": False, "message": "stock_code 不能为空"}

    default_beg = (date.today() - timedelta(days=365)).strftime("%Y%m%d")
    beg = _norm_date_param(beg_date, default_beg)
    end = _norm_date_param(end_date, date.today().strftime("%Y%m%d"))

    bars, name, err = market_data_service.fetch_kline_full(stock_code, beg=beg, end=end, fqt=fqt)
    if err:
        # 写失败日志
        log = SyncLog(
            source="eastmoney",
            code=stock_code.upper(),
            status="failed",
            message=err[:500],
            bars_count=0,
        )
        db.add(log)
        db.commit()
        return {"success": False, "code": stock_code, "message": err}

    # 找到或创建 Stock
    num, market_str, full_code = market_data_service.parse_code(stock_code)
    board = market_data_service.detect_board(full_code)
    stock = db.query(Stock).filter_by(code=full_code).first()
    if not stock:
        stock = Stock(
            code=full_code,
            name=name or full_code,
            market=market_str,
            board=board,
            industry="",
            is_st=1 if ("ST" in (name or "") or "*ST" in (name or "")) else 0,
            status=1,
        )
        db.add(stock)
        db.flush()
    else:
        # 更新名称/市场/板块
        if name:
            stock.name = name
        stock.market = market_str
        stock.board = board
        stock.status = 1
        db.flush()

    # upsert daily_bars
    imported = 0
    last_date: Optional[date] = None
    last_close: Optional[float] = None
    try:
        for b in bars:
            d = _parse_date(b["date"])
            if d is None:
                continue
            existing = (
                db.query(DailyBar)
                .filter(DailyBar.stock_id == stock.id, DailyBar.trade_date == d)
                .first()
            )
            if existing:
                existing.open = b["open"]
                existing.high = b["high"]
                existing.low = b["low"]
                existing.close = b["close"]
                existing.volume = b["volume"]
                existing.amount = b["amount"]
                existing.pre_close = b["pre_close"]
                existing.adj_factor = b["adj_factor"]
            else:
                db.add(DailyBar(
                    stock_id=stock.id,
                    trade_date=d,
                    open=b["open"],
                    high=b["high"],
                    low=b["low"],
                    close=b["close"],
                    volume=b["volume"],
                    amount=b["amount"],
                    pre_close=b["pre_close"],
                    adj_factor=b["adj_factor"],
                ))
            imported += 1
            if last_date is None or d > last_date:
                last_date = d
                last_close = b["close"]

            # 顺带补交易日历
            cal_exists = db.query(TradeCalendar).filter_by(calendar_date=d).first()
            if not cal_exists:
                db.add(TradeCalendar(calendar_date=d, is_open=1))

        # 写成功日志
        msg = f"{stock.code} {stock.name} 同步 {imported} 条 K 线，最新 {last_date}"
        log = SyncLog(
            source="eastmoney",
            code=stock.code,
            status="success",
            message=msg[:500],
            bars_count=imported,
        )
        db.add(log)
        if user_id:
            log_action(db, user_id, "sync_bars", f"{stock.code} bars={imported}")
        db.commit()
        return {
            "success": True,
            "code": stock.code,
            "name": stock.name,
            "stock_id": stock.id,
            "imported": imported,
            "last_date": last_date.isoformat() if last_date else None,
            "last_close": last_close,
            "beg": beg,
            "end": end,
            "fqt": fqt,
            "message": msg,
        }
    except Exception as e:
        db.rollback()
        # 失败日志
        log = SyncLog(
            source="eastmoney",
            code=stock_code.upper(),
            status="failed",
            message=f"写库异常：{e}"[:500],
            bars_count=0,
        )
        db.add(log)
        db.commit()
        return {"success": False, "code": stock_code, "message": f"写库异常：{e}"}


def sync_stock_list(db: Session, user_id: Optional[int] = None) -> Dict[str, Any]:
    """拉取全市场股票列表并 upsert 到 stocks 表"""
    rows, err = market_data_service.fetch_stock_list()
    if err:
        log = SyncLog(
            source="eastmoney",
            code="",
            status="failed",
            message=err[:500],
            bars_count=0,
        )
        db.add(log)
        db.commit()
        return {"success": False, "message": err}

    new_count = 0
    updated_count = 0
    try:
        for r in rows:
            existing = db.query(Stock).filter_by(code=r["code"]).first()
            if existing:
                existing.name = r["name"]
                existing.market = r["market"]
                existing.board = r["board"]
                existing.is_st = r["is_st"]
                if r.get("industry"):
                    existing.industry = r["industry"]
                existing.status = 1
                updated_count += 1
            else:
                db.add(Stock(
                    code=r["code"],
                    name=r["name"],
                    market=r["market"],
                    board=r["board"],
                    industry=r.get("industry", "") or "",
                    is_st=r["is_st"],
                    status=1,
                ))
                new_count += 1
        db.flush()

        msg = f"全市场扩容：新增 {new_count}，更新 {updated_count}，合计 {len(rows)}"
        log = SyncLog(
            source="eastmoney",
            code="",
            status="success",
            message=msg[:500],
            bars_count=len(rows),
        )
        db.add(log)
        if user_id:
            log_action(db, user_id, "sync_stocks", msg)
        db.commit()
        return {
            "success": True,
            "total": len(rows),
            "new": new_count,
            "updated": updated_count,
            "message": msg,
        }
    except Exception as e:
        db.rollback()
        log = SyncLog(
            source="eastmoney",
            code="",
            status="failed",
            message=f"写库异常：{e}"[:500],
            bars_count=0,
        )
        db.add(log)
        db.commit()
        return {"success": False, "message": f"写库异常：{e}"}


def sync_realtime(stock_code: str) -> Dict[str, Any]:
    """实时报价快照（不写库，仅返回）"""
    quote, err = market_data_service.fetch_realtime_quote(stock_code)
    if err:
        return {"success": False, "code": stock_code, "message": err}
    quote["success"] = True
    return quote
