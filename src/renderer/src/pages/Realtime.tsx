/** 实时分析 - 个股深度分析
 *
 * 对接后端 GET /realtime/{code}：
 *   - 顶部：股票搜索框（默认 600036.SH）
 *   - 基本信息 + KPI 卡片 + 均线统计 + 年内统计 + K线图（含成交量副图）
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Statistic, Select, message,
  Alert, Descriptions, Empty,
} from 'antd';
import {
  ReloadOutlined, SearchOutlined, StockOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { realtimeApi, stocksApi } from '../services/api';

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
            <Card size="small" title="近 60 日 K 线">
              {data.klines && data.klines.length > 0 ? (
                <ReactECharts
                  option={buildKLineOption(data.klines)}
                  style={{ height: 480 }}
                />
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
    </div>
  );
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
