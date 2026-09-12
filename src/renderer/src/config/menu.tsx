/** 侧边栏菜单配置：精简版 13 个业务模块 */
import {
  DashboardOutlined,
  StockOutlined,
  StarOutlined,
  WalletOutlined,
  BarChartOutlined,
  ExperimentOutlined,
  FundProjectionScreenOutlined,
  FilterOutlined,
  LineChartOutlined,
  CloudSyncOutlined,
  SettingOutlined,
  AimOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

export interface MenuItem {
  key: string;
  path: string;
  icon: ReactNode;
  label: string;
  /** 仅管理员可见 */
  adminOnly?: boolean;
}

export const MENU_ITEMS: MenuItem[] = [
  {
    key: 'dashboard',
    path: '/dashboard',
    icon: <DashboardOutlined />,
    label: '总览',
  },
  {
    key: 'sync',
    path: '/sync',
    icon: <CloudSyncOutlined />,
    label: '行情同步',
  },
  {
    key: 'stocks',
    path: '/stocks',
    icon: <StockOutlined />,
    label: '股票池',
  },
  {
    key: 'watchlist',
    path: '/watchlists',
    icon: <StarOutlined />,
    label: '自选股',
  },
  {
    key: 'portfolio',
    path: '/portfolios',
    icon: <WalletOutlined />,
    label: '投资组合',
  },
  {
    key: 'backtest',
    path: '/backtest',
    icon: <BarChartOutlined />,
    label: '回测中心',
  },
  {
    key: 'strategy',
    path: '/strategies',
    icon: <ExperimentOutlined />,
    label: '策略管理',
  },
  {
    key: 'factor',
    path: '/factors',
    icon: <FundProjectionScreenOutlined />,
    label: '因子中心',
  },
  {
    key: 'screener',
    path: '/screener',
    icon: <FilterOutlined />,
    label: '条件选股',
  },
  {
    key: 'realtime',
    path: '/realtime',
    icon: <LineChartOutlined />,
    label: '实时分析',
  },
  {
    key: 'trade-plan',
    path: '/trade-plans',
    icon: <AimOutlined />,
    label: '交易计划',
  },
  {
    key: 'trade-note',
    path: '/trade-notes',
    icon: <FileTextOutlined />,
    label: '交易笔记',
  },
  {
    key: 'settings',
    path: '/settings',
    icon: <SettingOutlined />,
    label: '系统设置',
    adminOnly: true,
  },
];
