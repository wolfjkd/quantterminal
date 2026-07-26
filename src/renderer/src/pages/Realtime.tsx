/** 实时分析 - 个股深度分析
 *
 * 对接后端 GET /realtime/{code}：
 *   - 顶部：股票搜索框（默认 600036.SH）
 *   - 基本信息 + KPI 卡片 + 均线统计 + 年内统计 + K线图（含成交量副图）
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Statistic, Select, message,
  Alert, Descriptions, Empty, Tabs, Input, Table, Badge, Radio,
} from 'antd';
import {
  ReloadOutlined, SearchOutlined, StockOutlined, ThunderboltOutlined,
  ApiOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { realtimeApi, stocksApi } from '../services/api';
import KlineChart from '../components/KlineChart';

const { Title } = Typography;

// ============ 类型 ============
interface LatestBar {
  open: number;
  high: number;
  low: number;
  close: number;
  pre_close: number | null;
  volume: number;
  amount: number;
  change: number;
  change_pct: number;
  amplitude: number;
}

interface StatsBar {
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  ret_5d: number | null;
  ret_20d: number | null;
  ret_60d: number | null;
  vol_20d: number | null;
  vol_60d: number | null;
}

interface YearBar {
  high: number | null;
  low: number | null;
  open: number | null;
  change_pct: number | null;
  days: number;
}

interface KLine {
  date: string;
  open: number;
  close: number;
  low: number;
  high: number;
  volume: number;
  amount: number;
}

interface RealtimeData {
  code: string;
  name: string;
  market: string;
  board: string;
  industry: string;
  is_st: boolean;
  latest_date: string;
  latest: LatestBar;
  stats: StatsBar;
  year: YearBar;
  klines: KLine[];
}

interface StockOption {
  id: number;
  code: string;
  name: string;
}

// ============ 通达信实时行情（eltdx 协议） ============
interface TfhubHealth {
  available: boolean;
  healthy?: boolean;
  sample_code?: string;
  sample_price?: number;
  message?: string;
  error?: string;
}

interface TfhubQuoteItem {
  code: string;
  original_code: string;
  price: number;
  change: number;
  change_pct: number;
  open: number;
  high: number;
  low: number;
  volume: number;   // 单位：手
  amount: number;
  inside: number;
  outer: number;
}

interface TfhubQuoteResp {
  available: boolean;
  requested?: number;
  returned?: number;
  quotes?: TfhubQuoteItem[];
  missing?: string[];
  error?: string;
}

interface TfhubMinutePoint {
  time_label: string;
  price: number;
  avg_price: number;
  volume: number;
}

interface TfhubMinuteResp {
  available: boolean;
  code?: string;
  status?: string;
  trading_date?: string;
  prev_close?: number;
  open_price?: number;
  avg_price?: number;
  error_message?: string;
  points?: TfhubMinutePoint[];
  error?: string;
}

interface TfhubAuctionPoint {
  time_label: string;
  price: number;
  matched_volume: number;
  unmatched_volume: number;
  matched_amount: number;
}

interface TfhubAuctionResp {
  available: boolean;
  code?: string;
  status?: string;
  last_price?: number;
  last_matched_volume?: number;
  total_amount?: number;
  error_message?: string;
  points?: TfhubAuctionPoint[];
  error?: string;
}

// ============ 常量 ============
const BOARD_LABEL: Record<string, string> = {
  main: '主板',
  gem: '创业板',
  star: '科创板',
  bse: '北交所',
};

const UP = '#cf1322';
const DOWN = '#3f8600';

// ============ 主组件 ============
export default function Realtime() {
  const [code, setCode] = useState<string>('600036.SH');
  const [data, setData] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [stockSearchLoading, setStockSearchLoading] = useState(false);

  // ============ 通达信实时行情 state ============
  const [tfhubHealth, setTfhubHealth] = useState<TfhubHealth | null>(null);
  const [tfhubQuoteInput, setTfhubQuoteInput] = useState<string>('600170,000001,601868,300750');
  const [tfhubQuoteResp, setTfhubQuoteResp] = useState<TfhubQuoteResp | null>(null);
  const [tfhubQuoteLoading, setTfhubQuoteLoading] = useState(false);
  const [tfhubMinute, setTfhubMinute] = useState<TfhubMinuteResp | null>(null);
  const [tfhubMinuteLoading, setTfhubMinuteLoading] = useState(false);
  const [tfhubAuction, setTfhubAuction] = useState<TfhubAuctionResp | null>(null);
  const [tfhubAuctionLoading, setTfhubAuctionLoading] = useState(false);
  const [klineEngine, setKlineEngine] = useState<'lightweight' | 'echarts'>('lightweight');

  const fetchTfhubHealth = async () => {
    try {
      const { data: res } = await realtimeApi.tfhubHealth();
      setTfhubHealth(res);
    } catch (err: any) {
      setTfhubHealth({ available: false, error: err?.response?.data?.detail || '检查失败' });
    }
  };

  const fetchTfhubQuote = async () => {
    const codes = tfhubQuoteInput
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (codes.length === 0) {
      message.warning('请输入至少一个股票代码');
      return;
    }
    setTfhubQuoteLoading(true);
    try {
      const { data: res } = await realtimeApi.tfhubQuote(codes);
      setTfhubQuoteResp(res);
      if (res.error) message.error(res.error);
      else message.success(`请求 ${res.requested} 只 / 返回 ${res.returned} 只`);
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '行情获取失败');
    } finally {
      setTfhubQuoteLoading(false);
    }
  };

  const fetchTfhubMinute = async (c: string) => {
    setTfhubMinuteLoading(true);
    try {
      const { data: res } = await realtimeApi.tfhubMinute(c);
      setTfhubMinute(res);
      if (res.error) message.error(res.error);
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '分时获取失败');
    } finally {
      setTfhubMinuteLoading(false);
    }
  };

  const fetchTfhubAuction = async (c: string) => {
    setTfhubAuctionLoading(true);
    try {
      const { data: res } = await realtimeApi.tfhubAuction(c);
      setTfhubAuction(res);
      if (res.error) message.error(res.error);
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '竞价获取失败');
    } finally {
      setTfhubAuctionLoading(false);
    }
  };

  useEffect(() => {
    fetchTfhubHealth();
  }, []);

  const fetchData = async (c: string) => {
    setLoading(true);
    setNotFound(false);
    try {
      const { data: res } = await realtimeApi.stock(c);
      setData(res);
      // 同步补齐搜索框选项，确保当前选中股票有 label
      setStockOptions((prev) => {
        if (prev.some((s) => s.code === res.code)) return prev;
        return [{ id: 0, code: res.code, name: res.name }, ...prev];
      });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        setData(null);
        setNotFound(true);
      } else {
        const msg = err?.response?.data?.detail || '加载失败';
        message.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const searchStocks = async (keyword: string) => {
    if (!keyword || keyword.length < 1) return;
    setStockSearchLoading(true);
    try {
      const { data: res } = await stocksApi.list({ keyword, page: 1, page_size: 50 });
      setStockOptions(res.data || []);
    } catch (err) {
      // 静默
    } finally {
      setStockSearchLoading(false);
    }
  };

  const onSelect = (val: string) => {
    setCode(val);
  };

  // ============ 派生显示值 ============
  const latest = data?.latest;
  const change = latest?.change ?? 0;
  const changePct = latest?.change_pct ?? 0;
  const upColor = change >= 0 ? UP : DOWN;

  return (
    <div style={{ padding: 20 }}>
      <Tabs
        defaultActiveKey="daily"
        items={[
          {
            key: 'daily',
            label: <span><StockOutlined /> 日K分析</span>,
            children: (
              <Card loading={loading && !data}>
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            <StockOutlined /> 实时行情分析
          </Title>
          <Space>
            <Select
              showSearch
              value={code}
              placeholder="输入代码或名称搜索"
              style={{ width: 280 }}
              filterOption={false}
              onSearch={searchStocks}
              onChange={onSelect}
              loading={stockSearchLoading}
              options={stockOptions.map((s) => ({
                value: s.code,
                label: `${s.code} ${s.name}`,
              }))}
              suffixIcon={<SearchOutlined />}
            />
            <Button icon={<ReloadOutlined />} onClick={() => fetchData(code)} loading={loading}>
              刷新
            </Button>
          </Space>
        </Space>

        {notFound && (
          <Alert
            type="warning"
            showIcon
            message="未找到该股票"
            description={`后端未返回 ${code} 的数据，请确认代码格式（如 600036.SH）或换一只股票。`}
            style={{ marginBottom: 16 }}
          />
        )}

        {data && latest && (
          <>
            {/* 基本信息 */}
            <Descriptions size="small" column={6} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="代码">
                <strong style={{ fontFamily: 'monospace' }}>{data.code}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="名称">
                <strong>{data.name}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="市场">
                <span style={{ fontFamily: 'monospace' }}>{data.market}</span>
              </Descriptions.Item>
              <Descriptions.Item label="板块">
                <Tag color="blue">{BOARD_LABEL[data.board] || data.board}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="行业">{data.industry || '-'}</Descriptions.Item>
              <Descriptions.Item label="ST">
                {data.is_st ? <Tag color="red">ST</Tag> : <Tag>否</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="最新日期" span={6}>
                <span style={{ fontFamily: 'monospace' }}>{data.latest_date}</span>
              </Descriptions.Item>
            </Descriptions>

            {/* KPI 卡片 - 第一行 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="最新价"
                    value={latest.close}
                    precision={2}
                    valueStyle={{ color: upColor, fontFamily: 'monospace', fontSize: 28 }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="涨跌额"
                    value={change}
                    precision={2}
                    prefix={change >= 0 ? '+' : ''}
                    valueStyle={{ color: upColor, fontFamily: 'monospace' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="涨跌幅"
                    value={changePct * 100}
                    precision={2}
                    suffix="%"
                    prefix={changePct >= 0 ? '+' : ''}
                    valueStyle={{ color: upColor, fontFamily: 'monospace' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="振幅"
                    value={latest.amplitude * 100}
                    precision={2}
                    suffix="%"
                    valueStyle={{ fontFamily: 'monospace' }}
                  />
                </Card>
              </Col>
            </Row>

            {/* KPI 卡片 - 第二行 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="开盘"
                    value={latest.open}
                    precision={2}
                    valueStyle={{ fontFamily: 'monospace' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="最高"
                    value={latest.high}
                    precision={2}
                    valueStyle={{ color: UP, fontFamily: 'monospace' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="最低"
                    value={latest.low}
                    precision={2}
                    valueStyle={{ color: DOWN, fontFamily: 'monospace' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="昨收"
                    value={latest.pre_close ?? 0}
                    precision={2}
                    valueStyle={{ fontFamily: 'monospace' }}
                  />
                </Card>
              </Col>
            </Row>

            {/* KPI 卡片 - 第三行（成交量/成交额） */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Card size="small">
                  <Statistic
                    title="成交量（手）"
                    value={latest.volume / 100}
                    valueStyle={{ fontFamily: 'monospace' }}
                  />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small">
                  <Statistic
                    title="成交额（万元）"
                    value={latest.amount / 10000}
                    precision={2}
                    valueStyle={{ fontFamily: 'monospace' }}
                  />
                </Card>
              </Col>
            </Row>

            {/* 均线与统计 + 年内统计 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={14}>
                <Card size="small" title="均线与统计">
                  <Row gutter={[8, 8]}>
                    <Col span={6}>
                      <Statistic
                        title="MA5"
                        value={data.stats.ma5 ?? 0}
                        precision={2}
                        valueStyle={{ fontFamily: 'monospace' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="MA10"
                        value={data.stats.ma10 ?? 0}
                        precision={2}
                        valueStyle={{ fontFamily: 'monospace' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="MA20"
                        value={data.stats.ma20 ?? 0}
                        precision={2}
                        valueStyle={{ fontFamily: 'monospace' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="MA60"
                        value={data.stats.ma60 ?? 0}
                        precision={2}
                        valueStyle={{ fontFamily: 'monospace' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="5日涨跌"
                        value={(data.stats.ret_5d ?? 0) * 100}
                        precision={2}
                        suffix="%"
                        prefix={(data.stats.ret_5d ?? 0) >= 0 ? '+' : ''}
                        valueStyle={{
                          color: (data.stats.ret_5d ?? 0) >= 0 ? UP : DOWN,
                          fontFamily: 'monospace',
                        }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="20日涨跌"
                        value={(data.stats.ret_20d ?? 0) * 100}
                        precision={2}
                        suffix="%"
                        prefix={(data.stats.ret_20d ?? 0) >= 0 ? '+' : ''}
                        valueStyle={{
                          color: (data.stats.ret_20d ?? 0) >= 0 ? UP : DOWN,
                          fontFamily: 'monospace',
                        }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="60日涨跌"
                        value={(data.stats.ret_60d ?? 0) * 100}
                        precision={2}
                        suffix="%"
                        prefix={(data.stats.ret_60d ?? 0) >= 0 ? '+' : ''}
                        valueStyle={{
                          color: (data.stats.ret_60d ?? 0) >= 0 ? UP : DOWN,
                          fontFamily: 'monospace',
                        }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="20日波动"
                        value={(data.stats.vol_20d ?? 0) * 100}
                        precision={2}
                        suffix="%"
                        valueStyle={{ fontFamily: 'monospace' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="60日波动"
                        value={(data.stats.vol_60d ?? 0) * 100}
                        precision={2}
                        suffix="%"
                        valueStyle={{ fontFamily: 'monospace' }}
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>
              <Col span={10}>
                <Card size="small" title="年内统计">
                  <Row gutter={[8, 8]}>
                    <Col span={8}>
                      <Statistic
                        title="年内高"
                        value={data.year.high ?? 0}
                        precision={2}
                        valueStyle={{ color: UP, fontFamily: 'monospace' }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="年内低"
                        value={data.year.low ?? 0}
                        precision={2}
                        valueStyle={{ color: DOWN, fontFamily: 'monospace' }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="年内开盘"
                        value={data.year.open ?? 0}
                        precision={2}
                        valueStyle={{ fontFamily: 'monospace' }}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="年内涨跌"
                        value={(data.year.change_pct ?? 0) * 100}
                        precision={2}
                        suffix="%"
                        prefix={(data.year.change_pct ?? 0) >= 0 ? '+' : ''}
                        valueStyle={{
                          color: (data.year.change_pct ?? 0) >= 0 ? UP : DOWN,
                          fontFamily: 'monospace',
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="交易天数"
                        value={data.year.days}
                        valueStyle={{ fontFamily: 'monospace' }}
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>
            </Row>

            {/* K 线图 */}
            <Card size="small" title="近 60 日 K 线" extra={
              <Radio.Group value={klineEngine} onChange={(e) => setKlineEngine(e.target.value)} size="small">
                <Radio.Button value="lightweight">Lightweight Charts</Radio.Button>
                <Radio.Button value="echarts">ECharts</Radio.Button>
              </Radio.Group>
            }>
              {data.klines && data.klines.length > 0 ? (
                klineEngine === 'lightweight' ? (
                  <KlineChart klines={data.klines} height={480} />
                ) : (
                  <ReactECharts
                    option={buildKLineOption(data.klines)}
                    style={{ height: 480 }}
                  />
                )
              ) : (
                <Empty description="暂无 K 线数据" />
              )}
            </Card>
          </>
        )}

        {!data && !notFound && !loading && (
          <Empty description="请选择股票查看深度分析" />
        )}
      </Card>
            ),
          },
          {
            key: 'tfhub',
            label: <span><ApiOutlined /> 通达信实时 <Badge dot={tfhubHealth?.healthy === true} status={tfhubHealth?.healthy ? 'success' : 'error'} /></span>,
            children: (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Card size="small" title={<span><ApiOutlined /> 行情源健康</span>} extra={<Button size="small" icon={<ReloadOutlined />} onClick={fetchTfhubHealth}>刷新</Button>}>
                  {tfhubHealth ? (
                    tfhubHealth.available ? (
                      <Space>
                        <Badge status={tfhubHealth.healthy ? 'success' : 'warning'} />
                        <Typography.Text>{tfhubHealth.message || '未知'}</Typography.Text>
                        {tfhubHealth.sample_code && (
                          <Typography.Text type="secondary">
                            样本 {tfhubHealth.sample_code} 现价 <strong style={{ fontFamily: 'monospace' }}>{tfhubHealth.sample_price?.toFixed(2)}</strong>
                          </Typography.Text>
                        )}
                      </Space>
                    ) : (
                      <Alert type="error" showIcon message="eltdx 不可用" description={tfhubHealth.error} />
                    )
                  ) : (
                    <Typography.Text type="secondary">检查中...</Typography.Text>
                  )}
                </Card>

                <Card size="small" title={<span><ThunderboltOutlined /> 批量行情快照</span>}>
                  <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
                    <Input
                      value={tfhubQuoteInput}
                      onChange={(e) => setTfhubQuoteInput(e.target.value)}
                      placeholder="股票代码，逗号分隔，如 600170,000001,sh601868,300750"
                      onPressEnter={fetchTfhubQuote}
                    />
                    <Button type="primary" icon={<ThunderboltOutlined />} loading={tfhubQuoteLoading} onClick={fetchTfhubQuote}>
                      拉取行情
                    </Button>
                  </Space.Compact>
                  {tfhubQuoteResp && tfhubQuoteResp.quotes && tfhubQuoteResp.quotes.length > 0 && (
                    <Table
                      size="small"
                      rowKey={(r) => r.code}
                      dataSource={tfhubQuoteResp.quotes}
                      pagination={false}
                      columns={[
                        { title: '代码', dataIndex: 'original_code', width: 100, render: (v: string) => <strong style={{ fontFamily: 'monospace' }}>{v}</strong> },
                        { title: '现价', dataIndex: 'price', width: 80, align: 'right' as const, render: (v: number) => <strong style={{ fontFamily: 'monospace' }}>{v.toFixed(2)}</strong> },
                        {
                          title: '涨跌', dataIndex: 'change', width: 80, align: 'right' as const,
                          render: (v: number) => <span style={{ fontFamily: 'monospace', color: v >= 0 ? UP : DOWN }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}</span>,
                        },
                        {
                          title: '涨跌幅', dataIndex: 'change_pct', width: 90, align: 'right' as const,
                          render: (v: number) => <span style={{ fontFamily: 'monospace', color: v >= 0 ? UP : DOWN }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</span>,
                        },
                        { title: '开盘', dataIndex: 'open', width: 80, align: 'right' as const, render: (v: number) => v.toFixed(2) },
                        { title: '最高', dataIndex: 'high', width: 80, align: 'right' as const, render: (v: number) => <span style={{ color: UP }}>{v.toFixed(2)}</span> },
                        { title: '最低', dataIndex: 'low', width: 80, align: 'right' as const, render: (v: number) => <span style={{ color: DOWN }}>{v.toFixed(2)}</span> },
                        { title: '成交量(手)', dataIndex: 'volume', width: 110, align: 'right' as const, render: (v: number) => v.toLocaleString() },
                        { title: '成交额', dataIndex: 'amount', width: 130, align: 'right' as const, render: (v: number) => (v / 1e8).toFixed(2) + ' 亿' },
                        {
                          title: '操作', width: 130, render: (_: unknown, r: TfhubQuoteItem) => (
                            <Space size="small">
                              <Button size="small" type="link" icon={<ClockCircleOutlined />} loading={tfhubMinuteLoading} onClick={() => fetchTfhubMinute(r.original_code)}>分时</Button>
                              <Button size="small" type="link" loading={tfhubAuctionLoading} onClick={() => fetchTfhubAuction(r.original_code)}>竞价</Button>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  )}
                  {tfhubQuoteResp && tfhubQuoteResp.missing && tfhubQuoteResp.missing.length > 0 && (
                    <Alert type="warning" showIcon style={{ marginTop: 8 }} message={`未返回的代码：${tfhubQuoteResp.missing.join(', ')}`} />
                  )}
                </Card>

                {tfhubMinute && (
                  <Card size="small" title={<span><ClockCircleOutlined /> 分时数据 {tfhubMinute.code ? `(${tfhubMinute.code})` : ''}</span>}>
                    {tfhubMinute.error ? (
                      <Alert type="error" showIcon message={tfhubMinute.error} />
                    ) : tfhubMinute.points && tfhubMinute.points.length > 0 ? (
                      <ReactECharts option={buildMinuteOption(tfhubMinute.points)} style={{ height: 360 }} />
                    ) : (
                      <Empty description="无分时数据" />
                    )}
                  </Card>
                )}

                {tfhubAuction && (
                  <Card size="small" title={<span>集合竞价 {tfhubAuction.code ? `(${tfhubAuction.code})` : ''}</span>}>
                    {tfhubAuction.error ? (
                      <Alert type="error" showIcon message={tfhubAuction.error} />
                    ) : tfhubAuction.status === 'success' && tfhubAuction.points && tfhubAuction.points.length > 0 ? (
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        <Space>
                          <Typography.Text>最新价：<strong style={{ fontFamily: 'monospace' }}>{tfhubAuction.last_price?.toFixed(2)}</strong></Typography.Text>
                          <Typography.Text>匹配量：<strong style={{ fontFamily: 'monospace' }}>{tfhubAuction.last_matched_volume?.toLocaleString()}</strong></Typography.Text>
                          <Typography.Text>总金额：<strong style={{ fontFamily: 'monospace' }}>{tfhubAuction.total_amount?.toLocaleString()}</strong></Typography.Text>
                        </Space>
                        <Table
                          size="small"
                          rowKey={(r) => r.time_label}
                          dataSource={tfhubAuction.points}
                          pagination={false}
                          columns={[
                            { title: '时间', dataIndex: 'time_label', width: 80 },
                            { title: '价格', dataIndex: 'price', width: 80, align: 'right' as const, render: (v: number) => v.toFixed(2) },
                            { title: '匹配量', dataIndex: 'matched_volume', width: 110, align: 'right' as const, render: (v: number) => v?.toLocaleString() },
                            { title: '未匹配量', dataIndex: 'unmatched_volume', width: 110, align: 'right' as const, render: (v: number) => v?.toLocaleString() },
                            { title: '匹配金额', dataIndex: 'matched_amount', width: 130, align: 'right' as const, render: (v: number) => v?.toFixed(0) },
                          ]}
                        />
                      </Space>
                    ) : (
                      <Alert type="info" showIcon message={tfhubAuction.error_message || '无集合竞价数据（非竞价时段）'} />
                    )}
                  </Card>
                )}
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
}

// ============ 分时图配置 ============
function buildMinuteOption(points: TfhubMinutePoint[]) {
  const times = points.map((p) => p.time_label);
  const prices = points.map((p) => p.price);
  const avgPrices = points.map((p) => p.avg_price);
  const volumes = points.map((p) => p.volume);
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['价格', '均价'] },
    grid: [
      { left: 60, right: 30, top: 30, height: '60%' },
      { left: 60, right: 30, top: '76%', height: '16%' },
    ],
    xAxis: [
      { type: 'category', data: times, scale: true, boundaryGap: false, axisLabel: { fontSize: 10 } },
      { type: 'category', gridIndex: 1, data: times, axisLabel: { show: false } },
    ],
    yAxis: [
      { scale: true, axisLabel: { fontSize: 10 }, splitLine: { show: false } },
      { scale: true, gridIndex: 1, axisLabel: { show: false }, splitNumber: 2 },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 },
    ],
    series: [
      { name: '价格', type: 'line', data: prices, showSymbol: false, lineStyle: { color: '#1677ff', width: 1 } },
      { name: '均价', type: 'line', data: avgPrices, showSymbol: false, lineStyle: { color: '#cf1322', width: 1, type: 'dashed' } },
      { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volumes, itemStyle: { color: 'rgba(22,119,255,0.4)' } },
    ],
  };
}

// ============ K 线图配置 ============
function buildKLineOption(klines: KLine[]) {
  const dates = klines.map((k) => k.date);
  const ohlc = klines.map((k) => [k.open, k.close, k.low, k.high]);
  const volumes = klines.map((k) => ({
    value: k.volume / 100,
    itemStyle: {
      color: k.close >= k.open ? 'rgba(207,19,34,0.7)' : 'rgba(63,134,0,0.7)',
    },
  }));

  const series: any[] = [
    {
      name: '日K',
      type: 'candlestick',
      data: ohlc,
      itemStyle: {
        color: UP,
        color0: DOWN,
        borderColor: UP,
        borderColor0: DOWN,
      },
    },
    {
      name: '成交量',
      type: 'bar',
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: volumes,
    },
  ];

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any[]) => {
        const d = params[0]?.axisValue || '';
        let s = `<div style="font-weight:600">${d}</div>`;
        params.forEach((p) => {
          if (p.seriesName === '日K') {
            const [o, c, l, h] = p.value as number[];
            const chg = c - o;
            const chgPct = o !== 0 ? (chg / o) * 100 : 0;
            const color = chg >= 0 ? UP : DOWN;
            s += `<div>${p.marker} 日K: <span style="font-family:monospace">开 ${o.toFixed(2)} 收 ${c.toFixed(2)} 低 ${l.toFixed(2)} 高 ${h.toFixed(2)}</span></div>`;
            s += `<div style="color:${color}">涨跌: <span style="font-family:monospace">${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%)</span></div>`;
          } else if (p.seriesName === '成交量') {
            s += `<div>${p.marker} 成交量: <span style="font-family:monospace">${Number(p.value).toLocaleString()} 手</span></div>`;
          }
        });
        return s;
      },
    },
    legend: { data: ['日K', '成交量'] },
    grid: [
      { left: 60, right: 30, top: 30, height: '55%' },
      { left: 60, right: 30, top: '72%', height: '18%' },
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        scale: true,
        boundaryGap: false,
        axisLine: { onZero: false },
        axisLabel: { fontSize: 10 },
        splitLine: { show: false },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: dates,
        axisLabel: { show: false },
      },
    ],
    yAxis: [
      {
        scale: true,
        axisLabel: { fontSize: 10 },
        splitLine: { show: false },
      },
      {
        scale: true,
        gridIndex: 1,
        axisLabel: { show: false },
        splitNumber: 2,
      },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 },
      { type: 'slider', xAxisIndex: [0, 1], top: '92%', start: 0, end: 100 },
    ],
    series,
  };
}
