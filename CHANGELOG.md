# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),

## [0.2.1] - 2026-07-26

### Fixed
- 修复 8 个 TypeScript 编译错误（InputNumber label / 未使用 import / unknown 类型 / vite-env.d.ts）
- src/renderer/package.json 版本号 0.1.0 → 0.2.0（与主 package.json 同步）

### Added
- 回测中心 21 项指标展示补齐（实际 29 项，按收益/风险/风险调整/交易/费用 5 类分组）
- 前端 ErrorBoundary 组件（异常时显示 antd Result 错误页 + 重试按钮）
- docs/phase4-report.md 阶段4测试报告
- .gitignore 补齐 IDE 配置忽略规则（.vscode/.idea/*.swp）

## [0.2.0] - 2026-07-26

### Added - 补做计划中未实现的两个核心页面
- **条件选股页面** (`src/renderer/src/pages/Screener.tsx`) 🆕
  - 多条件组合筛选：支持添加/删除条件组，AND 逻辑组合
  - 5 类 30+ 条件可选（基本面/技术面/资金面/风险面/标记）
  - 6 种比较运算符：`>` `<` `≥` `≤` `=` `≠`
  - 结果展示：股票代码、收盘价、成交量、匹配条件 Tag
  - 支持按字段排序、分页、列滚动

- **因子中心页面** (`src/renderer/src/pages/FactorCenter.tsx`) 🆕
  - **因子库管理 Tab**：因子列表（代码/名称/方向/默认权重/说明）
  - **自定义权重**：每个因子可调整权重（0-1），实时计算权重总和
  - **因子评分排行**：按权重计算综合评分，支持排序与因子明细展示
  - **评分分布图**：ECharts 柱状图展示前 30 只股票评分
  - **IC 分析 Tab**：单因子 IC/Rank IC 分析 + 对比柱状图
  - 统计卡片：因子总数、正向因子数、负向因子数、权重总和

- **应用导航**
  - 新增菜单项：条件选股（FilterOutlined 图标）
  - 新增菜单项：因子中心（FundProjectionScreenOutlined 图标）

### Changed
- `package.json` 版本号 0.1.0 → 0.2.0
- `src/backend/main.py` FastAPI 版本号 0.1.0 → 0.2.0
- `README.md` 版本徽章、功能模块清单、版本历史表更新

### Tests
- TypeScript 类型校验通过（所有接口类型已在 `types/index.ts` 中预定义）
- 后端 API 复用现有 `/screener/*` 和 `/factors/*` 接口，无需新增

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
