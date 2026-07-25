# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),

## [0.1.0] - 2026-07-25

### Added - 初始版本
- **桌面架构**
  - Electron 31 + React 18 + TypeScript + Vite
  - 主进程/渲染进程/后端进程 三层分离
  - IPC 通信、FastAPI 后端

- **核心页面**
  - **驾驶舱** (`Dashboard.tsx`)：市场概览、自选股、信号扫描、图表展示
  - **回测中心** (`Backtest.tsx`)：策略回测、参数配置、绩效展示
  - **策略研究** (`StrategyLab.tsx`)：策略编辑、信号生成、因子分析

- **后端 API** (`src/backend/main.py`)
  - `/stocks` - 股票列表
  - `/kline/{code}` - K线数据
  - `/backtest` - 策略回测
  - `/strategies` - 策略列表
  - `/signal/analyze` / `/signal/scan` - 信号分析与扫描
  - `/factors` / `/factors/score` - 因子列表与评分
  - `/screener/screen` - 条件选股
  - `/sync` - 数据同步

- **前端服务** (`src/renderer/src/services/api.ts`)
  - Axios HTTP 客户端封装
  - 全部后端接口的 TypeScript 类型定义

- **类型系统** (`src/renderer/src/types/index.ts`)
  - 股票、K线、回测、信号、因子、选股 完整类型

### Infrastructure
- `package.json` Electron + React 项目配置
- electron-builder 打包配置（Windows NSIS）
- 同时启动前后端的开发脚本
- MIT License
- GitHub 私有仓库：wolfjkd/quantterminal

### Tests
- 阶段3测试报告：`docs/phase3-report.md`
- 验证：前端启动、后端API、驾驶舱页面、信号扫描功能正常
