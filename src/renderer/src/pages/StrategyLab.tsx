import { useState, useEffect } from 'react';
import { Card, Row, Col, Select, Input, Button, Table, Tag, Spin, Tabs } from 'antd';
import ReactECharts from 'echarts-for-react';
import { Stock, Strategy, Signal, TradingSignal, Factor, FactorScore } from '@/types';
import { stockApi, strategyApi, signalApi, factorApi } from '@/services/api';

const StrategyLab = () => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [strategies, setStrategies] = useState<Record<string, Strategy>>({});
  const [factors, setFactors] = useState<Record<string, Factor>>({});
  const [selectedStock, setSelectedStock] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [signals, setSignals] = useState<Signal[]>([]);
  const [analysis, setAnalysis] = useState<TradingSignal | null>(null);
  const [factorScores, setFactorScores] = useState<FactorScore[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [stockRes, strategyRes, factorRes] = await Promise.all([
        stockApi.getStocks(),
        strategyApi.getStrategies(),
        factorApi.getFactors(),
      ]);
      setStocks(stockRes.data.data || []);
      setStrategies(strategyRes.data.data || {});
      setFactors(factorRes.data.data || {});
      if (stockRes.data.data?.length) {
        setSelectedStock(stockRes.data.data[0].code);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const handleGetSignals = async () => {
    if (!selectedStock || !selectedStrategy) return;
    
    setLoading(true);
    try {
      const res = await strategyApi.getSignals(selectedStrategy, selectedStock);
      setSignals(res.data.data || []);
    } catch (error) {
      console.error('Failed to get signals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedStock) return;
    
    setLoading(true);
    try {
      const res = await signalApi.analyze(selectedStock);
      setAnalysis(res.data);
    } catch (error) {
      console.error('Failed to analyze:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFactorScore = async () => {
    setLoading(true);
    try {
      const res = await factorApi.score();
      setFactorScores(res.data.data || []);
    } catch (error) {
      console.error('Failed to get factor scores:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    const stock = stocks.find(s => s.code === searchCode || s.name.includes(searchCode));
    if (stock) {
      setSelectedStock(stock.code);
    }
  };

  const signalColumns = [
    { title: '日期', dataIndex: 'date', key: 'date' },
    { title: '收盘价', dataIndex: 'close', key: 'close' },
    { title: '信号', dataIndex: 'signal', key: 'signal', render: (s: string) => <Tag color={s === 'buy' ? 'green' : s === 'sell' ? 'red' : 'gray'}>{s}</Tag> },
  ];

  const factorColumns = [
    { title: '股票代码', dataIndex: 'stock_code', key: 'stock_code' },
    { title: '综合评分', dataIndex: 'score', key: 'score', sortable: true },
    { title: '收盘价', dataIndex: 'close', key: 'close' },
  ];

  const signalChartOption = signals.length ? {
    title: { text: '策略信号' },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: signals.map(s => s.date) },
    yAxis: { type: 'value' },
    series: [{
      type: 'line',
      data: signals.map(s => s.close),
      smooth: true,
      lineStyle: { color: '#1890ff' },
    }],
  } : {};

  const renderAnalysis = () => {
    if (!analysis) return null;
    
    return (
      <Card title="信号分析结果">
        <div style={{ marginBottom: 16 }}>
          <Tag color={analysis.signal.includes('BUY') ? 'green' : analysis.signal.includes('SELL') ? 'red' : 'gray'}>
            {analysis.signal}
          </Tag>
          <span style={{ marginLeft: 16, fontSize: '24px', fontWeight: 'bold' }}>
            评分: {analysis.score}
          </span>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {Object.entries(analysis.dimensions).map(([key, value]) => (
            <div key={key}>
              <div style={{ fontSize: '12px', color: '#888' }}>{key}</div>
              <div style={{ fontSize: '18px' }}>{value.toFixed(0)}</div>
            </div>
          ))}
        </div>
        
        {analysis.trade_plan && (
          <div style={{ marginTop: 16, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>交易计划</div>
            <div>入场价: {analysis.trade_plan.entry_price}</div>
            <div>止损价: {analysis.trade_plan.stop_loss}</div>
            <div>止盈价: {analysis.trade_plan.take_profit}</div>
            <div>仓位: {(analysis.trade_plan.position_pct * 100).toFixed(0)}%</div>
            <div>风险收益比: {analysis.trade_plan.risk_reward_ratio}</div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div style={{ padding: '20px' }}>
      <Tabs
        items={[
          {
            key: 'strategy',
            label: '策略信号',
            children: (
              <div>
                <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                  <Col span={6}>
                    <Input.Search
                      placeholder="搜索股票"
                      value={searchCode}
                      onChange={e => setSearchCode(e.target.value)}
                      onSearch={handleSearch}
                    />
                  </Col>
                  <Col span={6}>
                    <Select
                      style={{ width: '100%' }}
                      value={selectedStock}
                      onChange={setSelectedStock}
                      options={stocks.map(s => ({ label: `${s.code} ${s.name}`, value: s.code }))}
                    />
                  </Col>
                  <Col span={6}>
                    <Select
                      style={{ width: '100%' }}
                      value={selectedStrategy}
                      onChange={setSelectedStrategy}
                      options={Object.entries(strategies).map(([key, val]) => ({ label: `${key}: ${val.name}`, value: key }))}
                    />
                  </Col>
                  <Col span={6}>
                    <Button type="primary" onClick={handleGetSignals} loading={loading}>
                      获取信号
                    </Button>
                  </Col>
                </Row>

                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Card title="K线与信号">
                      <ReactECharts option={signalChartOption} style={{ height: '400px' }} />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card title="信号列表">
                      <Table
                        columns={signalColumns}
                        dataSource={signals}
                        rowKey="date"
                        pagination={{ pageSize: 10 }}
                        scroll={{ y: 300 }}
                      />
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'analysis',
            label: '信号分析',
            children: (
              <div>
                <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                  <Col span={6}>
                    <Select
                      style={{ width: '100%' }}
                      value={selectedStock}
                      onChange={setSelectedStock}
                      options={stocks.map(s => ({ label: `${s.code} ${s.name}`, value: s.code }))}
                    />
                  </Col>
                  <Col span={6}>
                    <Button type="primary" onClick={handleAnalyze} loading={loading}>
                      分析股票
                    </Button>
                  </Col>
                </Row>
                {renderAnalysis()}
              </div>
            ),
          },
          {
            key: 'factors',
            label: '因子评分',
            children: (
              <div>
                <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                  <Col span={6}>
                    <Button type="primary" onClick={handleFactorScore} loading={loading}>
                      计算因子评分
                    </Button>
                  </Col>
                </Row>
                <Card title="因子评分排行">
                  <Table
                    columns={factorColumns}
                    dataSource={factorScores}
                    rowKey="stock_code"
                    pagination={{ pageSize: 10 }}
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};

export default StrategyLab;