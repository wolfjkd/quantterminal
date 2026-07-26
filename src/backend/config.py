"""QuantTerminal 后端配置"""
import os
from pathlib import Path

# ============ 路径 ============
# backend/config.py → backend → src → quantterminal
BACKEND_DIR = Path(__file__).resolve().parent
SRC_DIR = BACKEND_DIR.parent
PROJECT_ROOT = SRC_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ============ 数据库 ============
# SQLite 嵌入式
DB_PATH = DATA_DIR / "quantterminal.db"
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

# 历史迁移源 MariaDB（数据已迁移至 SQLite，仅保留备用）
LEGACY_MYSQL_URL = "mysql+pymysql://lianghua:123456@localhost:3306/lianghua?charset=utf8mb4"

# ============ JWT ============
JWT_SECRET = "qt-secret-change-in-production-2026"
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

# ============ 应用 ============
APP_NAME = "QuantTerminal"
APP_VERSION = "0.3.1"
APP_HOST = "127.0.0.1"
APP_PORT = 8000

# ============ A股规则 ============
COMMISSION_RATE = 0.0003
MIN_COMMISSION = 5.0
STAMP_TAX_RATE = 0.0005
SLIPPAGE_BPS = 0
RISK_FREE_RATE = 0.02
TRADING_DAYS_YEAR = 242
INITIAL_CASH = 1_000_000.0
LOT_SIZE = 100
BOARD_LIMIT_MAIN = 0.10
BOARD_LIMIT_GEM = 0.20
FILL_PRICE = "next_open"

# ============ 跨项目引用 ============
QUANT_PROJECTS_ROOT = Path(r"C:\Users\wolfj\Documents\trae_projects")
