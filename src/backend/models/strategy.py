"""策略 / 回测任务 / 回测权益 / 回测成交 / 回测持仓"""
from sqlalchemy import (
    Column, Integer, BigInteger, String, SmallInteger, Date, DateTime, Float, Text,
    ForeignKey, UniqueConstraint, Index, func,
)
from sqlalchemy.orm import relationship

from .base import Base


class Strategy(Base):
    __tablename__ = "strategies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    strategy_type = Column(String(32), default="dual_ma")
    params_json = Column(Text)
    status = Column(SmallInteger, default=1)
    remark = Column(String(255), default="")
    created_by = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(),
                        onupdate=func.current_timestamp())


class BacktestJob(Base):
    __tablename__ = "backtest_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), default="")
    strategy_id = Column(Integer, nullable=True)
    strategy_type = Column(String(32), nullable=False)
    params_json = Column(Text)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    initial_cash = Column(Float, default=1_000_000.0)
    status = Column(String(16), default="pending")
    metrics_json = Column(Text)
    message = Column(String(500), default="")
    created_by = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    finished_at = Column(DateTime, nullable=True)

    equity = relationship("BacktestEquity", back_populates="job",
                           cascade="all, delete-orphan")
    trades = relationship("BacktestTrade", back_populates="job",
                          cascade="all, delete-orphan")
    positions = relationship("BacktestPosition", back_populates="job",
                             cascade="all, delete-orphan")


class BacktestEquity(Base):
    __tablename__ = "backtest_equity"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("backtest_jobs.id", ondelete="CASCADE"), nullable=False)
    trade_date = Column(Date, nullable=False)
    equity = Column(Float, nullable=False)
    cash = Column(Float, default=0)
    market_value = Column(Float, default=0)
    benchmark_equity = Column(Float, nullable=True)

    job = relationship("BacktestJob", back_populates="equity")

    __table_args__ = (
        UniqueConstraint("job_id", "trade_date", name="uk_job_date"),
        Index("idx_trade_date", "trade_date"),
    )


class BacktestTrade(Base):
    __tablename__ = "backtest_trades"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("backtest_jobs.id", ondelete="CASCADE"), nullable=False)
    trade_date = Column(Date, nullable=False)
    stock_id = Column(Integer, default=0)
    code = Column(String(16), nullable=False)
    name = Column(String(64), default="")
    side = Column(String(8), nullable=False)  # buy / sell
    price = Column(Float, nullable=False)
    qty = Column(Integer, nullable=False)
    amount = Column(Float, nullable=False)
    commission = Column(Float, default=0)
    stamp_tax = Column(Float, default=0)
    fee = Column(Float, default=0)
    pnl = Column(Float, nullable=True)
    reason = Column(String(255), default="")

    job = relationship("BacktestJob", back_populates="trades")

    __table_args__ = (
        Index("idx_job_date", "job_id", "trade_date"),
        Index("idx_job_code", "job_id", "code"),
    )


class BacktestPosition(Base):
    __tablename__ = "backtest_positions"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("backtest_jobs.id", ondelete="CASCADE"), nullable=False)
    stock_id = Column(Integer, nullable=False)
    code = Column(String(16), nullable=False)
    name = Column(String(64), default="")
    qty = Column(Integer, nullable=False)
    cost = Column(Float, nullable=False)
    close_price = Column(Float, nullable=True)

    job = relationship("BacktestJob", back_populates="positions")

    __table_args__ = (
        Index("idx_job", "job_id"),
    )
