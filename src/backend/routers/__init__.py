"""routers 包：20 个业务模块"""
from .auth import router as auth_router
from .dashboard import router as dashboard_router
from .decision import router as decision_router
from .compare import router as compare_router
from .workbench import router as workbench_router
from .radar import router as radar_router
from .stocks import router as stocks_router
from .watchlist import router as watchlist_router
from .portfolio import router as portfolio_router
from .backtest import router as backtest_router
from .strategy import router as strategy_router
from .factor import router as factor_router
from .screener import router as screener_router
from .realtime import router as realtime_router
from .market import router as market_router
from .sync import router as sync_router
from .settings import router as settings_router
from .audit import router as audit_router
from .trade_plan import router as trade_plan_router
from .trade_note import router as trade_note_router

ALL_ROUTERS = [
    auth_router,
    dashboard_router,
    decision_router,
    compare_router,
    workbench_router,
    radar_router,
    stocks_router,
    watchlist_router,
    portfolio_router,
    backtest_router,
    strategy_router,
    factor_router,
    screener_router,
    realtime_router,
    market_router,
    sync_router,
    settings_router,
    audit_router,
    trade_plan_router,
    trade_note_router,
]
