export interface Stock {
  id: number;
  code: string;
  name: string;
  market: string;
}

export interface KlineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  code: string;
}

export interface Strategy {
  name: string;
  type: string;
  description: string;
  params: Record<string, number>;
}

export interface Signal {
  date: string;
  signal: 'buy' | 'sell' | 'hold';
  close: number;
}

export interface TradingSignal {
  stock_code: string;
  signal: string;
  score: number;
  trade_plan: TradePlan | null;
  dimensions: Record<string, number>;
}

export interface TradePlan {
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  position_pct: number;
  risk_reward_ratio: number;
}

export interface BacktestResult {
  strategy: string;
  stock_code: string;
  metrics: Metrics;
  summary: Summary;
  trades: Trade[];
  equity_curve: number[];
}

export interface Metrics {
  total_return: number;
  annualized_return: number;
  volatility: number;
  downside_volatility: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  calmar_ratio: number;
  win_rate: number;
  profit_factor: number;
  expected_return: number;
  num_trades: number;
}

export interface Summary {
  total_return: string;
  annualized_return: string;
  max_drawdown: string;
  sharpe_ratio: string;
  win_rate: string;
  profit_factor: string;
  num_trades: number;
  initial_cash: string;
  final_equity: string;
}

export interface Trade {
  date: string;
  code: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  commission: number;
  slippage?: number;
  stamp_tax?: number;
  profit?: number;
}

export interface Factor {
  name: string;
  direction: string;
  default_weight: number;
  description: string;
}

export interface FactorScore {
  stock_code: string;
  score: number;
  factor_scores: Record<string, number>;
  close: number;
}

export interface ICAnalysis {
  ic: number;
  rank_ic: number;
  samples: number;
  factor_code: string;
  factor_name: string;
}

export interface ScreenerCondition {
  name: string;
  description: string;
  params: Record<string, number>;
}

export interface ScreenerResult {
  stock_code: string;
  close: number;
  volume: number;
  matched_conditions: string[];
}

export interface SyncResult {
  stock_code?: string;
  type?: string;
  new?: number;
  deleted?: number;
  total?: number;
  added?: number;
}

export interface StorageHealth {
  status: string;
  stock_count: number;
  bar_count: number;
  last_updated: string;
  error?: string;
}