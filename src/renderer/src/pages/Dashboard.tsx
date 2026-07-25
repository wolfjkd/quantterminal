import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Button, Space, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import { Stock, TradingSignal, StorageHealth } from '@/types';
import { stockApi, signalApi, healthApi, syncApi } from '@/services/api';

const Dashboard = () => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [stockRes, signalRes, healthRes] = await Promise.all([
        stockApi.getStocks(),
        signalApi.scan({ min_score: 60 }),
        healthApi.storageHealth(),
      ]);
      setStocks(stockRes.data.data || []);
      setSignals(signalRes.data.data || []);
      setHealth(healthRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      await syncApi.sync();
      await fetchData();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'STRONG_BUY':
      case 'BUY':
        return 'green';
      case 'STRONG_SELL':
      case 'SELL':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getSignalText = (signal: string) => {
    switch (signal) {
      case 'STRONG_BUY':
        return '强力买入';
      case 'BUY':
        return '买入';
      case 'STRONG_SELL':
        return '强力卖出';
      case 'SELL':
        return '卖出';
      case 'HOLD':
        return '持有';
      default:
        return '观望';
    }
  };

  const signalColumns = [
    { title: '股票代码', dataIndex: 'stock_code', key: 'stock_code', width: 100 },
    { title: '信号', dataIndex: 'signal', key: 'signal', width: 100, render: (s: string) => <Tag color={getSignalColor(s)}>{getSignalText(s)}</Tag> },
    { title: '评分', dataIndex: 'score', key: 'score', width: 80 },
    { title: '趋势', dataIndex: 'dimensions', key: 'trend', width: 80, render: (d: Record<string, number>) => d.trend || '-' },
    { title: '动量', dataIndex: 'dimensions', key: 'momentum', width: 80, render: (d: Record<string, number>) => d.momentum || '-' },
    { title: '量能', dataIndex: 'dimensions', key: 'volume', width: 80, render: (d: Record<string, number>) => d.volume || '-' },
  ];

  const chartOption = {
    title: { text: '今日信号分布' },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: ['买入', '卖出', '持有', '观望'] },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar',
      data: [
        signals.filter(s => s.signal === 'BUY' || s.signal === 'STRONG_BUY').length,
        signals.filter(s => s.signal === 'SELL' || s.signal === 'STRONG_SELL').length,
        signals.filter(s => s.signal === 'HOLD').length,
        signals.filter(s => s.signal === 'AVOID').length,
      ],
      itemStyle: {
        color: ['#52c41a', '#f5222d', '#faad14', '#d9d9d9'],
      },
    }],
  };

  return (
    <Spin spinning={loading}>
      <div style={{ padding: '20px' }}>
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col span={6}>
            <Card>
              <Statistic title="股票总数" value={stocks.length} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="数据条数" value={health?.bar_count || 0} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="买入信号" value={signals.filter(s => s.signal === 'BUY' || s.signal === 'STRONG_BUY').length} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="数据状态" value={health?.status === 'healthy' ? '健康' : '异常'} />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col span={16}>
            <Card title="今日信号扫描" extra={<Button onClick={handleSync}>同步数据</Button>}>
              <Table
                columns={signalColumns}
                dataSource={signals.slice(0, 20)}
                rowKey="stock_code"
                pagination={{ pageSize: 10 }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card title="信号分布">
              <ReactECharts option={chartOption} style={{ height: '300px' }} />
            </Card>
            <Card title="数据概览" style={{ marginTop: 16 }}>
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <div>股票数量: {stocks.length}</div>
                <div>K线数据: {health?.bar_count.toLocaleString() || 0}</div>
                <div>最后更新: {health?.last_updated || '-'}</div>
              </Space>
            </Card>
          </Col>
        </Row>
      </div>
    </Spin>
  );
};

export default Dashboard;