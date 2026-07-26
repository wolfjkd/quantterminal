"""信号扫描任务 / 结果"""
from sqlalchemy import (
    Column, Integer, BigInteger, String, Date, DateTime, Float, Text,
    Index, func,
)

from .base import Base


class SignalRun(Base):
    __tablename__ = "signal_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), default="")
    as_of_date = Column(Date, nullable=False)
    scanned = Column(Integer, default=0)
    matched = Column(Integer, default=0)
    summary_json = Column(Text)
    created_by = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.current_timestamp())

    __table_args__ = (
        Index("idx_sr_as_of_date", "as_of_date"),
        Index("idx_sr_created", "created_at"),
    )


class SignalResult(Base):
    """`signal` 字段使用大写 STRONG_BUY/BUY/HOLD/SELL/STRONG_SELL"""
    __tablename__ = "signal_results"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    run_id = Column(Integer, nullable=False)
    stock_id = Column(Integer, nullable=False)
    code = Column(String(16), nullable=False)
    name = Column(String(64), default="")
    # 关键字段：保留大小写，使用反引号转义（SQLite/MySQL 兼容）
    signal = Column(String(16), nullable=False, comment="STRONG_BUY/BUY/HOLD/SELL/STRONG_SELL/AVOID")
    score = Column(Float, default=0)
    confidence = Column(Integer, default=0)
    close_price = Column(Float, nullable=True)
    entry_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    take_profit = Column(Float, nullable=True)
    position_pct = Column(Float, default=0)
    action_text = Column(String(500), default="")
    reasons_json = Column(Text)
    detail_json = Column(Text)
    rank_no = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.current_timestamp())

    __table_args__ = (
        Index("idx_sres_run_rank", "run_id", "rank_no"),
        Index("idx_sres_signal_score", "signal", "score"),
        Index("idx_sres_stock_created", "stock_id", "created_at"),
        Index("idx_sres_code", "code"),
    )
