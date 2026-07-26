# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),

## [0.4.1] - 2026-07-26

### Added
- **PyInstaller 打包脚本** (`scripts/build_backend.py`)：把 FastAPI 后端封装为独立 `quantterminal-backend.exe`（44.5 MB），显式声明 hidden-imports 避免动态导入遗漏
- **Electron NSIS 安装包**：`QuantTerminal Setup 0.4.0.exe`（119.6 MB），包含 Electron 运行时 + 前端 dist + backend exe
- **dev/prod 模式区分** (`src/main/index.js`)：开发模式跑 Python 源码，打包模式 spawn backend exe，数据目录指向 userData
- **环境变量覆盖配置**：`QT_BACKEND_PORT` / `QT_DATA_DIR` / `QUANT_PROJECTS_ROOT` / `TFH_SRC_DIR`，打包后无源码路径也能跑

### Changed
- `src/backend/config.py`：APP_PORT / DATA_DIR / QUANT_PROJECTS_ROOT 改为环境变量优先
- `src/backend/main.py`：PyInstaller frozen 模式下关闭 reload，直接传 app 对象给 uvicorn（字符串导入在打包后不可靠）
- `src/backend/services/tfhub_service.py`：`_TFH_SRC` 改为环境变量优先，路径不存在时不插入 sys.path（打包后自动降级）
- `src/main/index.js`：端口 8000 → 8001（与后端一致），用 `app.isPackaged` 区分 dev/prod，打包模式从 `process.resourcesPath/backend/` 启动 exe
- `package.json`：electron/electron-builder 移到 devDependencies，新增 author/license，build 配置加 extraResources + NSIS 选项 + signAndEditExecutable=false

### Infrastructure
- 新增 `scripts/build_backend.py`：PyInstaller onefile 打包脚本，显式声明 26 个 hidden-imports + 5 个 collect-submodules
- electron-builder 配置：extraResources 嵌入 backend exe，NSIS 支持自定义安装路径/桌面快捷方式/开始菜单

### 升级指引（v0.4.0 → v0.4.1）
1. 完整打包流程：`npm run build`（依次执行 build:backend → build:renderer → build:electron）
2. 打包前确保 `pip install pyinstaller` 已安装
3. 打包需要 npm 镜像环境变量：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
4. Windows 普通用户打包需在 `node_modules/app-builder-lib/out/codeSign/windowsCodeSign.js` 中 patch `getSignVendorPath` 返回本地预解压目录（避免符号链接权限问题）
5. 输出：`dist/QuantTerminal Setup 0.4.0.exe`（注意：exe 文件名版本号保持 0.4.0，代码版本已升 0.4.1，下次发版统一）

## [0.4.0] - 2026-07-26

### Added
- **通达信实时行情接入**：新增 `src/backend/services/tfhub_service.py`，封装 trader-finance-hub 的 eltdx 协议，提供行情快照/集合竞价/分时数据
- **新增 4 个 API 端点**：`/realtime/tfhub/health`、`/realtime/tfhub/quote`、`/realtime/tfhub/auction/{code}`、`/realtime/tfhub/minute/{code}`
- **K 线图组件** (`src/renderer/src/components/KlineChart.tsx`)：基于 Lightweight Charts 4.1 封装，支持蜡烛图+成交量副图+时间轴缩放平移+容器自适应
- **前端单测框架**：vitest 4 + @testing-library/react + jsdom
- **示例测试用例**：`src/test/storage.test.ts`（6 用例）、`src/test/KlineChart.test.tsx`（3 用例），共 9 用例全部通过
- **vite.config.ts 测试配置**：jsdom 环境 + setup 文件 + v8 覆盖率报告

### Changed
- 解决端口冲突：quantterminal 后端从 8000 改为 8001（trader-finance-hub 占用 8000）
- `src/backend/config.py`：新增 `TFH_BASE_URL` 配置项，APP_PORT 8000 → 8001，APP_VERSION 0.3.1 → 0.4.0
- `src/renderer/src/services/api.ts`：BASE_URL 同步至 8001，新增 `realtimeApi.tfhub*` 系列方法
- `src/renderer/src/pages/Realtime.tsx`：新增「通达信实时行情」Tab，含健康检查/批量快照/分时图/集合竞价展示；日K分析 Tab 增加 Lightweight Charts/ECharts 切换
- `src/renderer/src/pages/Stocks.tsx`：股票列表行点击查看 K 线图（Modal 形式）
- `src/renderer/package.json`：新增 test/test:watch/test:coverage 脚本
- README.md：版本徽章/打包路径/版本历史表/技术栈/功能模块全面更新

### Fixed
- 修复 vitest 4 兼容性：`vi.fn().mockImplementation()` 不能作为构造函数，`ResizeObserver` mock 改用真正的 class 实现
- 修复 TypeScript 类型错误：KlineChart 中 lightweight-charts `time` 字段使用 `as unknown as UTCTimestamp` 绕过（库实际支持 'YYYY-MM-DD' 字符串）

### Infrastructure
- 新增 dev 依赖：vitest、@testing-library/react、@testing-library/jest-dom、@testing-library/user-event、jsdom、lightweight-charts

### 升级指引（v0.3.1 → v0.4.0）
1. 后端端口从 8000 改为 8001，如有自定义脚本调用需同步修改
2. 启动前确保 trader-finance-hub 已在 8000 端口运行（实时行情 Tab 依赖）
3. 在 `src/renderer` 执行 `npm install` 安装新增依赖（lightweight-charts/vitest 等）
4. 运行 `npm test` 执行前端单测

## [0.3.1] - 2026-07-26

### Fixed
- 修复 /workbench/prepare 死端点：原返回占位响应，改造为真实批量同步（取 K 线最旧的 N 只股票调用 sync_service 拉取东方财富数据写入 SQLite）
- 修复 Workbench.tsx 准备行情按钮死代码：改为调用真实 API workbenchApi.prepare()，带 loading 状态和成功/失败提示
- 修复 stocks.py 路由：找不到股票时返回 HTTPException 404（替代占位响应）
- 清理全局阶段 A/B/C/D 开发期临时标签：11 个 router + 4 个 service 的 docstring/注释
- 清理参考 lianghua / 与 lianghua 一致 字样：factor.py / screener.py / settings.py / Settings.tsx / compare_service.py / market_data_service.py / auth_service.py / backtest_service.py
- 删除死代码 src/renderer/src/components/Placeholder.tsx（未被任何页面引用）
- 删除死代码 src/backend/routers/_common.py（占位构造器，迁移完已无引用）
- 重命名 LIANGHUA_MYSQL_URL 为 LEGACY_MYSQL_URL（语义更中性）

### Changed
- 重写 src/renderer/src/pages/About.tsx：删除阶段 B/C/D 分组，改为正式产品介绍（技术栈/核心能力/业务模块按功能分组）
- src/backend/routers/radar.py 多处阶段 C+ 接入 trader-finance-hub 占位文案改为暂未启用，可后续接入
- src/backend/services/radar_service.py docstring 同步清理

### Added
- 新增 /workbench/prepare 真实同步逻辑：批量同步最旧数据的股票 K 线，支持 smart/full 模式
- 新增 Workbench.tsx handlePrepare 函数：调用真实 API + loading 状态

## [0.3.0] - 2026-07-26

### Added - 全面重做
- 20 个业务模块全部上线：总览/操盘台/双核对比/量化工作台/市场雷达/股票池/自选股/投资组合/回测中心/策略管理/因子中心/条件选股/实时分析/全A动向/行情同步/交易计划/交易笔记/系统设置/审计日志/关于
- 行情同步真实接入：东方财富 push2his/push2 接口，支持日 K 线、股票列表、实时报价
- 回测引擎完整集成：8 种策略 + 29 项绩效指标 + 净值曲线 + 交易明细 + 持仓快照
- 因子引擎完整集成：5 类 22 因子 + 多因子加权打分 + IC 分析
- 条件选股完整集成：5 类 30+ 条件 + 多条件 AND 组合 + 6 种比较运算符
- A 股特色规则：T+1 交易制度 + 5%/10%/20% 三档涨跌停 + 佣金+印花税模拟
- JWT 认证：兼容 PHP bcrypt 哈希，支持自动登录状态管理
- 数据迁移：26 张表 + 5067 只股票 + 85527 条 K 线从 MariaDB 迁移至 SQLite

### Changed
- package.json 版本号 0.2.1 至 0.3.0
- src/backend/config.py APP_VERSION 0.2.0 至 0.3.0
- 技术栈升级：PHP+MariaDB 至 Python+SQLite，保留 Electron 前端

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
