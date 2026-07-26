"""SQLAlchemy 引擎与会话工厂"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session

from backend.config import DATABASE_URL
from backend.models.base import Base  # 统一使用 models 包内的 Base

# SQLite 外键支持
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
    future=True,
)


@event.listens_for(engine, "connect")
def _enable_sqlite_fk(dbapi_conn, _):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db():
    """FastAPI 依赖：注入 DB 会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """建表（仅在首次启动调用）"""
    # 顶层导入一次，触发所有模型注册到 Base.metadata
    from backend import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
