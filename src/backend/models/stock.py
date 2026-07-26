"""股票池 / 交易日历 / 日K线 / 同步日志"""
from sqlalchemy import (
    Column, Integer, BigInteger, String, SmallInteger, Date, DateTime, Float,
    ForeignKey, UniqueConstraint, Index, func,
)
from sqlalchemy.orm import relationship

from .base import Base


class Stock(Base):
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(16), unique=True, nullable=False, comment="如 000001.SZ")
    name = Column(String(64), default="")
    market = Column(String(8), default="SZ")  # SH / SZ / BJ
    board = Column(String(16), default="main")  # main/gem/star/bse
    industry = Column(String(64), default="")
    list_date = Column(Date, nullable=True)
    is_st = Column(SmallInteger, default=0)
    status = Column(SmallInteger, default=1, comment="1正常 0退市/停用")
    remark = Column(String(255), default="")
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(),
                        onupdate=func.current_timestamp())

    bars = relationship("DailyBar", back_populates="stock",
                        cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_market", "market"),
        Index("idx_status", "status"),
    )


class TradeCalendar(Base):
    __tablename__ = "trade_calendar"

    id = Column(Integer, primary_key=True, autoincrement=True)
    calendar_date = Column(Date, unique=True, nullable=False)
    is_open = Column(SmallInteger, default=1)
    remark = Column(String(64), default="")


class DailyBar(Base):
    __tablename__ = "daily_bars"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    stock_id = Column(Integer, ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    trade_date = Column(Date, nullable=False)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(BigInteger, default=0)
    amount = Column(Float, default=0)
    pre_close = Column(Float, nullable=True)
    adj_factor = Column(Float, default=1.0)
    created_at = Column(DateTime, server_default=func.current_timestamp())

    stock = relationship("Stock", back_populates="bars")

    __table_args__ = (
        UniqueConstraint("stock_id", "trade_date", name="uk_stock_date"),
        Index("idx_date", "trade_date"),
    )


class SyncLog(Base):
    __tablename__ = "sync_logs"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    source = Column(String(32), default="eastmoney")
    code = Column(String(16), default="")
    status = Column(String(16), nullable=False)
    message = Column(String(500), default="")
    bars_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.current_timestamp())

    __table_args__ = (
        Index("idx_sync_created", "created_at"),
        Index("idx_sync_status_created", "status", "created_at"),
        Index("idx_sync_code_created", "code", "created_at"),
    )
