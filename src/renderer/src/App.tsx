/** QuantTerminal 根组件
 *
 * 路由结构：
 *   /login         → Login（公开）
 *   /              → MainLayout（受保护，含侧边栏 20 模块）
 *     ├─ /dashboard
 *     ├─ /decision
 *     ├─ /compare
 *     ├─ /workbench
 *     ├─ /radar
 *     ├─ /stocks
 *     ├─ /watchlists
 *     ├─ /portfolios
 *     ├─ /backtest
 *     ├─ /strategies
 *     ├─ /factors
 *     ├─ /screener
 *     ├─ /realtime
 *     ├─ /market
 *     ├─ /sync
 *     ├─ /trade-plans
 *     ├─ /trade-notes
 *     ├─ /settings (admin)
 *     ├─ /audit    (admin)
 *     └─ /about
 */
import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuth } from './services/authStore';

// 懒加载所有页面（menu.tsx 内已用 lazy，但路由级别仍需直接引用以绑定 Route）
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Decision = lazy(() => import('./pages/Decision'));
const Compare = lazy(() => import('./pages/Compare'));
const Workbench = lazy(() => import('./pages/Workbench'));
const Radar = lazy(() => import('./pages/Radar'));
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
const Audit = lazy(() => import('./pages/Audit'));
const About = lazy(() => import('./pages/About'));

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
            path="decision"
            element={
              <Suspense fallback={<PageLoading />}>
                <Decision />
              </Suspense>
            }
          />
          <Route
            path="compare"
            element={
              <Suspense fallback={<PageLoading />}>
                <Compare />
              </Suspense>
            }
          />
          <Route
            path="workbench"
            element={
              <Suspense fallback={<PageLoading />}>
                <Workbench />
              </Suspense>
            }
          />
          <Route
            path="radar"
            element={
              <Suspense fallback={<PageLoading />}>
                <Radar />
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
          <Route
            path="audit"
            element={
              <Suspense fallback={<PageLoading />}>
                <Audit />
              </Suspense>
            }
          />
          <Route
            path="about"
            element={
              <Suspense fallback={<PageLoading />}>
                <About />
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
