import { useState, useEffect } from 'react';
import { Card, Row, Col, Select, InputNumber, Button, Table, Tag, Spin, Space, Statistic } from 'antd';
import ReactECharts from 'echarts-for-react';
import { Stock, Strategy, BacktestResult } from '@/types';
import { stockApi, strategyApi, backtestApi } from '@/services/api';

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
                label={key}
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
        {result && (
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Card title="回测指标">
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  <Statistic title="总收益率" value={result.summary.total_return} />
                  <Statistic title="年化收益率" value={result.summary.annualized_return} />
                  <Statistic title="最大回撤" value={result.summary.max_drawdown} />
                  <Statistic title="夏普比率" value={result.summary.sharpe_ratio} />
                  <Statistic title="胜率" value={result.summary.win_rate} />
                  <Statistic title="盈亏比" value={result.summary.profit_factor} />
                  <Statistic title="交易次数" value={result.summary.num_trades} />
                </Space>
              </Card>
            </Col>
            <Col span={8}>
              <Card title="净值曲线">
                <ReactECharts option={equityChartOption} style={{ height: '400px' }} />
              </Card>
            </Col>
            <Col span={8}>
              <Card title="交易记录">
                <Table
                  columns={tradeColumns}
                  dataSource={result.trades}
                  rowKey={(t, i) => `${t.date}-${t.type}-${i}`}
                  pagination={{ pageSize: 10 }}
                  scroll={{ y: 300 }}
                />
              </Card>
            </Col>
          </Row>
        )}
      </Spin>
    </div>
  );
};

export default Backtest;