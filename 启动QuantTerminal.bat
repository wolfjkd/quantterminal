@echo off
chcp 65001 >nul
title QuantTerminal - 量化研究平台

echo.
echo ============================================
echo   QuantTerminal 量化研究平台
echo ============================================
echo.

REM 切换到项目目录
cd /d "%~dp0"

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js
    echo.
    echo 请先安装 Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM 检查 Python 是否安装
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python
    echo.
    echo 请先安装 Python: https://www.python.org/
    echo.
    pause
    exit /b 1
)

REM 检查依赖是否安装
if not exist "node_modules" (
    echo [提示] 首次运行，正在安装前端依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [错误] 前端依赖安装失败
        pause
        exit /b 1
    )
)

if not exist "src\renderer\node_modules" (
    echo [提示] 正在安装渲染器依赖...
    cd src\renderer
    call npm install
    cd ..\..
    if %errorlevel% neq 0 (
        echo.
        echo [错误] 渲染器依赖安装失败
        pause
        exit /b 1
    )
)

echo.
echo [启动] 正在启动 QuantTerminal...
echo.
echo 提示：关闭此窗口将停止服务
echo.
echo 服务地址:
echo   前端界面: http://localhost:5173/
echo   后端API: http://127.0.0.1:8001/
echo.

REM 等待后端启动后自动打开浏览器
start "" /b cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:5173/"

REM 启动开发模式
call npm run dev

if %errorlevel% neq 0 (
    echo.
    echo [错误] 启动失败，错误码: %errorlevel%
    echo.
    pause
)
