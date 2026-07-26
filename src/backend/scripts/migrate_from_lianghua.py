"""数据迁移脚本：lianghua MariaDB → QuantTerminal SQLite

迁移内容：
- stocks         (5067 只)
- daily_bars     (85527 条 K线)
- trade_calendar
- watchlists + watchlist_items (双核心 watchlists)
- users / system_settings / factors / strategies (基础种子)
- signal_runs / signal_results (历史信号，便于操盘台直接展示)

用法：
    python -m backend.scripts.migrate_from_lianghua

注意：本脚本会清空 SQLite 中已存在的同名表数据，避免主键冲突。
"""
import sys
import time
from pathlib import Path
from typing import Iterator

# 支持直接运行：把 src 目录（backend 父目录）加入 sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from backend.database import engine, SessionLocal, Base
from backend.models import (
    User, SystemSetting, AuditLog,
    Stock, TradeCalendar, DailyBar, SyncLog,
    Factor, FactorRun, FactorRunResult,
    Strategy, BacktestJob, BacktestEquity, BacktestTrade, BacktestPosition,
    Portfolio, PortfolioPosition, PortfolioOrder, PortfolioFill, PortfolioEquity,
    Watchlist, WatchlistItem,
    SignalRun, SignalResult,
    TradePlan, TradeNote,
)
from backend.config import LEGACY_MYSQL_URL
from backend.services.auth_service import pwd_context


# ============ 源库连接（MariaDB 只读） ============

src_engine = create_engine(LEGACY_MYSQL_URL, echo=False, future=True)


def fetch_rows(src_db: Session, sql: str, batch: int = 1000) -> Iterator[dict]:
    """流式拉取，避免一次性 85527 行内存爆炸"""
    result = src_db.execute(text(sql).execution_options(stream_results=True))
    keys = list(result.keys())
    while True:
        rows = result.fetchmany(batch)
        if not rows:
            break
        for row in rows:
            yield dict(zip(keys, row))


# ============ 表迁移 ============

def migrate_users(dst: Session, src: Session, table: str = "users", model_cls=None) -> int:
    """用户：admin 哈希兼容（$2y$ → $2b$），其他用户原样迁移"""
    rows = src.execute(text(
        "SELECT id, username, password, realname, role, phone, status, "
        "created_at, updated_at FROM users"
    )).mappings().all()
    cnt = 0
    for r in rows:
        pwd = r["password"] or ""
        # 若是 PHP bcrypt，原样保留（auth_service.verify_password 会做 $2y$→$2b$ 转换）
        # 若是明文，转 bcrypt
        if not pwd.startswith("$2y$") and not pwd.startswith("$2b$"):
            pwd = pwd_context.hash(pwd)
        dst.add(User(
            id=r["id"], username=r["username"], password=pwd,
            realname=r["realname"] or "", role=r["role"],
            phone=r["phone"] or "", status=r["status"],
            created_at=r["created_at"], updated_at=r["updated_at"],
        ))
        cnt += 1
    dst.commit()
    return cnt


def migrate_simple_table(dst: Session, src: Session, table: str, model_cls) -> int:
    """通用单表迁移（字段一一对应）"""
    rows = src.execute(text(f"SELECT * FROM {table}")).mappings().all()
    cnt = 0
    for r in rows:
        d = dict(r)
        # 移除 MySQL 特有字段（如无）
        for k in list(d.keys()):
            if k.startswith("_"):
                d.pop(k)
        dst.add(model_cls(**d))
        cnt += 1
    dst.commit()
    return cnt


def migrate_stocks(dst: Session, src: Session, table: str = "stocks", model_cls=None) -> int:
    rows = src.execute(text(
        "SELECT id, code, name, market, board, industry, list_date, is_st, status, "
        "remark, created_at, updated_at FROM stocks"
    )).mappings().all()
    cnt = 0
    for r in rows:
        dst.add(Stock(
            id=r["id"], code=r["code"], name=r["name"] or "",
            market=r["market"], board=r["board"],
            industry=r["industry"] or "", list_date=r["list_date"],
            is_st=r["is_st"], status=r["status"],
            remark=r["remark"] or "",
            created_at=r["created_at"], updated_at=r["updated_at"],
        ))
        cnt += 1
    dst.commit()
    return cnt


def migrate_daily_bars(dst: Session, src: Session, table: str = "daily_bars", model_cls=None) -> int:
    """85527 条 K线，分批提交"""
    sql = (
        "SELECT id, stock_id, trade_date, open, high, low, close, volume, "
        "amount, pre_close, adj_factor, created_at FROM daily_bars"
    )
    cnt = 0
    batch_buf = []
    BATCH = 2000

    for r in fetch_rows(src, sql, batch=BATCH):
        batch_buf.append(DailyBar(
            id=r["id"], stock_id=r["stock_id"], trade_date=r["trade_date"],
            open=float(r["open"]), high=float(r["high"]),
            low=float(r["low"]), close=float(r["close"]),
            volume=int(r["volume"]), amount=float(r["amount"]),
            pre_close=float(r["pre_close"]) if r["pre_close"] is not None else None,
            adj_factor=float(r["adj_factor"]),
            created_at=r["created_at"],
        ))
        cnt += 1
        if len(batch_buf) >= BATCH:
            dst.bulk_save_objects(batch_buf)
            dst.commit()
            batch_buf.clear()
            print(f"  ... 已迁移 {cnt} 条 K线")

    if batch_buf:
        dst.bulk_save_objects(batch_buf)
        dst.commit()
    return cnt


def migrate_signal_results(dst: Session, src: Session, table: str = "signal_results", model_cls=None) -> int:
    """signal_results 含 mediumtext detail_json，单独流式处理"""
    sql = (
        "SELECT id, run_id, stock_id, code, name, `signal`, score, confidence, "
        "close_price, entry_price, stop_loss, take_profit, position_pct, "
        "action_text, reasons_json, detail_json, rank_no, created_at FROM signal_results"
    )
    cnt = 0
    batch_buf = []
    BATCH = 1000

    for r in fetch_rows(src, sql, batch=BATCH):
        batch_buf.append(SignalResult(
            id=r["id"], run_id=r["run_id"], stock_id=r["stock_id"],
            code=r["code"], name=r["name"] or "",
            signal=r["signal"],  # 保持大写 STRONG_BUY/BUY/HOLD/SELL/STRONG_SELL
            score=float(r["score"]) if r["score"] is not None else 0,
            confidence=int(r["confidence"]) if r["confidence"] is not None else 0,
            close_price=float(r["close_price"]) if r["close_price"] is not None else None,
            entry_price=float(r["entry_price"]) if r["entry_price"] is not None else None,
            stop_loss=float(r["stop_loss"]) if r["stop_loss"] is not None else None,
            take_profit=float(r["take_profit"]) if r["take_profit"] is not None else None,
            position_pct=float(r["position_pct"]) if r["position_pct"] is not None else 0,
            action_text=r["action_text"] or "",
            reasons_json=r["reasons_json"],
            detail_json=r["detail_json"],
            rank_no=int(r["rank_no"]) if r["rank_no"] is not None else 0,
            created_at=r["created_at"],
        ))
        cnt += 1
        if len(batch_buf) >= BATCH:
            dst.bulk_save_objects(batch_buf)
            dst.commit()
            batch_buf.clear()
            print(f"  ... 已迁移 {cnt} 条 signal_results")

    if batch_buf:
        dst.bulk_save_objects(batch_buf)
        dst.commit()
    return cnt


# ============ 主流程 ============

TABLES_IN_ORDER = [
    # (中文名, 表名, 模型, 迁移函数-or-None)
    ("用户",          "users",              User,              migrate_users),
    ("系统参数",      "system_settings",    SystemSetting,     migrate_simple_table),
    ("审计日志",      "audit_logs",         AuditLog,          migrate_simple_table),
    ("股票池",        "stocks",             Stock,             migrate_stocks),
    ("交易日历",      "trade_calendar",     TradeCalendar,     migrate_simple_table),
    ("日K线",         "daily_bars",         DailyBar,          migrate_daily_bars),
    ("因子定义",      "factors",            Factor,            migrate_simple_table),
    ("因子运行",      "factor_runs",        FactorRun,         migrate_simple_table),
    ("因子结果",      "factor_run_results", FactorRunResult,   migrate_simple_table),
    ("策略",          "strategies",         Strategy,          migrate_simple_table),
    ("回测任务",      "backtest_jobs",      BacktestJob,       migrate_simple_table),
    ("回测权益",      "backtest_equity",    BacktestEquity,    migrate_simple_table),
    ("回测成交",      "backtest_trades",    BacktestTrade,     migrate_simple_table),
    ("回测持仓",      "backtest_positions", BacktestPosition,  migrate_simple_table),
    ("模拟组合",      "portfolios",         Portfolio,         migrate_simple_table),
    ("模拟持仓",      "portfolio_positions", PortfolioPosition, migrate_simple_table),
    ("模拟委托",      "portfolio_orders",   PortfolioOrder,    migrate_simple_table),
    ("模拟成交",      "portfolio_fills",    PortfolioFill,     migrate_simple_table),
    ("模拟权益",      "portfolio_equity",   PortfolioEquity,   migrate_simple_table),
    ("自选池",        "watchlists",         Watchlist,         migrate_simple_table),
    ("自选池成分",    "watchlist_items",    WatchlistItem,     migrate_simple_table),
    ("同步日志",      "sync_logs",          SyncLog,           migrate_simple_table),
    ("信号任务",      "signal_runs",        SignalRun,         migrate_simple_table),
    ("信号结果",      "signal_results",     SignalResult,      migrate_signal_results),
    ("交易计划",      "trade_plans",        TradePlan,         migrate_simple_table),
    ("交易笔记",      "trade_notes",        TradeNote,         migrate_simple_table),
]


def verify_counts(dst: Session, src: Session) -> dict:
    """核对每个表的源库行数 vs 目标库行数"""
    report = {}
    for cn, tbl, model, _ in TABLES_IN_ORDER:
        try:
            src_cnt = src.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
        except Exception as e:
            src_cnt = f"<err: {e}>"
        dst_cnt = dst.query(model).count()
        match = "✓" if src_cnt == dst_cnt else "✗"
        report[tbl] = (src_cnt, dst_cnt, match)
    return report


def main():
    print("=" * 60)
    print("lianghua MariaDB → QuantTerminal SQLite 数据迁移")
    print("=" * 60)

    print("\n[0/3] 初始化目标库结构...")
    Base.metadata.create_all(bind=engine)
    print("    ✓ 表结构已就绪")

    print("\n[1/3] 检查源库连通性...")
    try:
        with Session(src_engine) as src:
            r = src.execute(text("SELECT COUNT(*) c FROM stocks")).first()
            print(f"    ✓ 源库连接正常，stocks 表共 {r.c} 只")
    except Exception as e:
        print(f"    ✗ 源库连接失败：{e}")
        print("    请确认 MariaDB 已启动，且 lianghua 库可访问。")
        return 1

    print("\n[2/3] 开始迁移（26 张表）...")
    total_start = time.time()

    with Session(src_engine) as src, SessionLocal() as dst:
        for cn, tbl, model, fn in TABLES_IN_ORDER:
            # 清空目标表，避免主键冲突（顺序按依赖关系已排好）
            try:
                dst.query(model).delete()
                dst.commit()
            except Exception:
                dst.rollback()

            t0 = time.time()
            try:
                # fn 是 None 或自定义函数：统一签名 (dst, src, table, model)
                cnt = fn(dst, src, tbl, model)
                dt = time.time() - t0
                print(f"  ✓ {cn:<10s} {tbl:<22s} {cnt:>7d} 行  ({dt:.2f}s)")
            except Exception as e:
                dst.rollback()
                print(f"  ✗ {cn:<10s} {tbl:<22s} 失败：{e}")
                print(f"    跳过该表，继续后续迁移。")

    total_dt = time.time() - total_start
    print(f"\n迁移总耗时：{total_dt:.2f}s")

    print("\n[3/3] 核对源库 vs 目标库行数...")
    with Session(src_engine) as src, SessionLocal() as dst:
        report = verify_counts(dst, src)

    print("\n" + "-" * 60)
    print(f"{'表名':<22s} {'源库':>8s} {'目标':>8s} {'匹配':>6s}")
    print("-" * 60)
    all_ok = True
    for tbl, (s, d, m) in report.items():
        s_str = str(s) if isinstance(s, int) else s
        d_str = str(d)
        print(f"{tbl:<22s} {s_str:>8s} {d_str:>8s} {m:>6s}")
        if m == "✗":
            all_ok = False
    print("-" * 60)
    print(f"\n{'✓ 全部核对通过' if all_ok else '✗ 有表行数不一致，请检查'}")

    print("\n迁移完成。可启动后端：python -m backend.main")
    return 0 if all_ok else 2


if __name__ == "__main__":
    sys.exit(main())
