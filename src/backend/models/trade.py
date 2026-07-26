"""交易计划 / 交易笔记"""
from sqlalchemy import (
    Column, Integer, String, Date, DateTime, Float,
    Index, func,
)

from .base import Base


class TradePlan(Base):
    __tablename__ = "trade_plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer, nullable=False)
    stock_id = Column(Integer, nullable=False)
    code = Column(String(16), nullable=False)
    name = Column(String(64), default="")
    entry_price = Column(Float, nullable=False)
    stop_loss = Column(Float, nullable=False)
    take_profit = Column(Float, nullable=False)
    qty = Column(Integer, default=0)
    position_pct = Column(Float, default=0)
    status = Column(String(16), default="open")
    source = Column(String(32), default="desk")
    close_reason = Column(String(64), nullable=True)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    closed_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_tp_pf_status", "portfolio_id", "status"),
        Index("idx_tp_stock_status", "stock_id", "status"),
        Index("idx_tp_created", "created_at"),
    )


class TradeNote(Base):
    __tablename__ = "trade_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, default=0)
    code = Column(String(16), default="")
    content = Column(String(500), nullable=False)
    created_at = Column(DateTime, server_default=func.current_timestamp())

    __table_args__ = (
        Index("idx_tn_created", "created_at"),
        Index("idx_tn_user_created", "user_id", "created_at"),
        Index("idx_tn_code_created", "code", "created_at"),
    )
