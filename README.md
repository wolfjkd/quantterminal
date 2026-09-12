# QuantTerminal

> **⚠️ 不再维护更新，已并入 TradeX**

<p align="center">
  <strong>一站式个人量化研究平台 · Electron + React + FastAPI</strong><br/>
  Desktop Application · A股量化交易 · MIT License
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-31-blue.svg" alt="Electron"/>
  <img src="https://img.shields.io/badge/React-18-61dafb.svg" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-5-blue.svg" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/FastAPI-0.100-009688.svg" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/Version-0.4.1-orange.svg" alt="Version"/>
</p>

---

## 项目定位

QuantTerminal 是基于 [QuantEngine](https://github.com/wolfjkd/quantengine) 引擎层打造的一站式个人量化研究平台。
为量化交易员提供桌面级的研究、回测、监控一体化环境。

**架构关系**：
```
QuantTerminal (应用层, Electron)
       ↓ HTTP API
QuantEngine (引擎层) ←─算法─ QuantCore (算法层)
       ↓ 数据
Trader Finance Hub (数据层, MCP) ←─ AI Agent 调用
```

## 项目结构

```
quantterminal/
├── src/
│   ├── main/           # Electron 主进程
│   │   ├── index.js
│   │   └── preload.js
│   ├── renderer/       # React + TypeScript 前端
│   │   ├── src/
│   │   │   ├── pages/        # 页面组件
│   │   │   ├── components/   # 通用组件
│   │   │   ├── services/     # API 服务
│   │   │   ├── types/        # 类型定义
│   │   │   └── App.tsx
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── backend/        # FastAPI 后端
│       ├── main.py
│       └── requirements.txt
├── package.json
└── README.md
```

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **桌面框架**: Electron 31
- **后端**: FastAPI (端口 8001，避免与 tradex-hub 8000 冲突)
- **图表**: ECharts + Lightweight Charts（K 线专用高性能库）
- **UI**: Ant Design
- **测试**: Vitest + @testing-library/react

## 功能模块

1. **驾驶舱**: 市场概览、自选股、信号扫描
2. **回测中心**: 策略回测、参数优化、绩效分析
3. **策略研究**: 策略编辑器、信号生成、因子分析
4. **条件选股**: 多条件组合筛选、5类30+条件、AND 逻辑组合 🆕 v0.2.0
5. **因子中心**: 因子库管理、自定义权重、IC 分析 🆕 v0.2.0
6. **20 业务模块**: 操盘台/双核对比/工作台/雷达/股票池/自选股/组合/行情同步/审计日志等 🆕 v0.3.0
7. **通达信实时行情**: 集合竞价/分时/批量快照（eltdx 协议，接入 tradex-hub） 🆕 v0.4.0
8. **K 线图组件**: Lightweight Charts 蜡烛图+成交量副图，支持缩放平移 🆕 v0.4.0

## 快速开始

```bash
# 安装后端依赖
pip install -r src/backend/requirements.txt

# 安装前端依赖
cd src/renderer
npm install

# 启动后端
python src/backend/main.py

# 启动前端
cd src/renderer
npm run dev
```

## API 服务

后端服务运行在 `http://localhost:8001`（tradex-hub 占用 8000）

### 可用接口

- `/stocks` - 获取股票列表
- `/kline/{stock_code}` - 获取K线数据
- `/backtest` - 运行回测
- `/strategies` - 获取策略列表
- `/signal/analyze` - 信号分析
- `/signal/scan` - 信号扫描
- `/factors` - 获取因子列表
- `/factors/score` - 因子评分
- `/screener/screen` - 条件选股
- `/sync` - 数据同步

## 打包发布

```bash
# 打包 Windows 安装包
npm run build

# 输出位置
# dist/QuantTerminal Setup 0.4.0.exe
```

## 版本历史

详见 [CHANGELOG.md](CHANGELOG.md)

| 版本 | 发布日期 | 主要变更 |
|------|---------|---------|
| v0.4.1 | 2026-07-26 | 打包基础设施：PyInstaller 后端封装+环境变量支持+dev/prod 模式区分+NSIS 安装包（119MB） |
| v0.4.0 | 2026-07-26 | 接入 tradex-hub 通达信实时行情+Lightweight Charts K线图+vitest前端单测+Electron NSIS打包 |
| v0.3.1 | 2026-07-26 | 自查修复：workbench/prepare死端点改造+About页重写+阶段A/B/C/D标签清理+版本号同步 |
| v0.3.0 | 2026-07-26 | 对标真实业务系统全面重做：20模块上线+行情同步接入+回测/因子/选股引擎完整集成 |
| v0.2.1 | 2026-07-26 | 修复8个TS编译错误+回测中心29项指标补齐+ErrorBoundary容错+阶段4测试报告 |
| v0.2.0 | 2026-07-26 | 新增条件选股页面 + 因子中心页面（含IC分析），5 大功能模块齐全 |
| v0.1.0 | 2026-07-25 | 初始版本：驾驶舱 + 回测中心 + 策略研究 三大核心页面 |

## License

MIT License © 2026 [wolfjkd](https://github.com/wolfjkd)