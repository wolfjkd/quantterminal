"""用户 / 系统参数 / 审计日志"""
from sqlalchemy import Column, Integer, BigInteger, String, SmallInteger, DateTime, func

from .base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    realname = Column(String(50), default="")
    # SQLite 无原生 ENUM，用 String + CHECK 由业务层校验
    role = Column(String(16), default="analyst")  # admin / analyst / viewer
    phone = Column(String(20), default="")
    status = Column(SmallInteger, default=1)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(),
                        onupdate=func.current_timestamp())


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    setting_key = Column(String(64), unique=True, nullable=False)
    setting_value = Column(String(255), default="")
    remark = Column(String(255), default="")
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(),
                        onupdate=func.current_timestamp())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    user_id = Column(Integer, default=0, index=True)
    action = Column(String(64), nullable=False, index=True)
    detail = Column(String(2000), default="")
    ip = Column(String(45), default="")
    created_at = Column(DateTime, server_default=func.current_timestamp())
