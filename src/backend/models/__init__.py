"""QuantTerminal ORM 模型（26 张表）

按业务域分模块：
- base.py        Base 共享
- user.py        users / system_settings / audit_logs
- stock.py       stocks / trade_calendar / daily_bars / sync_logs
- factor.py      factors / factor_runs / factor_run_results
- strategy.py    strategies / backtest_jobs / backtest_equity / backtest_trades / backtest_positions
- portfolio.py   portfolios / portfolio_positions / portfolio_orders / portfolio_fills / portfolio_equity
- watchlist.py   watchlists / watchlist_items
- signal.py      signal_runs / signal_results
- trade.py       trade_plans / trade_notes
"""
from .base import Base
from .user import User, SystemSetting, AuditLog
from .stock import Stock, TradeCalendar, DailyBar, SyncLog
from .factor import Factor, FactorRun, FactorRunResult
from .strategy import Strategy, BacktestJob, BacktestEquity, BacktestTrade, BacktestPosition
from .portfolio import Portfolio, PortfolioPosition, PortfolioOrder, PortfolioFill, PortfolioEquity
from .watchlist import Watchlist, WatchlistItem
from .signal import SignalRun, SignalResult
from .trade import TradePlan, TradeNote

__all__ = [
    "Base",
    # 用户域
    "User", "SystemSetting", "AuditLog",
    # 行情域
    "Stock", "TradeCalendar", "DailyBar", "SyncLog",
    # 因子域
    "Factor", "FactorRun", "FactorRunResult",
    # 策略回测域
    "Strategy", "BacktestJob", "BacktestEquity", "BacktestTrade", "BacktestPosition",
    # 模拟组合域
    "Portfolio", "PortfolioPosition", "PortfolioOrder", "PortfolioFill", "PortfolioEquity",
    # 自选域
    "Watchlist", "WatchlistItem",
    # 信号域
    "SignalRun", "SignalResult",
    # 交易计划域
    "TradePlan", "TradeNote",
]
