"""SQLite 初始化脚本：建表 + 写入种子数据

用法：
    python -m backend.scripts.init_db
"""
import sys
from pathlib import Path

# 支持直接运行：把 src 目录（backend 父目录）加入 sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session

from backend.database import engine, SessionLocal, init_db
from backend.models import (
    User, SystemSetting, Factor, Strategy,
)
from backend.services.auth_service import pwd_context


SEED_SETTINGS = [
    ("commission_rate", "0.0003", "佣金费率"),
    ("min_commission", "5.0", "最低佣金"),
    ("stamp_tax_rate", "0.0005", "印花税卖出"),
    ("slippage_bps", "0", "滑点基点"),
    ("risk_free_rate", "0.02", "无风险利率"),
    ("trading_days_year", "242", "年化交易日"),
    ("initial_cash", "1000000", "默认初始资金"),
    ("lot_size", "100", "每手股数"),
    ("board_limit_main", "0.10", "主板涨跌幅"),
    ("board_limit_gem", "0.20", "创业科创涨跌幅"),
    ("fill_price", "next_open", "回测成交价 next_open|close"),
]

SEED_FACTORS = [
    ("mom_20", "动量20日", "builtin", '{"window":20}', 1.0, 0, "close/close_20-1"),
    ("vol_20", "波动20日", "builtin", '{"window":20}', 0.5, 1, "低波优先时 reverse=1"),
    ("ma_bias", "均线乖离", "builtin", '{"window":20}', 0.5, 0, "close/MA20-1"),
    ("turnover", "成交额活跃", "builtin", '{"window":5}', 0.3, 0, "近5日均成交额"),
    ("rsi_14", "RSI14", "builtin", '{"window":14}', 0.2, 0, "RSI(14)"),
]

SEED_STRATEGIES = [
    ("双均线金叉(5/20)", "dual_ma",
     '{"fast":5,"slow":20,"buy_lots":10}',
     "经典双均线，概念对齐 vn.py 策略模板"),
    ("多因子TopN调仓", "factor_topn",
     '{"top_n":5,"rebalance_days":20,"buy_lots":5,"factors":[{"code":"mom_20","weight":1},{"code":"vol_20","weight":0.5,"reverse":1}]}',
     "概念对齐 Qlib 多因子选股"),
]


def seed(db: Session):
    # 管理员 admin / admin123
    if not db.query(User).filter_by(username="admin").first():
        db.add(User(
            username="admin",
            password=pwd_context.hash("admin123"),
            realname="系统管理员",
            role="admin",
            phone="13800000000",
            status=1,
        ))
        print("[seed] 已创建管理员 admin/admin123")

    # 系统参数
    for key, value, remark in SEED_SETTINGS:
        if not db.query(SystemSetting).filter_by(setting_key=key).first():
            db.add(SystemSetting(setting_key=key, setting_value=value, remark=remark))
    print(f"[seed] 系统参数 {len(SEED_SETTINGS)} 条")

    # 因子
    for code, name, ftype, params, weight, reverse, remark in SEED_FACTORS:
        if not db.query(Factor).filter_by(code=code).first():
            db.add(Factor(
                code=code, name=name, formula_type=ftype, params_json=params,
                default_weight=weight, is_reverse=reverse, status=1, remark=remark,
            ))
    print(f"[seed] 因子 {len(SEED_FACTORS)} 条")

    # 策略
    for name, stype, params, remark in SEED_STRATEGIES:
        if not db.query(Strategy).filter_by(name=name).first():
            db.add(Strategy(
                name=name, strategy_type=stype, params_json=params,
                status=1, remark=remark, created_by=1,
            ))
    print(f"[seed] 策略 {len(SEED_STRATEGIES)} 条")

    db.commit()


def main():
    print(f"[1/2] 创建全部表（SQLite）...")
    init_db()
    print(f"    ✓ 建表完成")

    print(f"[2/2] 写入种子数据...")
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
    print(f"    ✓ 种子数据完成")

    print("\n初始化完成。数据库位置：data/quantterminal.db")
    print("登录账号：admin / admin123")


if __name__ == "__main__":
    main()
