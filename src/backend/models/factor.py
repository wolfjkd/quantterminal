"""因子 / 因子运行 / 因子结果"""
from sqlalchemy import (
    Column, Integer, BigInteger, String, SmallInteger, Date, DateTime, Float, Text,
    ForeignKey, Index, func,
)
from sqlalchemy.orm import relationship

from .base import Base


class Factor(Base):
    __tablename__ = "factors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(32), unique=True, nullable=False)
    name = Column(String(64), nullable=False)
    formula_type = Column(String(32), default="builtin")
    params_json = Column(Text)
    default_weight = Column(Float, default=1.0)
    is_reverse = Column(SmallInteger, default=0)
    status = Column(SmallInteger, default=1)
    remark = Column(String(255), default="")
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(),
                        onupdate=func.current_timestamp())


class FactorRun(Base):
    __tablename__ = "factor_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), default="")
    as_of_date = Column(Date, nullable=False)
    weights_json = Column(Text, nullable=False)
    filters_json = Column(Text)
    universe_count = Column(Integer, default=0)
    top_n = Column(Integer, default=10)
    status = Column(String(16), default="done")
    created_by = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.current_timestamp())

    results = relationship("FactorRunResult", back_populates="run",
                           cascade="all, delete-orphan")


class FactorRunResult(Base):
    __tablename__ = "factor_run_results"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("factor_runs.id", ondelete="CASCADE"), nullable=False)
    stock_id = Column(Integer, nullable=False)
    code = Column(String(16), nullable=False)
    name = Column(String(64), default="")
    score = Column(Float, default=0)
    rank_no = Column(Integer, default=0)
    close_price = Column(Float, nullable=True)
    detail_json = Column(Text)

    run = relationship("FactorRun", back_populates="results")

    __table_args__ = (
        Index("idx_run", "run_id"),
    )
