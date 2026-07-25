import { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Select, InputNumber, Button, Table, Tag, Spin, Space, Statistic } from 'antd';
import ReactECharts from 'echarts-for-react';
import { Stock, Strategy, BacktestResult, Trade } from '@/types';
import { stockApi, strategyApi, backtestApi } from '@/services/api';

// 指标展示项定义：label + 取值函数 + 格式化方式
type Format = 'percent' | 'money' | 'ratio4' | 'ratio2' | 'int';

interface MetricItem {
  label: string;
  value: number | undefined;
  format: Format;
}

const formatValue = (value: number | undefined, format: Format): string => {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  switch (format) {
    case 'percent':
      return `${(value * 100).toFixed(2)}%`;
    case 'money':
      return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'ratio4':
      return value.toFixed(4);
    case 'ratio2':
      return value.toFixed(2);
    case 'int':
      return Math.round(value).toString();
    default:
      return String(value);
  }
};

// 从 trades 数组聚合交易统计与费用统计（后端 metrics 未返回时使用）
const aggregateTradeStats = (trades: Trade[]) => {
  const sellTrades = trades.filter(t => t.type === 'sell');
  const profits = sellTrades.map(t => t.profit ?? 0);

  const winningTrades = profits.filter(p => p > 0);
  const losingTrades = profits.filter(p => p < 0);

  const totalCommission = trades.reduce((sum, t) => sum + (t.commission ?? 0), 0);
  const totalStampTax = sellTrades.reduce((sum, t) => sum + (t.stamp_tax ?? 0), 0);
  const totalSlippage = trades.reduce((sum, t) => sum + (t.slippage ?? 0), 0);
  const totalFees = totalCommission + totalStampTax + totalSlippage;

  // 最大连胜/连败：按 卖出 顺序遍历 profit 符号
  let maxWins = 0;
  let maxLosses = 0;
  let curWins = 0;
  let curLosses = 0;
  for (const p of profits) {
    if (p > 0) {
      curWins += 1;
      curLosses = 0;
      if (curWins > maxWins) maxWins = curWins;
    } else if (p < 0) {
      curLosses += 1;
      curWins = 0;
      if (curLosses > maxLosses) maxLosses = curLosses;
    } else {
      curWins = 0;
      curLosses = 0;
    }
  }

  return {
    winning_trades: winningTrades.length,
    losing_trades: losingTrades.length,
    avg_winning_trade: winningTrades.length ? winningTrades.reduce((a, b) => a + b, 0) / winningTrades.length : undefined,
    avg_losing_trade: losingTrades.length ? losingTrades.reduce((a, b) => a + b, 0) / losingTrades.length : undefined,
    max_consecutive_wins: maxWins,
    max_consecutive_losses: maxLosses,
    total_commission: totalCommission,
    total_stamp_tax: totalStampTax,
    total_slippage: totalSlippage,
    total_fees: totalFees,
  };
};

const Backtest = () => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [strategies, setStrategies] = useState<Record<string, Strategy>>({});
  const [selectedStock, setSelectedStock] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [params, setParams] = useState<Record<string, number>>({});
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [stockRes, strategyRes] = await Promise.all([
        stockApi.getStocks(),
        strategyApi.getStrategies(),
      ]);
      setStocks(stockRes.data.data || []);
      setStrategies(strategyRes.data.data || {});
      if (stockRes.data.data?.length) {
        setSelectedStock(stockRes.data.data[0].code);
      }
      if (Object.keys(strategyRes.data.data || {}).length) {
        const firstStrategy = Object.keys(strategyRes.data.data)[0];
        setSelectedStrategy(firstStrategy);
        setParams(strategyRes.data.data[firstStrategy]?.params || {});
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  useEffect(() => {
    if (selectedStrategy && strategies[selectedStrategy]) {
      setParams(strategies[selectedStrategy].params || {});
    }
  }, [selectedStrategy, strategies]);

  const handleParamChange = (key: string, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const handleRunBacktest = async () => {
    if (!selectedStock || !selectedStrategy) return;

    setLoading(true);
    try {
      const res = await backtestApi.run(selectedStrategy, selectedStock, params);
      setResult(res.data);
    } catch (error) {
      console.error('Backtest failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // 合并后端 metrics + 从 trades 聚合的统计 + 从 equity_curve 推导的交易日数
  const mergedMetrics = useMemo(() => {
    if (!result) return null;
    const m = result.metrics || {};
    const stats = aggregateTradeStats(result.trades || []);
    const tradingDays = result.equity_curve?.length || undefined;
    const feeRatio =
      m.initial_cash && m.initial_cash > 0 && stats.total_fees
        ? stats.total_fees / m.initial_cash
        : undefined;
    return {
      ...m,
      ...stats,
      trading_days: tradingDays,
      fee_ratio: feeRatio,
    };
  }, [result]);

  const tradeColumns = [
    { title: '日期', dataIndex: 'date', key: 'date' },
    { title: '类型', dataIndex: 'type', key: 'type', render: (t: string) => <Tag color={t === 'buy' ? 'green' : 'red'}>{t === 'buy' ? '买入' : '卖出'}</Tag> },
    { title: '价格', dataIndex: 'price', key: 'price' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity' },
    { title: '佣金', dataIndex: 'commission', key: 'commission' },
    { title: '利润', dataIndex: 'profit', key: 'profit', render: (p: number) => <Tag color={p >= 0 ? 'green' : 'red'}>{p?.toFixed(2) || '-'}</Tag> },
  ];

  const equityChartOption = result ? {
    title: { text: '净值曲线' },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: result.equity_curve.map((_, i) => `Day ${i + 1}`) },
    yAxis: { type: 'value' },
    series: [{
      type: 'line',
      data: result.equity_curve,
      smooth: true,
      lineStyle: { color: '#1890ff' },
    }],
  } : {};

  // 5 类指标分组
  const metricGroups: { title: string; items: MetricItem[] }[] = mergedMetrics ? [
    {
      title: '收益类',
      items: [
        { label: '总收益率', value: mergedMetrics.total_return, format: 'percent' },
        { label: '年化收益率', value: mergedMetrics.annualized_return, format: 'percent' },
        { label: '初始资金', value: mergedMetrics.initial_cash, format: 'money' },
        { label: '最终权益', value: mergedMetrics.final_equity, format: 'money' },
        { label: '交易日数', value: mergedMetrics.trading_days, format: 'int' },
      ],
    },
    {
      title: '风险类',
      items: [
        { label: '最大回撤', value: mergedMetrics.max_drawdown, format: 'percent' },
        { label: '最大回撤天数', value: mergedMetrics.max_drawdown_days, format: 'int' },
        { label: '波动率', value: mergedMetrics.volatility, format: 'percent' },
        { label: '下行波动率', value: mergedMetrics.downside_volatility, format: 'percent' },
        { label: 'VaR(95%)', value: mergedMetrics.var_95, format: 'percent' },
      ],
    },
    {
      title: '风险调整类',
      items: [
        { label: '夏普比率', value: mergedMetrics.sharpe_ratio, format: 'ratio4' },
        { label: '索提诺比率', value: mergedMetrics.sortino_ratio, format: 'ratio4' },
        { label: '卡玛比率', value: mergedMetrics.calmar_ratio, format: 'ratio4' },
      ],
    },
    {
      title: '交易类',
      items: [
        { label: '总交易次数', value: mergedMetrics.num_trades, format: 'int' },
        { label: '盈利次数', value: mergedMetrics.winning_trades, format: 'int' },
        { label: '亏损次数', value: mergedMetrics.losing_trades, format: 'int' },
        { label: '胜率', value: mergedMetrics.win_rate, format: 'percent' },
        { label: '平均盈利', value: mergedMetrics.avg_winning_trade, format: 'money' },
        { label: '平均亏损', value: mergedMetrics.avg_losing_trade, format: 'money' },
        { label: '利润因子', value: mergedMetrics.profit_factor, format: 'ratio4' },
        { label: '期望收益', value: mergedMetrics.expected_return, format: 'money' },
        { label: '最大连胜', value: mergedMetrics.max_consecutive_wins, format: 'int' },
        { label: '最大连败', value: mergedMetrics.max_consecutive_losses, format: 'int' },
        { label: '平均持仓天数', value: mergedMetrics.avg_holding_days, format: 'ratio2' },
      ],
    },
    {
      title: '费用类',
      items: [
        { label: '总佣金', value: mergedMetrics.total_commission, format: 'money' },
        { label: '总印花税', value: mergedMetrics.total_stamp_tax, format: 'money' },
        { label: '总滑点', value: mergedMetrics.total_slippage, format: 'money' },
        { label: '总费用', value: mergedMetrics.total_fees, format: 'money' },
        { label: '费用比率', value: mergedMetrics.fee_ratio, format: 'percent' },
      ],
    },
  ] : [];

  return (
    <div style={{ padding: '20px' }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Select
            style={{ width: '100%' }}
            placeholder="选择股票"
            value={selectedStock}
            onChange={setSelectedStock}
            options={stocks.map(s => ({ label: `${s.code} ${s.name}`, value: s.code }))}
          />
        </Col>
        <Col span={6}>
          <Select
            style={{ width: '100%' }}
            placeholder="选择策略"
            value={selectedStrategy}
            onChange={setSelectedStrategy}
            options={Object.entries(strategies).map(([key, val]) => ({ label: `${key}: ${val.name}`, value: key }))}
          />
        </Col>
        <Col span={12}>
          <Space>
            {Object.entries(params).map(([key, value]) => (
              <InputNumber
                key={key}
                addonBefore={key}
                min={1}
                value={value}
                onChange={(v) => handleParamChange(key, v || 0)}
                style={{ width: 100 }}
              />
            ))}
            <Button type="primary" onClick={handleRunBacktest} loading={loading}>
              运行回测
            </Button>
          </Space>
        </Col>
      </Row>

      <Spin spinning={loading}>
        {result && mergedMetrics && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 指标分组卡片 */}
            <Row gutter={[16, 16]}>
              {metricGroups.map(group => (
                <Col xs={24} md={12} xl={8} key={group.title}>
                  <Card title={group.title} size="small">
                    <Row gutter={[8, 12]}>
                      {group.items.map(item => (
                        <Col span={12} key={item.label}>
                          <Statistic
                            title={item.label}
                            value={formatValue(item.value, item.format)}
                            valueStyle={{ fontSize: 16 }}
                          />
                        </Col>
                      ))}
                    </Row>
                  </Card>
                </Col>
              ))}
            </Row>

            {/* 净值曲线 + 交易记录 */}
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={12}>
                <Card title="净值曲线">
                  <ReactECharts option={equityChartOption} style={{ height: '400px' }} />
                </Card>
              </Col>
              <Col xs={24} xl={12}>
                <Card title="交易记录">
                  <Table
                    columns={tradeColumns}
                    dataSource={result.trades}
                    rowKey={(t, i) => `${t.date}-${t.type}-${i}`}
                    pagination={{ pageSize: 10 }}
                    scroll={{ y: 340 }}
                    size="small"
                  />
                </Card>
              </Col>
            </Row>
          </div>
        )}
      </Spin>
    </div>
  );
};

export default Backtest;
