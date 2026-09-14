"""QuantTerminal 后端配置"""
import os
from pathlib import Path

# ============ 路径 ============
# backend/config.py → backend → src → quantterminal
BACKEND_DIR = Path(__file__).resolve().parent
SRC_DIR = BACKEND_DIR.parent
PROJECT_ROOT = SRC_DIR.parent

# 数据目录：优先用环境变量（打包后由 Electron 主进程传入 userData 目录）
# 开发模式默认放在项目根 data/ 下
_DATA_DIR_ENV = os.environ.get("QT_DATA_DIR")
if _DATA_DIR_ENV:
    DATA_DIR = Path(_DATA_DIR_ENV)
else:
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
APP_VERSION = "0.4.1"
APP_HOST = "127.0.0.1"
# 端口：优先用环境变量（打包后由 Electron 主进程传入，避免冲突）
APP_PORT = int(os.environ.get("QT_BACKEND_PORT", "8001"))

# tradex-hub 后端（实时行情源/全市场数据）
TFH_BASE_URL = "http://127.0.0.1:8000"

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
# 优先用环境变量（打包后无源码路径），默认值仅用于开发环境
QUANT_PROJECTS_ROOT = Path(os.environ.get(
    "QUANT_PROJECTS_ROOT",
    str(Path.home() / "quant_projects"),
))
