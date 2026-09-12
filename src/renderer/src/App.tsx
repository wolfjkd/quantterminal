/** QuantTerminal 根组件
 *
 * 路由结构（精简版 13 个模块）：
 *   /login         → Login（公开）
 *   /              → MainLayout（受保护，含侧边栏）
 *     ├─ /dashboard    总览
 *     ├─ /sync         行情同步
 *     ├─ /stocks       股票池
 *     ├─ /watchlists   自选股
 *     ├─ /portfolios   投资组合
 *     ├─ /backtest     回测中心
 *     ├─ /strategies   策略管理
 *     ├─ /factors      因子中心
 *     ├─ /screener     条件选股
 *     ├─ /realtime     实时分析
 *     ├─ /trade-plans  交易计划
 *     ├─ /trade-notes  交易笔记
 *     └─ /settings     系统设置
 */
import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuth } from './services/authStore';

// 懒加载保留的页面
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Stocks = lazy(() => import('./pages/Stocks'));
const Watchlists = lazy(() => import('./pages/Watchlists'));
const Portfolios = lazy(() => import('./pages/Portfolios'));
const Backtest = lazy(() => import('./pages/Backtest'));
const Strategies = lazy(() => import('./pages/Strategies'));
const Factors = lazy(() => import('./pages/Factors'));
const Screener = lazy(() => import('./pages/Screener'));
const Realtime = lazy(() => import('./pages/Realtime'));
const Market = lazy(() => import('./pages/Market'));
const Sync = lazy(() => import('./pages/Sync'));
const TradePlans = lazy(() => import('./pages/TradePlans'));
const TradeNotes = lazy(() => import('./pages/TradeNotes'));
const Settings = lazy(() => import('./pages/Settings'));

const PageLoading = () => (
  <div style={{ padding: 40, textAlign: 'center' }}>
    <Spin size="large" />
  </div>
);

/** 受保护路由：未登录跳转 /login */
const ProtectedLayout = () => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return (
    <ErrorBoundary>
      <MainLayout />
    </ErrorBoundary>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <Suspense fallback={<PageLoading />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="stocks"
            element={
              <Suspense fallback={<PageLoading />}>
                <Stocks />
              </Suspense>
            }
          />
          <Route
            path="watchlists"
            element={
              <Suspense fallback={<PageLoading />}>
                <Watchlists />
              </Suspense>
            }
          />
          <Route
            path="portfolios"
            element={
              <Suspense fallback={<PageLoading />}>
                <Portfolios />
              </Suspense>
            }
          />
          <Route
            path="backtest"
            element={
              <Suspense fallback={<PageLoading />}>
                <Backtest />
              </Suspense>
            }
          />
          <Route
            path="strategies"
            element={
              <Suspense fallback={<PageLoading />}>
                <Strategies />
              </Suspense>
            }
          />
          <Route
            path="factors"
            element={
              <Suspense fallback={<PageLoading />}>
                <Factors />
              </Suspense>
            }
          />
          <Route
            path="screener"
            element={
              <Suspense fallback={<PageLoading />}>
                <Screener />
              </Suspense>
            }
          />
          <Route
            path="realtime"
            element={
              <Suspense fallback={<PageLoading />}>
                <Realtime />
              </Suspense>
            }
          />
          <Route
            path="market"
            element={
              <Suspense fallback={<PageLoading />}>
                <Market />
              </Suspense>
            }
          />
          <Route
            path="sync"
            element={
              <Suspense fallback={<PageLoading />}>
                <Sync />
              </Suspense>
            }
          />
          <Route
            path="trade-plans"
            element={
              <Suspense fallback={<PageLoading />}>
                <TradePlans />
              </Suspense>
            }
          />
          <Route
            path="trade-notes"
            element={
              <Suspense fallback={<PageLoading />}>
                <TradeNotes />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<PageLoading />}>
                <Settings />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
