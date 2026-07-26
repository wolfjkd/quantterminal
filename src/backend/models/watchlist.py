"""自选池 / 成分"""
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, Index, func,
)
from sqlalchemy.orm import relationship

from .base import Base


class Watchlist(Base):
    __tablename__ = "watchlists"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    user_id = Column(Integer, default=0)
    remark = Column(String(255), default="")
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(),
                        onupdate=func.current_timestamp())

    items = relationship("WatchlistItem", back_populates="watchlist",
                         cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_user", "user_id"),
    )


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    watchlist_id = Column(Integer, ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False)
    stock_id = Column(Integer, nullable=False)
    code = Column(String(16), nullable=False)
    note = Column(String(255), default="")
    created_at = Column(DateTime, server_default=func.current_timestamp())

    watchlist = relationship("Watchlist", back_populates="items")

    __table_args__ = (
        UniqueConstraint("watchlist_id", "stock_id", name="uk_wl_stock"),
        Index("idx_stock", "stock_id"),
        Index("idx_code", "code"),
    )
