/** 市场雷达
 *
 * 三个 Tab：
 *   1. 全市场雷达：涨跌幅/成交额/换手榜单
 *   2. 策略对比：多策略命中率对比
 *   3. 信号验证：历史信号前向收益验证
 */
import { useEffect, useState } from 'react';
import {
  Card, Tabs, Table, Tag, Button, Space, Typography, Statistic, Row, Col,
  Progress, message, Alert, Descriptions,
} from 'antd';
import {
  ReloadOutlined, RadarChartOutlined, ThunderboltOutlined,
  ArrowUpOutlined, ArrowDownOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { radarApi } from '../services/api';

const { Title, Text } = Typography;

// ============ 类型 ============
interface RadarItem {
  code: string;
  name: string;
  market: string;
  board: string;
  close: number;
  prev_close: number;
  change_pct: number;
  amplitude: number;
  amount: number;
  volume: number;
  high: number;
  low: number;
  open: number;
}

interface RadarSummary {
  total: number;
  up_count: number;
  down_count: number;
  flat_count: number;
  avg_change: number;
  up_ratio: number;
}

interface RadarData {
  as_of: string | null;
  gainers: RadarItem[];
  losers: RadarItem[];
  amount_leaders: RadarItem[];
  turnover_leaders: RadarItem[];
  summary: RadarSummary;
  message?: string;
}

interface CompareData {
  strategies: Array<{ key: string; name: string; type: string; description: string }>;
  rows: Array<Record<string, unknown>>;
  counts: Record<string, number>;
  last_run_id: number | null;
  as_of: string | null;
}

interface ValidateStats {
  horizon: number;
  win_rate: number;
  avg_return: number;
  signals: number;
}

interface ValidateData {
  strategy: string;
  start_date: string;
  end_date: string;
  test_stocks_count: number;
  sample_dates_count: number;
  total_signals: number;
  horizons: number[];
  stats: ValidateStats[];
  signals: Array<{
    code: string;
    name: string;
    signal_date: string;
    signal: string;
    score: number;
    entry_close: number;
    returns: Record<number, number>;
  }>;
  error?: string;
}

// ============ 主组件 ============
export default function Radar() {
  const [activeTab, setActiveTab] = useState('overview');
  const [radar, setRadar] = useState<RadarData | null>(null);
  const [compare, setCompare] = useState<CompareData | null>(null);
  const [validate, setValidate] = useState<ValidateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);

  const fetchRadar = async () => {
    setLoading(true);
    try {
      const { data } = await radarApi.overview();
      setRadar(data);
    } catch (err) {
      message.error('加载雷达失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompare = async () => {
    setLoading(true);
    try {
      const { data } = await radarApi.compare();
      setCompare(data);
    } catch (err) {
      message.error('加载策略对比失败');
    } finally {
      setLoading(false);
    }
  };

  const runValidate = async () => {
    setValidating(true);
    try {
      const { data } = await radarApi.validate();
      setValidate(data);
      if (data.error) {
        message.error(data.error);
      } else {
        message.success(`验证完成：${data.total_signals} 个信号`);
      }
    } catch (err) {
      message.error('信号验证失败');
    } finally {
      setValidating(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'overview' && !radar) fetchRadar();
    else if (activeTab === 'compare' && !compare) fetchCompare();
    else if (activeTab === 'validate' && !validate) runValidate();
  }, [activeTab]);

  // ============ 表格列 ============
  const radarColumns = [
    { title: '代码', dataIndex: 'code', width: 100, render: (v: string) => <strong>{v}</strong> },
    { title: '名称', dataIndex: 'name', width: 110 },
    {
      title: '现价', dataIndex: 'close', width: 80,
      render: (v: number) => v.toFixed(2),
    },
    {
      title: '涨跌幅', dataIndex: 'change_pct', width: 100,
      render: (v: number) => (
        <Tag color={v > 0 ? 'red' : v < 0 ? 'green' : 'default'}>
          {v > 0 ? '+' : ''}{v.toFixed(2)}%
        </Tag>
      ),
      sorter: (a: RadarItem, b: RadarItem) => a.change_pct - b.change_pct,
    },
    {
      title: '振幅', dataIndex: 'amplitude', width: 80,
      render: (v: number) => `${v.toFixed(2)}%`,
    },
    {
      title: '成交额', dataIndex: 'amount', width: 120,
      render: (v: number) => formatAmount(v),
      sorter: (a: RadarItem, b: RadarItem) => a.amount - b.amount,
    },
    {
      title: '成交量', dataIndex: 'volume', width: 100,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '最高/最低', width: 120,
      render: (_: unknown, r: RadarItem) => `${r.high.toFixed(2)} / ${r.low.toFixed(2)}`,
    },
  ];

  // ============ 渲染 ============
  return (
    <div style={{ padding: 20 }}>
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'overview',
              label: <span><RadarChartOutlined /> 全市场雷达</span>,
              children: (
                <div>
                  {radar?.summary && (
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                      <Col span={4}>
                        <Card size="small"><Statistic title="总股票数" value={radar.summary.total} /></Card>
                      </Col>
                      <Col span={4}>
                        <Card size="small">
                          <Statistic title="上涨" value={radar.summary.up_count}
                            valueStyle={{ color: '#cf1322' }}
                            prefix={<ArrowUpOutlined />} />
                        </Card>
                      </Col>
                      <Col span={4}>
                        <Card size="small">
                          <Statistic title="下跌" value={radar.summary.down_count}
                            valueStyle={{ color: '#3f8600' }}
                            prefix={<ArrowDownOutlined />} />
                        </Card>
                      </Col>
                      <Col span={4}>
                        <Card size="small"><Statistic title="平盘" value={radar.summary.flat_count} /></Card>
                      </Col>
                      <Col span={4}>
                        <Card size="small">
                          <Statistic title="上涨比" value={radar.summary.up_ratio} suffix="%"
                            valueStyle={{ color: radar.summary.up_ratio >= 50 ? '#cf1322' : '#3f8600' }} />
                        </Card>
                      </Col>
                      <Col span={4}>
                        <Card size="small">
                          <Statistic title="平均涨跌" value={radar.summary.avg_change} suffix="%"
                            valueStyle={{ color: radar.summary.avg_change >= 0 ? '#cf1322' : '#3f8600' }} />
                        </Card>
                      </Col>
                    </Row>
                  )}

                  <Space style={{ marginBottom: 16 }}>
                    <Text type="secondary">数据日期：{radar?.as_of ?? '-'}</Text>
                    <Button icon={<ReloadOutlined />} onClick={fetchRadar} loading={loading}>刷新</Button>
                  </Space>

                  <Tabs
                    items={[
                      {
                        key: 'gainers',
                        label: <span style={{ color: '#cf1322' }}>涨幅榜 ({radar?.gainers?.length ?? 0})</span>,
                        children: (
                          <Table rowKey="code" size="small" dataSource={radar?.gainers ?? []}
                            columns={radarColumns} pagination={{ pageSize: 15 }} />
                        ),
                      },
                      {
                        key: 'losers',
                        label: <span style={{ color: '#3f8600' }}>跌幅榜 ({radar?.losers?.length ?? 0})</span>,
                        children: (
                          <Table rowKey="code" size="small" dataSource={radar?.losers ?? []}
                            columns={radarColumns} pagination={{ pageSize: 15 }} />
                        ),
                      },
                      {
                        key: 'amount',
                        label: `成交额榜 (${radar?.amount_leaders?.length ?? 0})`,
                        children: (
                          <Table rowKey="code" size="small" dataSource={radar?.amount_leaders ?? []}
                            columns={radarColumns} pagination={{ pageSize: 15 }} />
                        ),
                      },
                      {
                        key: 'turnover',
                        label: `成交活跃榜 (${radar?.turnover_leaders?.length ?? 0})`,
                        children: (
                          <Table rowKey="code" size="small" dataSource={radar?.turnover_leaders ?? []}
                            columns={radarColumns} pagination={{ pageSize: 15 }} />
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },
            {
              key: 'compare',
              label: <span><ThunderboltOutlined /> 策略对比</span>,
              children: (
                <div>
                  <Space style={{ marginBottom: 16 }}>
                    <Text type="secondary">最近 Run：#{compare?.last_run_id ?? '-'} / 日期：{compare?.as_of ?? '-'}</Text>
                    <Button icon={<ReloadOutlined />} onClick={fetchCompare} loading={loading}>刷新</Button>
                  </Space>
                  {compare && (
                    <Row gutter={8} style={{ marginBottom: 16 }}>
                      {compare.strategies.map((s) => (
                        <Col span={8} key={s.key}>
                          <Card size="small">
                            <Statistic title={s.name} value={compare.counts[s.key] ?? 0}
                              suffix="买入" prefix={<CheckCircleOutlined />}
                              valueStyle={{ color: '#cf1322' }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>{s.description}</Text>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  )}
                  <Table
                    rowKey="code"
                    size="small"
                    dataSource={compare?.rows ?? []}
                    pagination={{ pageSize: 15 }}
                    columns={[
                      { title: '代码', dataIndex: 'code', width: 100, render: (v: string) => <strong>{v}</strong> },
                      { title: '名称', dataIndex: 'name', width: 110 },
                      { title: '现价', dataIndex: 'close_price', width: 80, render: (v: number) => v?.toFixed(2) },
                      { title: '信号', dataIndex: 'signal', width: 100, render: (v: string) => <Tag color="volcano">{v}</Tag> },
                      { title: '评分', dataIndex: 'score', width: 80, render: (v: number) => v?.toFixed(1) },
                      ...(compare?.strategies ?? []).map((s) => ({
                        title: s.name, dataIndex: s.key, width: 100,
                        render: (v: number) => v?.toFixed(1) ?? '-',
                      })),
                    ]}
                  />
                </div>
              ),
            },
            {
              key: 'validate',
              label: <span><CheckCircleOutlined /> 信号验证</span>,
              children: (
                <div>
                  <Space style={{ marginBottom: 16 }}>
                    <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => runValidate()} loading={validating}>
                      运行验证
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={() => runValidate()} loading={validating}>刷新</Button>
                  </Space>

                  {validate?.error && (
                    <Alert type="error" showIcon message={validate.error} style={{ marginBottom: 16 }} />
                  )}

                  {validate && !validate.error && (
                    <>
                      <Descriptions size="small" bordered column={4} style={{ marginBottom: 16 }}>
                        <Descriptions.Item label="策略">{validate.strategy}</Descriptions.Item>
                        <Descriptions.Item label="验证区间">{validate.start_date} ~ {validate.end_date}</Descriptions.Item>
                        <Descriptions.Item label="测试股票数">{validate.test_stocks_count}</Descriptions.Item>
                        <Descriptions.Item label="采样日数">{validate.sample_dates_count}</Descriptions.Item>
                        <Descriptions.Item label="总信号数">
                          <strong style={{ color: '#cf1322' }}>{validate.total_signals}</strong>
                        </Descriptions.Item>
                      </Descriptions>

                      <Row gutter={8} style={{ marginBottom: 16 }}>
                        {validate.stats.map((s) => (
                          <Col span={8} key={s.horizon}>
                            <Card size="small">
                              <Statistic
                                title={`${s.horizon} 日胜率`}
                                value={s.win_rate}
                                suffix="%"
                                valueStyle={{ color: s.win_rate >= 50 ? '#3f8600' : '#cf1322' }}
                              />
                              <div style={{ marginTop: 8 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  平均收益：<strong style={{ color: s.avg_return >= 0 ? '#cf1322' : '#3f8600' }}>
                                    {s.avg_return >= 0 ? '+' : ''}{s.avg_return}%
                                  </strong>
                                </Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 12 }}>信号数：{s.signals}</Text>
                              </div>
                              <Progress
                                percent={s.win_rate}
                                size="small"
                                showInfo={false}
                                strokeColor={s.win_rate >= 50 ? '#52c41a' : '#cf1322'}
                              />
                            </Card>
                          </Col>
                        ))}
                      </Row>

                      <Title level={5}>信号明细（前 50 条）</Title>
                      <Table
                        rowKey={(r, i) => `${r.code}-${r.signal_date}-${i}`}
                        size="small"
                        dataSource={validate.signals}
                        pagination={{ pageSize: 15 }}
                        columns={[
                          { title: '代码', dataIndex: 'code', width: 100, render: (v: string) => <strong>{v}</strong> },
                          { title: '名称', dataIndex: 'name', width: 100 },
                          { title: '信号日', dataIndex: 'signal_date', width: 110 },
                          { title: '信号', dataIndex: 'signal', width: 100, render: (v: string) => <Tag color="volcano">{v}</Tag> },
                          { title: '评分', dataIndex: 'score', width: 70, render: (v: number) => v?.toFixed(1) },
                          { title: '入场价', dataIndex: 'entry_close', width: 80, render: (v: number) => v?.toFixed(2) },
                          ...validate.horizons.map((h) => ({
                            title: `${h}日收益`, width: 90,
                            render: (_: unknown, r: { returns: Record<number, number> }) => {
                              const v = r.returns[h];
                              if (v == null) return '-';
                              return <Tag color={v >= 0 ? 'red' : 'green'}>{v >= 0 ? '+' : ''}{v}%</Tag>;
                            },
                          })),
                        ]}
                      />
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

// ============ 工具函数 ============
const formatAmount = (v: number): string => {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}亿`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(2)}万`;
  return v.toFixed(0);
};
