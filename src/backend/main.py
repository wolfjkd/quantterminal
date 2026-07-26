"""QuantTerminal 后端入口

FastAPI + SQLAlchemy + SQLite + JWT，注册 20 个业务 router。
"""
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


if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host=APP_HOST,
        port=APP_PORT,
        reload=True,
        reload_dirs=["backend"],
    )
