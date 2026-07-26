"""模拟组合 / 持仓 / 委托 / 成交 / 权益"""
from sqlalchemy import (
    Column, Integer, BigInteger, String, SmallInteger, Date, DateTime, Float,
    ForeignKey, UniqueConstraint, Index, func,
)
from sqlalchemy.orm import relationship

from .base import Base


class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    user_id = Column(Integer, default=0)
    initial_cash = Column(Float, default=1_000_000.0)
    cash = Column(Float, default=1_000_000.0)
    status = Column(SmallInteger, default=1)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(),
                        onupdate=func.current_timestamp())

    positions = relationship("PortfolioPosition", back_populates="portfolio",
                             cascade="all, delete-orphan")
    orders = relationship("PortfolioOrder", back_populates="portfolio",
                          cascade="all, delete-orphan")
    fills = relationship("PortfolioFill", back_populates="portfolio",
                         cascade="all, delete-orphan")
    equity_curve = relationship("PortfolioEquity", back_populates="portfolio",
                                cascade="all, delete-orphan")


class PortfolioPosition(Base):
    __tablename__ = "portfolio_positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    stock_id = Column(Integer, nullable=False)
    code = Column(String(16), nullable=False)
    name = Column(String(64), default="")
    qty = Column(Integer, default=0)
    available_qty = Column(Integer, default=0, comment="可卖数量T+1")
    cost = Column(Float, default=0)

    portfolio = relationship("Portfolio", back_populates="positions")

    __table_args__ = (
        UniqueConstraint("portfolio_id", "stock_id", name="uk_pf_stock"),
    )


class PortfolioOrder(Base):
    __tablename__ = "portfolio_orders"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    stock_id = Column(Integer, nullable=False)
    code = Column(String(16), nullable=False)
    side = Column(String(8), nullable=False)  # buy / sell
    order_price = Column(Float, nullable=False)
    qty = Column(Integer, nullable=False)
    status = Column(String(16), default="filled")
    message = Column(String(255), default="")
    created_at = Column(DateTime, server_default=func.current_timestamp())

    portfolio = relationship("Portfolio", back_populates="orders")

    __table_args__ = (
        Index("idx_po_pf", "portfolio_id"),
    )


class PortfolioFill(Base):
    __tablename__ = "portfolio_fills"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    order_id = Column(BigInteger, nullable=True)
    stock_id = Column(Integer, nullable=False)
    code = Column(String(16), nullable=False)
    name = Column(String(64), default="")
    side = Column(String(8), nullable=False)
    price = Column(Float, nullable=False)
    qty = Column(Integer, nullable=False)
    amount = Column(Float, nullable=False)
    commission = Column(Float, default=0)
    stamp_tax = Column(Float, default=0)
    fee = Column(Float, default=0)
    trade_date = Column(Date, nullable=False)
    created_at = Column(DateTime, server_default=func.current_timestamp())

    portfolio = relationship("Portfolio", back_populates="fills")

    __table_args__ = (
        Index("idx_pfills_pf", "portfolio_id"),
    )


class PortfolioEquity(Base):
    __tablename__ = "portfolio_equity"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    trade_date = Column(Date, nullable=False)
    equity = Column(Float, nullable=False)
    cash = Column(Float, nullable=False)
    market_value = Column(Float, nullable=False)

    portfolio = relationship("Portfolio", back_populates="equity_curve")

    __table_args__ = (
        UniqueConstraint("portfolio_id", "trade_date", name="uk_pf_date"),
    )
