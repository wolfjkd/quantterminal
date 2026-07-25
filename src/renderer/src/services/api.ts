import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL,
  timeout: 30000,
});

export const stockApi = {
  getStocks: (market?: string) => api.get('/stocks', { params: { market } }),
  getKline: (stock_code: string, start_date?: string, end_date?: string) =>
    api.get(`/kline/${stock_code}`, { params: { start_date, end_date } }),
};

export const backtestApi = {
  run: (strategy: string, stock_code: string, params?: Record<string, any>, settings?: Record<string, any>) =>
    api.post('/backtest', { strategy, stock_code, params, settings }),
};

export const strategyApi = {
  getStrategies: () => api.get('/strategies'),
  getSignals: (strategy: string, stock_code: string, params?: Record<string, any>) =>
    api.post('/strategy/signals', { strategy, stock_code, params }),
};

export const signalApi = {
  analyze: (stock_code: string, filters?: Record<string, any>) =>
    api.post('/signal/analyze', { stock_code, filters }),
  scan: (filters?: Record<string, any>) => api.post('/signal/scan', { filters }),
};

export const factorApi = {
  getFactors: () => api.get('/factors'),
  score: (factor_weights?: Record<string, number>, filters?: Record<string, any>) =>
    api.post('/factors/score', { factor_weights, filters }),
  icAnalysis: (factor_code: string) => api.get(`/factors/ic/${factor_code}`),
};

export const screenerApi = {
  getConditions: () => api.get('/screener/conditions'),
  screen: (conditions: Record<string, Record<string, any>>, filters?: Record<string, any>) =>
    api.post('/screener/screen', { conditions, filters }),
};

export const syncApi = {
  sync: (stock_code?: string, mode: string = 'incremental') =>
    api.post('/sync', { stock_code, mode }),
};

export const healthApi = {
  health: () => api.get('/health'),
  storageHealth: () => api.get('/storage/health'),
};

export default api;