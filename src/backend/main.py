"""QuantTerminal 后端入口

FastAPI + SQLAlchemy + SQLite + JWT，注册 20 个业务 router。
"""
import os
import sys
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import APP_NAME, APP_VERSION, APP_HOST, APP_PORT
from backend.database import init_db
from backend.routers import ALL_ROUTERS

app = FastAPI(
    title=f"{APP_NAME} API",
    version=APP_VERSION,
    description="A股量化研究平台",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 桌面端 Electron，无严格跨域限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    """启动时自动建表（首次运行）"""
    init_db()


@app.get("/")
def root():
    return {
        "app": APP_NAME,
        "version": APP_VERSION,
        "docs": "/docs",
        "modules": [
            "auth", "dashboard", "decision", "compare", "workbench",
            "radar", "stocks", "watchlists", "portfolios", "backtest",
            "strategies", "factors", "screener", "realtime", "market",
            "sync", "settings", "audit", "trade-plans", "trade-notes",
        ],
    }


@app.get("/health")
def health():
    return {"status": "healthy", "version": APP_VERSION}


# 注册全部 router
for r in ALL_ROUTERS:
    app.include_router(r)


def _is_frozen() -> bool:
    """是否运行在 PyInstaller 打包环境中"""
    return getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS")


if __name__ == "__main__":
    if _is_frozen():
        # 打包模式：直接传 app 对象（PyInstaller 字符串导入不可靠）
        uvicorn.run(app, host=APP_HOST, port=APP_PORT, reload=False)
    else:
        # 开发模式：字符串导入 + reload
        uvicorn.run(
            "backend.main:app",
            host=APP_HOST,
            port=APP_PORT,
            reload=True,
            reload_dirs=["backend"],
        )
