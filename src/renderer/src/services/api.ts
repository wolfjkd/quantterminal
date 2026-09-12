/** QuantTerminal API 客户端
 *
 */
import axios, { AxiosError } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001';

const TOKEN_KEY = 'qt_access_token';
const USER_KEY = 'qt_user_info';

export const tokenStorage = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export const userStorage = {
  get: () => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  set: (u: unknown) => localStorage.setItem(USER_KEY, JSON.stringify(u)),
};

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

// 请求拦截：自动加 Authorization
api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：401 跳登录
api.interceptors.response.use(
  (resp) => resp,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      tokenStorage.clear();
      // 用 location 跳转，避免循环依赖
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?from=' + encodeURIComponent(window.location.pathname);
      }
    }
    return Promise.reject(error);
  },
);

export default api;

// ============ 业务 API ============

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{
      access_token: string;
      token_type: string;
      user: UserInfo;
    }>('/auth/login', { username, password }),
  me: () => api.get<UserInfo>('/auth/me'),
  logout: () => api.post('/auth/logout'),
  changePassword: (old_password: string, new_password: string) =>
    api.post('/auth/change-password', { old_password, new_password }),
};

export const dashboardApi = {
  overview: () => api.get('/dashboard'),
};

export const decisionApi = {
  index: () => api.get('/decision'),
  history: (page = 1, page_size = 20) =>
    api.get('/decision/history', { params: { page, page_size } }),
  runDetail: (run_id: number) => api.get(`/decision/run/${run_id}`),
  stockHistory: (code: string) => api.get(`/decision/stock/${code}`),
  run: (payload: Record<string, unknown>) => api.post('/decision/run', payload),
};

export const compareApi = {
  overview: () => api.get('/compare'),
  stockDetail: (code: string) => api.get(`/compare/stocks/${code}`),
  updateFocus: (stocks: Array<{ code: string; name?: string; note?: string; color?: string }>) =>
    api.put('/compare/focus', { stocks }),
};

export const workbenchApi = {
  index: (strategy = 'composite') =>
    api.get('/workbench', { params: { strategy } }),
  run: (payload: Record<string, unknown>) => api.post('/workbench/run', payload),
  prepare: (mode = 'smart', limit = 30) =>
    api.post('/workbench/prepare', { mode, limit }),
};

export const radarApi = {
  overview: (live = false) => api.get('/radar', { params: { live } }),
  compare: () => api.get('/radar/compare'),
  validate: () => api.get('/radar/validate'),
  ingest: (source: string, limit: number) =>
    api.post('/radar/ingest', { source, limit }),
};

export const stocksApi = {
  list: (params: {
    market?: string;
    board?: string;
    is_st?: number;
    keyword?: string;
    page?: number;
    page_size?: number;
  }) => api.get('/stocks', { params }),
  detail: (code: string) => api.get(`/stocks/${code}`),
};

export const watchlistApi = {
  list: () => api.get('/watchlists'),
  create: (name: string, remark = '') => api.post('/watchlists', { name, remark }),
  detail: (id: number) => api.get(`/watchlists/${id}`),
  addItem: (wl_id: number, stock_id: number, note = '') =>
    api.post(`/watchlists/${wl_id}/items`, { stock_id, note }),
  removeItem: (wl_id: number, item_id: number) =>
    api.delete(`/watchlists/${wl_id}/items/${item_id}`),
};

export const portfolioApi = {
  list: () => api.get('/portfolios'),
  detail: (id: number) => api.get(`/portfolios/${id}`),
  create: (name: string, initial_cash?: number) =>
    api.post('/portfolios', { name, initial_cash }),
  order: (pf_id: number, stock_id: number, side: 'buy' | 'sell', qty: number) =>
    api.post(`/portfolios/${pf_id}/order`, { stock_id, side, qty }),
  settle: (pf_id: number) => api.post(`/portfolios/${pf_id}/settle`),
  equity: (pf_id: number, days = 60) =>
    api.get(`/portfolios/${pf_id}/equity`, { params: { days } }),
};

export const backtestApi = {
  jobs: (page = 1, page_size = 20) =>
    api.get('/backtest', { params: { page, page_size } }),
  catalog: () => api.get('/backtest/catalog'),
  detail: (job_id: number) => api.get(`/backtest/${job_id}`),
  run: (payload: Record<string, unknown>) => api.post('/backtest/run', payload),
};

export const strategyApi = {
  catalog: () => api.get('/strategies/catalog'),
  list: () => api.get('/strategies'),
  detail: (id: number) => api.get(`/strategies/${id}`),
  create: (payload: Record<string, unknown>) => api.post('/strategies', payload),
  update: (id: number, payload: Record<string, unknown>) => api.put(`/strategies/${id}`, payload),
  remove: (id: number) => api.delete(`/strategies/${id}`),
};

export const factorApi = {
  // 内置因子目录（quantengine）
  catalog: () => api.get('/factors/catalog'),
  available: () => api.get('/factors/available'),
  // 自定义因子 CRUD
  list: () => api.get('/factors'),
  detail: (id: number) => api.get(`/factors/${id}`),
  create: (payload: Record<string, unknown>) => api.post('/factors', payload),
  update: (id: number, payload: Record<string, unknown>) => api.put(`/factors/${id}`, payload),
  remove: (id: number) => api.delete(`/factors/${id}`),
  // 因子打分选股
  score: (payload: {
    factor_weights: Record<string, number>;
    top_n?: number;
    filters?: Record<string, unknown>;
    limit?: number;
    board?: string;
    industry?: string;
  }) => api.post('/factors/score', payload),
  // IC 分析
  ic: (factor_code: string, limit = 500, period = 60) =>
    api.post('/factors/ic', { factor_code, limit, period }),
};

export const screenerApi = {
  conditions: () => api.get('/screener/conditions'),
  available: () => api.get('/screener/available'),
  screen: (payload: {
    conditions: Record<string, Record<string, unknown>>;
    filters?: Record<string, unknown>;
    limit?: number;
    board?: string;
    industry?: string;
    top_n?: number;
  }) => api.post('/screener/screen', payload),
};

export const realtimeApi = {
  stock: (code: string) => api.get(`/realtime/${code}`),
  // 通达信实时行情源（eltdx 协议）
  tfhubHealth: () => api.get(`/realtime/tfhub/health`),
  tfhubQuote: (codes: string[]) =>
    api.post(`/realtime/tfhub/quote`, { codes }),
  tfhubAuction: (code: string) => api.get(`/realtime/tfhub/auction/${code}`),
  tfhubMinute: (code: string) => api.get(`/realtime/tfhub/minute/${code}`),
};

export const marketApi = {
  overview: () => api.get('/market'),
  sectors: () => api.get('/market/sectors'),
};

export const syncApi = {
  logs: (params: { page?: number; page_size?: number; status?: string; source?: string } = {}) =>
    api.get('/sync/logs', { params }),
  health: () => api.get('/sync/health'),
  run: (stock_code = '', mode = 'incremental') => api.post('/sync', { stock_code, mode }),
  // 拉取单股日K线（东方财富 push2his）
  syncBars: (payload: {
    stock_code: string;
    beg_date?: string;  // YYYYMMDD，默认 1 年前
    end_date?: string;  // YYYYMMDD，默认今天
    fqt?: number;       // 0=不复权 1=前复权 2=后复权
  }) => api.post('/sync/bars', payload),
  // 批量同步所有股票K线
  syncAllBars: (payload: {
    beg_date?: string;
    end_date?: string;
    fqt?: number;
  }) => api.post('/sync/bars-all', payload, { timeout: 600000 }),  // 10 分钟超时
  // 全市场股票列表扩容（东方财富 push2 clist）
  syncStocks: () => api.post('/sync/stocks', {}),
  // 实时报价快照（东方财富 push2 qt stock get）
  realtime: (code: string) => api.get(`/sync/realtime/${encodeURIComponent(code)}`),
};

export interface TradingParamItem {
  key: string;
  label: string;
  default: string;
  unit: string;
  description: string;
  input_type: 'number' | 'select';
  options?: string[] | null;
  current: string;
  is_default: boolean;
}

export const settingsApi = {
  list: () => api.get('/settings'),
  create: (payload: { setting_key: string; setting_value: string; remark?: string }) =>
    api.post('/settings', payload),
  update: (key: string, value: string, remark?: string) =>
    api.put(`/settings/${key}`, { setting_value: value, remark }),
  remove: (key: string) => api.delete(`/settings/${key}`),
  // 交易参数（11 个固定参数）
  tradingParams: () => api.get<{ data: TradingParamItem[]; count: number }>('/settings/trading-params'),
  updateTradingParams: (payload: Record<string, string>) =>
    api.put<{ updated: Record<string, string>; count: number }>('/settings/trading-params', payload),
  // 用户管理（管理员）
  users: () => api.get('/settings/users'),
  createUser: (payload: Record<string, unknown>) => api.post('/settings/users', payload),
  updateUser: (uid: number, payload: Record<string, unknown>) => api.put(`/settings/users/${uid}`, payload),
  removeUser: (uid: number) => api.delete(`/settings/users/${uid}`),
};

export const auditApi = {
  list: (params: {
    action?: string; user_id?: number; keyword?: string;
    start_date?: string; end_date?: string;
    page?: number; page_size?: number;
  }) => api.get('/audit', { params }),
  stats: (days = 30) => api.get('/audit/stats', { params: { days } }),
  export: (params: {
    action?: string; user_id?: number; keyword?: string;
    start_date?: string; end_date?: string;
  }) => api.get('/audit/export', {
    params,
    responseType: 'blob',
  }),
};

export const tradePlanApi = {
  list: (portfolio_id?: number, status?: string) =>
    api.get('/trade-plans', { params: { portfolio_id, status } }),
  create: (payload: Record<string, unknown>) => api.post('/trade-plans', payload),
  close: (plan_id: number, reason = 'manual') =>
    api.post(`/trade-plans/${plan_id}/close`, null, { params: { reason } }),
};

export const tradeNoteApi = {
  list: (code?: string, page = 1, page_size = 50) =>
    api.get('/trade-notes', { params: { code, page, page_size } }),
  create: (code: string, content: string) => api.post('/trade-notes', { code, content }),
  remove: (id: number) => api.delete(`/trade-notes/${id}`),
};

export const healthApi = {
  health: () => api.get('/health'),
};

// ============ 类型 ============

export interface UserInfo {
  id: number;
  username: string;
  realname: string;
  role: string;
  phone: string;
  status: number;
}
