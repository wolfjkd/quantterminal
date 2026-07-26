"""PyInstaller 打包脚本：把 backend 封装为独立 exe

用法：
    python scripts/build_backend.py

输出：
    dist-backend/quantterminal-backend.exe

设计要点：
  - onefile 模式：单 exe，启动稍慢但分发简单
  - 显式 hidden-imports：避免 PyInstaller 漏掉动态导入的 router/service
  - 不包含 trader-finance-hub 源码（打包后 tfhub_service 自动降级）
  - 不包含 quantengine/quantcore 源码路径（用 pip 安装版本）
"""
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
ENTRY = SRC_DIR / "backend" / "main.py"
OUTPUT_DIR = PROJECT_ROOT / "dist-backend"
NAME = "quantterminal-backend"


def main():
    # PyInstaller 显式声明的 hidden-imports
    hidden_imports = [
        # backend 模块（PyInstaller 静态分析可能漏掉动态导入）
        "backend.routers",
        "backend.routers.auth",
        "backend.routers.dashboard",
        "backend.routers.decision",
        "backend.routers.compare",
        "backend.routers.workbench",
        "backend.routers.radar",
        "backend.routers.stocks",
        "backend.routers.watchlists",
        "backend.routers.portfolios",
        "backend.routers.backtest",
        "backend.routers.strategy",
        "backend.routers.factor",
        "backend.routers.screener",
        "backend.routers.realtime",
        "backend.routers.market",
        "backend.routers.sync",
        "backend.routers.settings",
        "backend.routers.audit",
        "backend.routers.trade_plan",
        "backend.routers.trade_note",
        "backend.services",
        "backend.services.auth_service",
        "backend.services.audit_service",
        "backend.services.backtest_service",
        "backend.services.compare_service",
        "backend.services.factor_service",
        "backend.services.market_data_service",
        "backend.services.market_service",
        "backend.services.portfolio_service",
        "backend.services.radar_service",
        "backend.services.realtime_service",
        "backend.services.screener_service",
        "backend.services.signal_service",
        "backend.services.sync_service",
        "backend.services.workbench_service",
        # quantengine / quantcore 子模块
        "quantengine",
        "quantengine.core.signal",
        "quantcore",
        "quantcore.indicators",
        # 第三方依赖
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "passlib.handlers.bcrypt",
    ]

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", NAME,
        "--paths", str(SRC_DIR),
        "--distpath", str(OUTPUT_DIR),
        "--workpath", str(PROJECT_ROOT / "build-backend"),
        "--specpath", str(PROJECT_ROOT / "build-backend"),
        "--clean",
        "--noconfirm",
        # 数据库/配置在运行时生成，无需打包数据文件
    ]
    for h in hidden_imports:
        cmd.extend(["--hidden-import", h])

    # 收集 backend.routers 和 backend.services 所有子模块
    cmd.extend(["--collect-submodules", "backend.routers"])
    cmd.extend(["--collect-submodules", "backend.services"])
    cmd.extend(["--collect-submodules", "backend.models"])
    cmd.extend(["--collect-submodules", "quantengine"])
    cmd.extend(["--collect-submodules", "quantcore"])

    cmd.append(str(ENTRY))

    print("[build_backend] 执行 PyInstaller...")
    print(f"[build_backend] 命令: {' '.join(cmd[:6])} ... (共 {len(cmd)} 参数)")
    print(f"[build_backend] 输出目录: {OUTPUT_DIR}")

    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))
    if result.returncode != 0:
        print(f"[build_backend] ❌ 打包失败 (exit={result.returncode})")
        sys.exit(result.returncode)

    exe_path = OUTPUT_DIR / f"{NAME}.exe"
    if exe_path.exists():
        size_mb = exe_path.stat().st_size / (1024 * 1024)
        print(f"[build_backend] ✅ 打包成功: {exe_path}")
        print(f"[build_backend] 体积: {size_mb:.1f} MB")
    else:
        print(f"[build_backend] ❌ 输出文件不存在: {exe_path}")
        sys.exit(1)


if __name__ == "__main__":
    main()
