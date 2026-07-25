# QuantTerminal

一站式个人量化研究平台

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
- **桌面框架**: Electron
- **后端**: FastAPI
- **图表**: ECharts
- **UI**: Ant Design

## 功能模块

1. **驾驶舱**: 市场概览、自选股、信号扫描
2. **回测中心**: 策略回测、参数优化、绩效分析
3. **策略研究**: 策略编辑器、信号生成、因子分析

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

后端服务运行在 `http://localhost:8000`

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