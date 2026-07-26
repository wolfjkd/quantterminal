/** 总览/全域指挥中心
 *
 *  - 市场总览（涨跌分布、涨停/跌停、Top5 涨跌）
 *  - 数据健康度（股票总数、K线总数、新鲜度）
 *  - 自选股快照（最新价、涨跌）
 *  - 最近信号扫描 Top5
 *  - 最近同步日志
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Statistic, Table, Empty,
  Progress, Skeleton, message, Tooltip,
} from 'antd';
import {
  ReloadOutlined, ArrowUpOutlined, ArrowDownOutlined, DashboardOutlined,
  StockOutlined, DatabaseOutlined, ThunderboltOutlined, CloudSyncOutlined,
  StarOutlined, RiseOutlined, FallOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { dashboardApi } from '../services/api';

const { Title, Text } = Typography;

// ============ 类型 ============
interface MarketOverview {
  ready: boolean;
  latest_date: string | null;
  prev_date: string | null;
  up: number; down: number; flat: number;
  limit_up: number; limit_down: number;
  total_amount_yi: number;
  top_advances: Array<{ code: string; name: string; pct: number; amount: number }>;
  top_declines: Array<{ code: string; name: string; pct: number; amount: number }>;
}

interface Health {
  total_stocks: number;
  total_bars: number;
  latest_date: string | null;
  fresh_stocks: number;
  fresh_ratio: number;
}

interface WatchItem {
  code: string; name: string;
  close: number | null; pct_change: number | null;
  note: string;
}

interface SignalTop {
  code: string; name: string;
  signal: string; score: number;
  close_price: number | null;
}

interface LastRun {
  run_id: number;
  name: string;
  as_of_date: string | null;
  scanned: number; matched: number;
  created_at: string | null;
  top: SignalTop[];
}

interface SyncLog {
  id: number; source: string; code: string;
  status: string; message: string;
  bars_count: number;
  created_at: string | null;
}

interface QuickStats {
  total_stocks: number;
  total_bars: number;
  total_signal_runs: number;
  total_sync_logs: number;
}

interface DashboardData {
  market: MarketOverview;
  health: Health;
  watchlist: WatchItem[];
  last_signal_run: LastRun | null;
  recent_sync: SyncLog[];
  quick_stats: QuickStats;
}

const SIGNAL_TAG: Record<string, { color: string; label: string }> = {
  STRONG_BUY: { color: 'red', label: '强买' },
  BUY: { color: 'volcano', label: '买入' },
  HOLD: { color: 'gold', label: '持有' },
  SELL: { color: 'cyan', label: '卖出' },
  STRONG_SELL: { color: 'blue', label: '强卖' },
  AVOID: { color: 'default', label: '回避' },
};

// ============ 主组件 ============
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetch = async () => {
    setLoading(true);
    try {
      const { data: res } = await dashboardApi.overview();
      setData(res);
    } catch (e: any) {
      message.error('加载总览失败：' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {/* 顶部标题 + KPI */}
      <Card size="small">
        <Space style={{ marginBottom: 12, justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            <DashboardOutlined /> 全域指挥中心
          </Title>
          <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
        </Space>
        {data && (
          <Row gutter={16}>
            <Col xs={12} sm={6}>
              <Statistic title="股票总数" value={data.quick_stats.total_stocks} prefix={<StockOutlined />} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="K线总数" value={data.quick_stats.total_bars} prefix={<DatabaseOutlined />} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="信号扫描次数" value={data.quick_stats.total_signal_runs} prefix={<ThunderboltOutlined />} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="同步日志数" value={data.quick_stats.total_sync_logs} prefix={<CloudSyncOutlined />} />
            </Col>
          </Row>
        )}
      </Card>

      <Skeleton loading={loading && !data} active>
        {data && (
          <Row gutter={16}>
            {/* 左列：市场总览 + Top涨跌 */}
            <Col xs={24} lg={16}>
              <MarketCard market={data.market} />
              <SignalRunCard run={data.last_signal_run} onJump={() => navigate('/workbench')} />
            </Col>

            {/* 右列：健康度 + 自选股 + 同步日志 */}
            <Col xs={24} lg={8}>
              <HealthCard health={data.health} />
              <WatchlistCard items={data.watchlist} onJump={() => navigate('/watchlists')} />
              <SyncLogCard logs={data.recent_sync} onJump={() => navigate('/sync')} />
            </Col>
          </Row>
        )}
      </Skeleton>
    </Space>
  );
}

// ============ 市场总览卡片 ============
function MarketCard({ market }: { market: MarketOverview }) {
  if (!market.ready) {
    return (
      <Card size="small" title={<Space><RiseOutlined /> 市场总览</Space>} style={{ marginBottom: 16 }}>
        <Empty description={market.latest_date ? `最新交易日 ${market.latest_date} 暂无数据` : '暂无K线数据，请先同步行情'} />
      </Card>
    );
  }

  const total = market.up + market.down + market.flat;
  const upPct = total ? (market.up / total * 100) : 0;
  const downPct = total ? (market.down / total * 100) : 0;
  const flatPct = total ? (market.flat / total * 100) : 0;

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <RiseOutlined />
          <span>市场总览</span>
          <Tag color="blue">{market.latest_date}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>vs {market.prev_date || '-'}</Text>
        </Space>
      }
    >
      <Row gutter={8} style={{ marginBottom: 12 }}>
        <Col span={6}>
          <Statistic
            title="上涨"
            value={market.up}
            valueStyle={{ color: '#cf1322' }}
            prefix={<ArrowUpOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="下跌"
            value={market.down}
            valueStyle={{ color: '#3f8600' }}
            prefix={<ArrowDownOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic title="涨停" value={market.limit_up} valueStyle={{ color: '#cf1322' }} />
        </Col>
        <Col span={6}>
          <Statistic title="跌停" value={market.limit_down} valueStyle={{ color: '#3f8600' }} />
        </Col>
      </Row>

      {/* 涨跌分布条 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', background: '#f0f0f0' }}>
          <Tooltip title={`上涨 ${market.up} (${upPct.toFixed(1)}%)`}>
            <div style={{ width: `${upPct}%`, background: '#cf1322' }} />
          </Tooltip>
          <Tooltip title={`平盘 ${market.flat} (${flatPct.toFixed(1)}%)`}>
            <div style={{ width: `${flatPct}%`, background: '#bfbfbf' }} />
          </Tooltip>
          <Tooltip title={`下跌 ${market.down} (${downPct.toFixed(1)}%)`}>
            <div style={{ width: `${downPct}%`, background: '#3f8600' }} />
          </Tooltip>
        </div>
        <Text type="secondary" style={{ fontSize: 11 }}>
          总成交额 {market.total_amount_yi} 亿元 · 共 {total} 只
        </Text>
      </div>

      {/* Top5 涨跌 */}
      <Row gutter={16}>
        <Col span={12}>
          <Text strong><RiseOutlined style={{ color: '#cf1322' }} /> 涨幅前 5</Text>
          <Table
            size="small"
            rowKey="code"
            dataSource={market.top_advances}
            pagination={false}
            columns={[
              { title: '代码', dataIndex: 'code', width: 80 },
              { title: '名称', dataIndex: 'name', width: 80, ellipsis: true },
              {
                title: '涨幅', dataIndex: 'pct', width: 70, align: 'right' as const,
                render: (v: number) => <Text style={{ color: '#cf1322' }}>+{v.toFixed(2)}%</Text>,
              },
              {
                title: '成交', dataIndex: 'amount', align: 'right' as const,
                render: (v: number) => <Text type="secondary">{v}亿</Text>,
              },
            ]}
          />
        </Col>
        <Col span={12}>
          <Text strong><FallOutlined style={{ color: '#3f8600' }} /> 跌幅前 5</Text>
          <Table
            size="small"
            rowKey="code"
            dataSource={market.top_declines}
            pagination={false}
            columns={[
              { title: '代码', dataIndex: 'code', width: 80 },
              { title: '名称', dataIndex: 'name', width: 80, ellipsis: true },
              {
                title: '跌幅', dataIndex: 'pct', width: 70, align: 'right' as const,
                render: (v: number) => <Text style={{ color: '#3f8600' }}>{v.toFixed(2)}%</Text>,
              },
              {
                title: '成交', dataIndex: 'amount', align: 'right' as const,
                render: (v: number) => <Text type="secondary">{v}亿</Text>,
              },
            ]}
          />
        </Col>
      </Row>
    </Card>
  );
}

// ============ 最近信号扫描 ============
function SignalRunCard({ run, onJump }: { run: LastRun | null; onJump: () => void }) {
  return (
    <Card
      size="small"
      title={<Space><ThunderboltOutlined /> 最近信号扫描</Space>}
    >
      {!run ? (
        <Empty description="尚未扫描，去工作台运行策略" >
          <a onClick={onJump}>前往工作台 →</a>
        </Empty>
      ) : (
        <>
          <Space style={{ marginBottom: 8 }}>
            <Tag color="blue">Run #{run.run_id}</Tag>
            <Text strong>{run.name}</Text>
            <Text type="secondary">扫描 {run.scanned} / 匹配 {run.matched}</Text>
            {run.created_at && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {dayjs(run.created_at).format('MM-DD HH:mm')}
              </Text>
            )}
          </Space>
          <Table
            size="small"
            rowKey="code"
            dataSource={run.top}
            pagination={false}
            columns={[
              { title: '代码', dataIndex: 'code', width: 90 },
              { title: '名称', dataIndex: 'name', width: 100, ellipsis: true },
              {
                title: '信号', dataIndex: 'signal', width: 80,
                render: (v: string) => {
                  const c = SIGNAL_TAG[v] ?? { color: 'default', label: v };
                  return <Tag color={c.color}>{c.label}</Tag>;
                },
              },
              {
                title: '评分', dataIndex: 'score', width: 70, align: 'right' as const,
                render: (v: number) => <Text strong>{v.toFixed(1)}</Text>,
              },
              {
                title: '现价', dataIndex: 'close_price', align: 'right' as const,
                render: (v: number | null) => v?.toFixed(2) ?? '-',
              },
            ]}
          />
        </>
      )}
    </Card>
  );
}

// ============ 数据健康度 ============
function HealthCard({ health }: { health: Health }) {
  const ratio = health.fresh_ratio * 100;
  return (
    <Card size="small" title={<Space><DatabaseOutlined /> 数据健康度</Space>} style={{ marginBottom: 16 }}>
      <Row gutter={8}>
        <Col span={12}>
          <Statistic title="股票总数" value={health.total_stocks} />
        </Col>
        <Col span={12}>
          <Statistic title="K线总数" value={health.total_bars} />
        </Col>
        <Col span={12}>
          <Statistic
            title="新鲜股票"
            value={health.fresh_stocks}
            valueStyle={{ color: ratio > 50 ? '#3f8600' : '#fa8c16' }}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="新鲜度"
            value={ratio.toFixed(1)}
            suffix="%"
            valueStyle={{ color: ratio > 50 ? '#3f8600' : '#fa8c16' }}
          />
        </Col>
      </Row>
      <Progress percent={ratio} size="small" showInfo={false} style={{ marginTop: 8 }} />
      <Text type="secondary" style={{ fontSize: 11 }}>最新数据：{health.latest_date || '-'}</Text>
    </Card>
  );
}

// ============ 自选股快照 ============
function WatchlistCard({ items, onJump }: { items: WatchItem[]; onJump: () => void }) {
  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <StarOutlined />
          <span>自选股快照</span>
          {items.length > 0 && <Tag color="blue">{items.length}</Tag>}
        </Space>
      }
      extra={<a onClick={onJump}>管理</a>}
    >
      {items.length === 0 ? (
        <Empty description="暂无自选股" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Table
          size="small"
          rowKey="code"
          dataSource={items}
          pagination={false}
          columns={[
            { title: '代码', dataIndex: 'code', width: 80 },
            { title: '名称', dataIndex: 'name', width: 90, ellipsis: true },
            {
              title: '现价', dataIndex: 'close', width: 70, align: 'right' as const,
              render: (v: number | null) => v?.toFixed(2) ?? '-',
            },
            {
              title: '涨跌', dataIndex: 'pct_change', align: 'right' as const,
              render: (v: number | null) => {
                if (v == null) return <Text type="secondary">-</Text>;
                const color = v > 0 ? '#cf1322' : v < 0 ? '#3f8600' : '#8c8c8c';
                const sign = v > 0 ? '+' : '';
                return <Text style={{ color }}>{sign}{v.toFixed(2)}%</Text>;
              },
            },
          ]}
        />
      )}
    </Card>
  );
}

// ============ 最近同步日志 ============
function SyncLogCard({ logs, onJump }: { logs: SyncLog[]; onJump: () => void }) {
  return (
    <Card
      size="small"
      title={<Space><CloudSyncOutlined /> 最近同步</Space>}
      extra={<a onClick={onJump}>全部</a>}
    >
      {logs.length === 0 ? (
        <Empty description="暂无同步日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Table
          size="small"
          rowKey="id"
          dataSource={logs}
          pagination={false}
          columns={[
            {
              title: '时间', dataIndex: 'created_at', width: 100,
              render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
            },
            { title: '代码', dataIndex: 'code', width: 80, render: (v: string) => v || <Text type="secondary">-</Text> },
            {
              title: '状态', dataIndex: 'status', width: 70,
              render: (v: string) => {
                const color = v === 'success' || v === 'ok' ? 'green' : v === 'failed' || v === 'fail' ? 'red' : 'default';
                return <Tag color={color}>{v}</Tag>;
              },
            },
            { title: '说明', dataIndex: 'message', ellipsis: true },
          ]}
        />
      )}
    </Card>
  );
}
