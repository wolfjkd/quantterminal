/** 行情同步 - 接入东方财富 push2his/push2 公开接口
 *
 * 4 个 Tab：
 *   1. 数据健康度（KPI + 日志统计）
 *   2. 同步行情（拉取单股日K线，写入 SQLite）
 *   3. 实时报价（东方财富 push2 qt stock get）
 *   4. 同步日志（含过滤）
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Statistic, Table, Empty,
  Tabs, Form, Select, DatePicker, AutoComplete, message, Alert, Descriptions,
  Spin, Divider,
} from 'antd';
import {
  ReloadOutlined, ThunderboltOutlined, DatabaseOutlined, SyncOutlined,
  LineChartOutlined, DashboardOutlined, FieldTimeOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { syncApi, stocksApi } from '../services/api';

const { Title, Text } = Typography;

// ============ 类型 ============
interface HealthInfo {
  total_stocks: number;
  total_bars: number;
  latest_date: string | null;
  fresh_stocks: number;
  fresh_days: number;
  logs_by_source: Record<string, number>;
  logs_by_status: Record<string, number>;
}

interface LogItem {
  id: number;
  source: string;
  code: string;
  status: string;
  message: string;
  bars_count: number;
  created_at: string | null;
}

interface StockOption {
  id: number;
  code: string;
  name: string;
}

interface SyncBarsResult {
  success: boolean;
  code: string;
  name: string;
  stock_id: number;
  imported: number;
  last_date: string | null;
  last_close: number | null;
  beg: string;
  end: string;
  fqt: number;
  message: string;
}

interface RealtimeQuote {
  success: boolean;
  code: string;
  symbol: string;
  name: string;
  price: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  pre_close: number | null;
  volume: number | null;
  amount: number | null;
  turnover: number | null;
  pct_change: number | null;
  as_of: string;
  source: string;
}

interface SyncStocksResult {
  success: boolean;
  total: number;
  new: number;
  updated: number;
  message: string;
}

// ============ 主组件 ============
export default function Sync() {
  const [tab, setTab] = useState('health');

  return (
    <div style={{ padding: 20 }}>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'health',
            label: <span><DashboardOutlined /> 数据健康度</span>,
            children: <HealthTab />,
          },
          {
            key: 'bars',
            label: <span><LineChartOutlined /> 同步行情</span>,
            children: <BarsTab />,
          },
          {
            key: 'realtime',
            label: <span><FieldTimeOutlined /> 实时报价</span>,
            children: <RealtimeTab />,
          },
          {
            key: 'logs',
            label: <span><UnorderedListOutlined /> 同步日志</span>,
            children: <LogsTab />,
          },
        ]}
      />
    </div>
  );
}

// ============ Tab 1: 数据健康度 ============

function HealthTab() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const { data: res } = await syncApi.health();
      setHealth(res);
    } catch (err) {
      message.error('加载数据健康度失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const freshPct = health && health.total_stocks > 0
    ? (health.fresh_stocks / health.total_stocks) * 100
    : 0;

  return (
    <Card loading={loading}>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <Title level={4} style={{ margin: 0 }}>
          <DatabaseOutlined /> 数据健康度
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchHealth} loading={loading}>刷新</Button>
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={fetchHealth}>
            重新统计
          </Button>
        </Space>
      </Space>

      <Alert
        type="info"
        showIcon
        message="数据源说明"
        description="quantterminal 已接入东方财富公开接口（push2his / push2），可在「同步行情」Tab 拉取单股日K线写入 SQLite，或在「实时报价」Tab 查询实时快照。"
        style={{ marginBottom: 16 }}
      />

      {/* KPI 卡片 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="股票总数"
              value={health?.total_stocks ?? 0}
              valueStyle={{ fontFamily: 'monospace' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="K线总数"
              value={health?.total_bars ?? 0}
              valueStyle={{ fontFamily: 'monospace' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="最新数据日期"
              value={health?.latest_date || '-'}
              valueStyle={{ fontFamily: 'monospace', color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title={`新鲜股票（${health?.fresh_days ?? 3}日内）`}
              value={health?.fresh_stocks ?? 0}
              suffix={health && health.total_stocks > 0 ? `(${freshPct.toFixed(1)}%)` : ''}
              valueStyle={{ fontFamily: 'monospace', color: freshPct > 50 ? '#52c41a' : '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 日志统计 */}
      {health && (health.logs_by_source || health.logs_by_status) && (
        <Row gutter={16} style={{ marginTop: 16 }}>
          {Object.keys(health.logs_by_source || {}).length > 0 && (
            <Col span={12}>
              <Card size="small" title="按来源统计">
                <Descriptions column={2} size="small">
                  {Object.entries(health.logs_by_source).map(([k, v]) => (
                    <Descriptions.Item key={k} label={k}>
                      <span style={{ fontFamily: 'monospace' }}>{v}</span>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </Card>
            </Col>
          )}
          {Object.keys(health.logs_by_status || {}).length > 0 && (
            <Col span={12}>
              <Card size="small" title="按状态统计">
                <Descriptions column={2} size="small">
                  {Object.entries(health.logs_by_status).map(([k, v]) => (
                    <Descriptions.Item key={k} label={k}>
                      <span style={{
                        fontFamily: 'monospace',
                        color: k === 'success' || k === 'ok' ? '#52c41a' : k === 'failed' || k === 'fail' ? '#f5222d' : 'inherit',
                      }}>{v}</span>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </Card>
            </Col>
          )}
        </Row>
      )}
    </Card>
  );
}

// ============ Tab 2: 同步行情 ============

interface BatchSyncResult {
  success: boolean;
  total: number;
  success_count: number;
  fail_count: number;
  imported_total: number;
  message: string;
}

function BarsTab() {
  const [form] = Form.useForm();
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [, setStockSearchLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncBarsResult | null>(null);
  const [runningStocks, setRunningStocks] = useState(false);
  const [stocksResult, setStocksResult] = useState<SyncStocksResult | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchSyncResult | null>(null);

  // 默认 1 年前到今天
  const defaultBeg = dayjs().subtract(1, 'year');
  const defaultEnd = dayjs();

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

  const onSyncBars = async () => {
    try {
      const v = await form.validateFields();
      const stock_code: string = (v.stock_code || '').trim();
      if (!stock_code) {
        message.warning('请输入或选择股票代码');
        return;
      }
      setRunning(true);
      setResult(null);
      const beg_date = v.beg_date ? (v.beg_date as Dayjs).format('YYYYMMDD') : '';
      const end_date = v.end_date ? (v.end_date as Dayjs).format('YYYYMMDD') : '';
      const fqt: number = v.fqt ?? 1;
      const { data: res } = await syncApi.syncBars({ stock_code, beg_date, end_date, fqt });
      setResult(res);
      message.success(res.message || `同步完成：${res.imported} 条`);
    } catch (err: any) {
      if (err?.errorFields) return; // 表单校验失败
      const msg = err?.response?.data?.detail || '同步失败';
      message.error(msg);
    } finally {
      setRunning(false);
    }
  };

  const onSyncStocks = async () => {
    setRunningStocks(true);
    setStocksResult(null);
    try {
      const { data: res } = await syncApi.syncStocks();
      setStocksResult(res);
      message.success(res.message || `扩容完成：新增 ${res.new}，更新 ${res.updated}`);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || '扩容失败';
      message.error(msg);
    } finally {
      setRunningStocks(false);
    }
  };

  const onSyncAllBars = async () => {
    try {
      setBatchRunning(true);
      setBatchResult(null);
      const { data: res } = await syncApi.syncAllBars({});
      setBatchResult(res);
      if (res.success) {
        message.success(res.message || '全量同步完成');
      } else {
        message.warning(res.message || '全量同步部分失败');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || '全量同步失败';
      message.error(msg);
    } finally {
      setBatchRunning(false);
    }
  };

  return (
    <Card>
      <Title level={4} style={{ marginBottom: 16 }}>
        <LineChartOutlined /> 同步日K线
      </Title>

      <Alert
        type="info"
        showIcon
        message="数据同步说明"
        description={
          <div>
            <p style={{ margin: 0 }}>
              <strong>推荐流程：</strong>先点「全市场扩容股票池」→ 再点「一键同步全部K线」
            </p>
            <p style={{ margin: '4px 0 0' }}>
              单只股票同步用于临时补充数据，全量同步会遍历股票池中所有股票批量拉取。
            </p>
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      {/* 全量同步按钮区域 */}
      <Card
        size="small"
        style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <Tag color="green" style={{ fontSize: 14 }}>推荐</Tag>
            <Text strong>一键同步全部股票K线</Text>
          </Space>
          <Space>
            <Button
              type="primary"
              size="large"
              icon={<SyncOutlined spin={batchRunning} />}
              onClick={onSyncAllBars}
              loading={batchRunning}
              danger
            >
              {batchRunning ? '全量同步中，请耐心等待...' : '🚀 一键同步全部K线'}
            </Button>
            <Text type="secondary" style={{ fontSize: 12 }}>
              首次使用请先点「全市场扩容股票池」
            </Text>
          </Space>
        </Space>
      </Card>

      {/* 单只股票同步区域 */}
      <Divider>单只股票同步（补充数据用）</Divider>

      <Form
        form={form}
        layout="vertical"
        initialValues={{ fqt: 1, beg_date: defaultBeg, end_date: defaultEnd }}
        style={{ maxWidth: 720 }}
      >
        <Form.Item
          label="股票代码"
          name="stock_code"
          rules={[{ required: true, message: '请输入或选择股票代码' }]}
          extra="支持 600000 / 600000.SH / sh600000；股票不存在时自动创建"
        >
          <AutoComplete
            placeholder="输入代码或名称搜索（如 600000 / 浦发）"
            onSearch={searchStocks}
            options={stockOptions.map((s) => ({
              value: s.code,
              label: `${s.code} ${s.name}`,
            }))}
            filterOption={false}
            allowClear
          />
        </Form.Item>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="起始日期" name="beg_date">
              <DatePicker style={{ width: '100%' }} allowClear />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="结束日期" name="end_date">
              <DatePicker style={{ width: '100%' }} allowClear />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="复权类型" name="fqt">
              <Select
                options={[
                  { value: 1, label: '前复权' },
                  { value: 0, label: '不复权' },
                  { value: 2, label: '后复权' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        <Space style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<SyncOutlined spin={running} />}
            onClick={onSyncBars}
            loading={running}
          >
            {running ? '同步中...' : '同步单只 K 线'}
          </Button>
          <Button
            icon={<DatabaseOutlined />}
            onClick={onSyncStocks}
            loading={runningStocks}
          >
            {runningStocks ? '扩容中...' : '全市场扩容股票池'}
          </Button>
        </Space>
      </Form>

      {/* 全量同步进度 */}
      {batchRunning && (
        <Card size="small" style={{ marginBottom: 16, marginTop: 8 }}>
          <Spin tip="正在批量同步所有股票K线，可能需要几分钟...">
            <div style={{ height: 60 }} />
          </Spin>
        </Card>
      )}

      {/* 全量同步结果 */}
      {batchResult && !batchRunning && (
        <Card
          size="small"
          title="全量同步结果"
          style={{ marginBottom: 16, marginTop: 8 }}
        >
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="总股票数">
              <span style={{ fontFamily: 'monospace' }}>{batchResult.total}</span>
            </Descriptions.Item>
            <Descriptions.Item label="成功">
              <span style={{ fontFamily: 'monospace', color: '#52c41a' }}>
                {batchResult.success_count}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="失败">
              <span style={{ fontFamily: 'monospace', color: batchResult.fail_count > 0 ? '#f5222d' : '#52c41a' }}>
                {batchResult.fail_count}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="导入K线总数">
              <span style={{ fontFamily: 'monospace', color: '#1890ff' }}>
                {batchResult.imported_total}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="说明" span={2}>
              {batchResult.message}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* 单只同步结果 */}
      {running && (
        <Card size="small" style={{ marginBottom: 16, marginTop: 8 }}>
          <Spin tip="正在拉取行情数据，请稍候...">
            <div style={{ height: 60 }} />
          </Spin>
        </Card>
      )}

      {result && !batchRunning && (
        <Card size="small" title="单股同步结果" style={{ marginBottom: 16, marginTop: 8 }}>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="股票代码">
              <strong style={{ fontFamily: 'monospace' }}>{result.code}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="股票名称">{result.name}</Descriptions.Item>
            <Descriptions.Item label="导入条数">
              <span style={{ fontFamily: 'monospace', color: '#52c41a' }}>
                {result.imported}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="最新日期">
              <span style={{ fontFamily: 'monospace', color: '#1890ff' }}>
                {result.last_date || '-'}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="最新收盘">
              <span style={{ fontFamily: 'monospace' }}>
                {result.last_close != null ? result.last_close : '-'}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="区间">
              <span style={{ fontFamily: 'monospace' }}>
                {result.beg} ~ {result.end}（fqt={result.fqt}）
              </span>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {stocksResult && (
        <Card size="small" title="扩容结果" style={{ marginBottom: 16, marginTop: 8 }}>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="总条数">
              <span style={{ fontFamily: 'monospace' }}>{stocksResult.total}</span>
            </Descriptions.Item>
            <Descriptions.Item label="新增">
              <span style={{ fontFamily: 'monospace', color: '#52c41a' }}>
                {stocksResult.new}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="更新">
              <span style={{ fontFamily: 'monospace', color: '#1890ff' }}>
                {stocksResult.updated}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="说明">{stocksResult.message}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </Card>
  );
}

// ============ Tab 3: 实时报价 ============

function RealtimeTab() {
  const [code, setCode] = useState('');
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [, setStockSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<RealtimeQuote | null>(null);

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

  const onQuery = async () => {
    const c = (code || '').trim();
    if (!c) {
      message.warning('请输入股票代码');
      return;
    }
    setLoading(true);
    setQuote(null);
    try {
      const { data: res } = await syncApi.realtime(c);
      setQuote(res);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || '查询失败';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const fmtVolume = (v: number | null) => {
    if (v == null) return '-';
    if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
    if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
    return v.toString();
  };

  const fmtAmount = (v: number | null) => {
    if (v == null) return '-';
    if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
    if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
    return v.toFixed(2);
  };

  const pctColor = quote?.pct_change != null
    ? (quote.pct_change > 0 ? '#f5222d' : quote.pct_change < 0 ? '#52c41a' : 'inherit')
    : 'inherit';

  return (
    <Card>
      <Title level={4} style={{ marginBottom: 16 }}>
        <FieldTimeOutlined /> 实时报价快照
      </Title>

      <Alert
        type="info"
        showIcon
        message="东方财富 push2 qt stock get 接口"
        description="直接调用东方财富实时行情接口，返回最新价、涨跌幅、今开/最高/最低、成交量、成交额等。仅查询不写库。"
        style={{ marginBottom: 16 }}
      />

      <Space style={{ marginBottom: 16 }}>
        <AutoComplete
          style={{ width: 360 }}
          value={code}
          onChange={setCode}
          placeholder="输入代码或名称搜索（如 600000 / 浦发）"
          onSearch={searchStocks}
          options={stockOptions.map((s) => ({
            value: s.code,
            label: `${s.code} ${s.name}`,
          }))}
          filterOption={false}
          allowClear
          onKeyDown={(e) => {
            if (e.key === 'Enter') onQuery();
          }}
        />
        <Button type="primary" icon={<ReloadOutlined />} onClick={onQuery} loading={loading}>
          {loading ? '查询中...' : '查询'}
        </Button>
      </Space>

      {loading && (
        <Card size="small">
          <Spin tip="正在拉取实时行情...">
            <div style={{ height: 60 }} />
          </Spin>
        </Card>
      )}

      {quote && !loading && (
        <>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Space>
                <Title level={4} style={{ margin: 0, fontFamily: 'monospace' }}>
                  {quote.code}
                </Title>
                <Text strong>{quote.name}</Text>
              </Space>
              <Space>
                <Tag>来源：{quote.source}</Tag>
                <Tag>截至：{quote.as_of}</Tag>
              </Space>
            </Space>
          </Card>

          <Row gutter={16}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="最新价"
                  value={quote.price ?? '-'}
                  precision={quote.price != null ? 2 : undefined}
                  valueStyle={{ fontFamily: 'monospace', color: pctColor, fontSize: 24 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="涨跌幅"
                  value={quote.pct_change ?? '-'}
                  precision={quote.pct_change != null ? 2 : undefined}
                  suffix={quote.pct_change != null ? '%' : ''}
                  valueStyle={{ fontFamily: 'monospace', color: pctColor, fontSize: 24 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="今开"
                  value={quote.open ?? '-'}
                  precision={quote.open != null ? 2 : undefined}
                  valueStyle={{ fontFamily: 'monospace' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="昨收"
                  value={quote.pre_close ?? '-'}
                  precision={quote.pre_close != null ? 2 : undefined}
                  valueStyle={{ fontFamily: 'monospace' }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="最高"
                  value={quote.high ?? '-'}
                  precision={quote.high != null ? 2 : undefined}
                  valueStyle={{ fontFamily: 'monospace', color: '#f5222d' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="最低"
                  value={quote.low ?? '-'}
                  precision={quote.low != null ? 2 : undefined}
                  valueStyle={{ fontFamily: 'monospace', color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="成交量"
                  value={fmtVolume(quote.volume)}
                  valueStyle={{ fontFamily: 'monospace' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="成交额"
                  value={fmtAmount(quote.amount)}
                  valueStyle={{ fontFamily: 'monospace' }}
                />
              </Card>
            </Col>
          </Row>

          {quote.turnover != null && (
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="换手率"
                    value={quote.turnover}
                    precision={2}
                    suffix="%"
                    valueStyle={{ fontFamily: 'monospace' }}
                  />
                </Card>
              </Col>
            </Row>
          )}
        </>
      )}

      {!quote && !loading && (
        <Empty description="输入股票代码后点「查询」" />
      )}
    </Card>
  );
}

// ============ Tab 4: 同步日志 ============

function LogsTab() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [logLoading, setLogLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const fetchLogs = async (p = page, status?: string) => {
    setLogLoading(true);
    try {
      const { data: res } = await syncApi.logs({ page: p, page_size: 50, status });
      setLogs(res.data || []);
      setTotal(res.total || 0);
      setPage(p);
    } catch (err) {
      message.error('加载同步日志失败');
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, statusFilter);
  }, []);

  const logColumns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    {
      title: '时间', dataIndex: 'created_at', width: 160,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>,
    },
    {
      title: '来源', dataIndex: 'source', width: 100,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '代码', dataIndex: 'code', width: 100,
      render: (v: string) => v ? <strong style={{ fontFamily: 'monospace' }}>{v}</strong> : <Text type="secondary">-</Text>,
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => {
        const color = v === 'success' || v === 'ok' ? 'green' : v === 'failed' || v === 'fail' ? 'red' : 'default';
        const label = v === 'success' || v === 'ok' ? '成功' : v === 'failed' || v === 'fail' ? '失败' : v;
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: 'K线数', dataIndex: 'bars_count', width: 90, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    { title: '说明', dataIndex: 'message', ellipsis: true },
  ];

  return (
    <Card loading={logLoading}>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <Title level={4} style={{ margin: 0 }}>
          <SyncOutlined /> 同步日志
        </Title>
        <Space>
          <Select
            allowClear
            placeholder="按状态过滤"
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              fetchLogs(1, v);
            }}
            options={[
              { value: 'success', label: '成功' },
              { value: 'ok', label: '成功(ok)' },
              { value: 'failed', label: '失败' },
              { value: 'fail', label: '失败(fail)' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => fetchLogs(page, statusFilter)} loading={logLoading}>刷新</Button>
        </Space>
      </Space>

      <Table
        rowKey="id"
        size="small"
        dataSource={logs}
        columns={logColumns}
        pagination={{
          current: page,
          pageSize: 50,
          total,
          onChange: (p) => fetchLogs(p, statusFilter),
          showTotal: (t) => `共 ${t} 条`,
        }}
        locale={{ emptyText: <Empty description="暂无同步日志" /> }}
        scroll={{ x: 900 }}
      />
    </Card>
  );
}
