/** 全A市场动向 - 大盘总览 + 涨跌分布 + 板块统计
 *
 * 对接后端 GET /market 与 GET /market/sectors：
 *   - KPI 卡片：总成交额 / 活跃股票 / 上涨家数 / 下跌家数
 *   - 涨跌分布：涨停 / 涨>5% / 涨 / 平 / 跌 / 跌>5% / 跌停
 *   - 指数行情：表格展示各指数收盘与涨跌幅
 *   - 近 20 日趋势：上涨/下跌家数柱状图 + 成交额折线（双 Y 轴）
 *   - 板块统计 Tabs：按行业 / 按板块
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Statistic, Table, Empty,
  Tabs, message,
} from 'antd';
import {
  ReloadOutlined, GlobalOutlined, BarChartOutlined, StockOutlined,
  RiseOutlined, FallOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { marketApi } from '../services/api';

const { Title } = Typography;

// ============ 类型 ============
interface IndexItem {
  code: string;
  name: string;
  close: number;
  pre_close: number | null;
  change: number;
  change_pct: number;
  volume: number;
  amount: number;
}

interface Distribution {
  up: number;
  down: number;
  flat: number;
  limit_up: number;
  limit_down: number;
  up_gt5: number;
  down_gt5: number;
  active: number;
}

interface SectorStat {
  industry: string;
  count: number;
  avg_change: number;
  up_count: number;
  down_count: number;
}

interface BoardStat {
  board: string;
  board_name: string;
  count: number;
  avg_change: number;
  up_count: number;
  down_count: number;
}

interface TrendPoint {
  date: string;
  up: number;
  down: number;
  flat: number;
  amount: number;
}

interface MarketOverview {
  latest_date: string | null;
  indices: IndexItem[];
  distribution: Distribution;
  total_amount: number;
  total_volume: number;
  active_stocks: number;
  sector_stats: SectorStat[];
  board_stats: BoardStat[];
  trend: TrendPoint[];
}

// ============ 颜色常量 ============
const UP_COLOR = '#cf1322';
const DOWN_COLOR = '#3f8600';
const FLAT_COLOR = '#8c8c8c';

// ============ 主组件 ============
export default function Market() {
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const { data: res } = await marketApi.overview();
      setOverview(res);
    } catch (err) {
      message.error('加载市场总览失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const dist = overview?.distribution;
  const totalAmount = overview?.total_amount ?? 0;
  const activeStocks = overview?.active_stocks ?? dist?.active ?? 0;
  const upCount = dist?.up ?? 0;
  const downCount = dist?.down ?? 0;

  // ============ 指数列 ============
  const indexColumns = [
    {
      title: '代码', dataIndex: 'code', width: 100,
      render: (v: string) => <strong style={{ fontFamily: 'monospace' }}>{v}</strong>,
    },
    { title: '名称', dataIndex: 'name', width: 120 },
    {
      title: '收盘', dataIndex: 'close', width: 110, align: 'right' as const,
      render: (v: number) => (
        <span style={{ fontFamily: 'monospace' }}>{Number(v).toFixed(2)}</span>
      ),
    },
    {
      title: '涨跌', dataIndex: 'change', width: 100, align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: v >= 0 ? UP_COLOR : DOWN_COLOR, fontFamily: 'monospace' }}>
          {v >= 0 ? '+' : ''}{v.toFixed(2)}
        </span>
      ),
    },
    {
      title: '涨跌幅', dataIndex: 'change_pct', width: 100, align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: v >= 0 ? UP_COLOR : DOWN_COLOR, fontFamily: 'monospace' }}>
          {v >= 0 ? '+' : ''}{v.toFixed(2)}%
        </span>
      ),
    },
    {
      title: '成交额', dataIndex: 'amount', width: 130, align: 'right' as const,
      render: (v: number) => (
        <span style={{ fontFamily: 'monospace' }}>{formatAmount(v)}</span>
      ),
    },
  ];

  // ============ 行业板块列 ============
  const sectorColumns = [
    {
      title: '行业', dataIndex: 'industry', width: 160,
      render: (v: string) => <strong>{v}</strong>,
    },
    {
      title: '数量', dataIndex: 'count', width: 90, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '平均涨幅', dataIndex: 'avg_change', width: 120, align: 'right' as const,
      sorter: (a: SectorStat, b: SectorStat) => a.avg_change - b.avg_change,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => (
        <span style={{ color: v >= 0 ? UP_COLOR : DOWN_COLOR, fontFamily: 'monospace', fontWeight: 600 }}>
          {v >= 0 ? '+' : ''}{(v * 100).toFixed(2)}%
        </span>
      ),
    },
    {
      title: '上涨', dataIndex: 'up_count', width: 90, align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: UP_COLOR, fontFamily: 'monospace' }}>{v}</span>
      ),
    },
    {
      title: '下跌', dataIndex: 'down_count', width: 90, align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: DOWN_COLOR, fontFamily: 'monospace' }}>{v}</span>
      ),
    },
    {
      title: '涨跌比', width: 120, align: 'right' as const,
      render: (_: unknown, r: SectorStat) => {
        const ratio = r.down_count > 0 ? r.up_count / r.down_count : r.up_count > 0 ? Infinity : 0;
        const text = ratio === Infinity ? '∞' : ratio.toFixed(2);
        return (
          <span style={{ color: r.up_count >= r.down_count ? UP_COLOR : DOWN_COLOR, fontFamily: 'monospace' }}>
            {text}
          </span>
        );
      },
    },
  ];

  // ============ 板块列 ============
  const boardColumns = [
    {
      title: '板块', dataIndex: 'board_name', width: 120,
      render: (v: string, r: BoardStat) => (
        <Space>
          <strong>{v}</strong>
          <Tag>{r.board}</Tag>
        </Space>
      ),
    },
    {
      title: '数量', dataIndex: 'count', width: 90, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '平均涨幅', dataIndex: 'avg_change', width: 120, align: 'right' as const,
      sorter: (a: BoardStat, b: BoardStat) => a.avg_change - b.avg_change,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => (
        <span style={{ color: v >= 0 ? UP_COLOR : DOWN_COLOR, fontFamily: 'monospace', fontWeight: 600 }}>
          {v >= 0 ? '+' : ''}{(v * 100).toFixed(2)}%
        </span>
      ),
    },
    {
      title: '上涨', dataIndex: 'up_count', width: 90, align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: UP_COLOR, fontFamily: 'monospace' }}>{v}</span>
      ),
    },
    {
      title: '下跌', dataIndex: 'down_count', width: 90, align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: DOWN_COLOR, fontFamily: 'monospace' }}>{v}</span>
      ),
    },
    {
      title: '涨跌比', width: 120, align: 'right' as const,
      render: (_: unknown, r: BoardStat) => {
        const ratio = r.down_count > 0 ? r.up_count / r.down_count : r.up_count > 0 ? Infinity : 0;
        const text = ratio === Infinity ? '∞' : ratio.toFixed(2);
        return (
          <span style={{ color: r.up_count >= r.down_count ? UP_COLOR : DOWN_COLOR, fontFamily: 'monospace' }}>
            {text}
          </span>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Card loading={loading}>
        {/* 顶部标题栏 */}
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
          <Space>
            <Title level={4} style={{ margin: 0 }}>
              <GlobalOutlined /> 全A市场动向
            </Title>
            {overview?.latest_date && (
              <Tag color="blue" style={{ fontFamily: 'monospace' }}>
                最新交易日：{overview.latest_date}
              </Tag>
            )}
          </Space>
          <Button icon={<ReloadOutlined />} onClick={fetchOverview} loading={loading}>
            刷新
          </Button>
        </Space>

        {/* KPI 卡片行 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="总成交额"
                value={totalAmount / 1e8}
                precision={2}
                suffix="亿元"
                valueStyle={{ color: UP_COLOR, fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="活跃股票数"
                value={activeStocks}
                valueStyle={{ fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="上涨家数"
                value={upCount}
                valueStyle={{ color: UP_COLOR, fontFamily: 'monospace' }}
                prefix={<RiseOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="下跌家数"
                value={downCount}
                valueStyle={{ color: DOWN_COLOR, fontFamily: 'monospace' }}
                prefix={<FallOutlined />}
              />
            </Card>
          </Col>
        </Row>

        {/* 涨跌分布卡片 */}
        <Card size="small" title={<span><BarChartOutlined /> 涨跌分布</span>} style={{ marginBottom: 16 }}>
          <Row gutter={[8, 16]}>
            <Col span={3}>
              <DistributionCell label="涨停" value={dist?.limit_up ?? 0} color={UP_COLOR} bold />
            </Col>
            <Col span={3}>
              <DistributionCell label="涨>5%" value={dist?.up_gt5 ?? 0} color={UP_COLOR} />
            </Col>
            <Col span={3}>
              <DistributionCell label="上涨" value={upCount} color={UP_COLOR} />
            </Col>
            <Col span={3}>
              <DistributionCell label="平盘" value={dist?.flat ?? 0} color={FLAT_COLOR} />
            </Col>
            <Col span={3}>
              <DistributionCell label="下跌" value={downCount} color={DOWN_COLOR} />
            </Col>
            <Col span={3}>
              <DistributionCell label="跌>5%" value={dist?.down_gt5 ?? 0} color={DOWN_COLOR} />
            </Col>
            <Col span={3}>
              <DistributionCell label="跌停" value={dist?.limit_down ?? 0} color={DOWN_COLOR} bold />
            </Col>
            <Col span={3}>
              <DistributionCell label="活跃" value={activeStocks} color="#1890ff" />
            </Col>
          </Row>
        </Card>

        {/* 指数行情 + 趋势图 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={12}>
            <Card size="small" title={<span><StockOutlined /> 指数行情</span>} style={{ height: '100%' }}>
              {overview && overview.indices.length > 0 ? (
                <Table
                  rowKey="code"
                  size="small"
                  dataSource={overview.indices}
                  columns={indexColumns}
                  pagination={false}
                  scroll={{ x: 660 }}
                />
              ) : (
                <Empty description="stocks 表未配置指数代码" />
              )}
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" title={<span><BarChartOutlined /> 近 20 日涨跌趋势</span>} style={{ height: '100%' }}>
              {overview && overview.trend.length > 0 ? (
                <ReactECharts
                  option={buildTrendOption(overview.trend)}
                  style={{ height: 320 }}
                />
              ) : (
                <Empty description="暂无趋势数据" style={{ paddingTop: 80 }} />
              )}
            </Card>
          </Col>
        </Row>

        {/* 板块统计 Tabs */}
        <Card size="small">
          <Tabs
            items={[
              {
                key: 'sector',
                label: <span><BarChartOutlined /> 按行业 ({overview?.sector_stats?.length ?? 0})</span>,
                children: (
                  <Table
                    rowKey="industry"
                    size="small"
                    dataSource={overview?.sector_stats || []}
                    columns={sectorColumns}
                    pagination={{ pageSize: 20, showSizeChanger: false }}
                    locale={{ emptyText: <Empty description="暂无行业聚合数据" /> }}
                    scroll={{ x: 700 }}
                  />
                ),
              },
              {
                key: 'board',
                label: <span><StockOutlined /> 按板块 ({overview?.board_stats?.length ?? 0})</span>,
                children: (
                  <Table
                    rowKey="board"
                    size="small"
                    dataSource={overview?.board_stats || []}
                    columns={boardColumns}
                    pagination={false}
                    locale={{ emptyText: <Empty description="暂无板块聚合数据" /> }}
                    scroll={{ x: 680 }}
                  />
                ),
              },
            ]}
          />
        </Card>
      </Card>
    </div>
  );
}

// ============ 涨跌分布单元 ============
function DistributionCell({
  label,
  value,
  color,
  bold = false,
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: bold ? 24 : 20,
        fontWeight: bold ? 700 : 500,
        color,
        fontFamily: 'monospace',
        lineHeight: 1.2,
      }}>
        {value}
      </div>
    </div>
  );
}

// ============ 金额格式化 ============
function formatAmount(v: number): string {
  if (!v) return '-';
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
  return v.toLocaleString();
}

// ============ 趋势图配置 ============
function buildTrendOption(trend: TrendPoint[]) {
  const dates = trend.map((p) => p.date);
  const ups = trend.map((p) => p.up);
  const downs = trend.map((p) => p.down);
  const amounts = trend.map((p) => p.amount);

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const d = params[0]?.axisValue || '';
        let s = `<div style="font-weight:600">${d}</div>`;
        params.forEach((p) => {
          const v = p.value;
          if (v == null) return;
          let text: string;
          if (p.seriesName === '成交额') {
            text = v >= 1e8 ? `${(v / 1e8).toFixed(2)} 亿` : `${(v / 1e4).toFixed(2)} 万`;
          } else {
            text = `${Number(v).toLocaleString()} 家`;
          }
          s += `<div>${p.marker} ${p.seriesName}: <span style="font-family:monospace">${text}</span></div>`;
        });
        return s;
      },
    },
    legend: { data: ['上涨家数', '下跌家数', '成交额'], top: 0 },
    grid: { left: 50, right: 60, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { fontSize: 10 },
    },
    yAxis: [
      {
        type: 'value',
        name: '家数',
        scale: true,
        axisLabel: {
          fontSize: 10,
          formatter: (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toString(),
        },
        splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
      },
      {
        type: 'value',
        name: '成交额',
        scale: true,
        axisLabel: {
          fontSize: 10,
          formatter: (v: number) => v >= 1e8 ? `${(v / 1e8).toFixed(1)}亿` : v >= 1e4 ? `${(v / 1e4).toFixed(0)}万` : v.toString(),
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '上涨家数',
        type: 'bar',
        yAxisIndex: 0,
        data: ups,
        itemStyle: { color: UP_COLOR },
        barMaxWidth: 14,
      },
      {
        name: '下跌家数',
        type: 'bar',
        yAxisIndex: 0,
        data: downs,
        itemStyle: { color: DOWN_COLOR },
        barMaxWidth: 14,
      },
      {
        name: '成交额',
        type: 'line',
        yAxisIndex: 1,
        data: amounts,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#fa8c16', width: 1.5 },
        itemStyle: { color: '#fa8c16' },
      },
    ],
  };
}
