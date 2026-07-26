/** 回测中心
 *
 *   - 列表视图：任务表格（策略/股票/区间/初始资金/总收益/最大回撤/夏普/胜率/状态）
 *   - 详情视图：KPI + 净值曲线 + 绩效指标分组 + 交易明细 + 最终持仓
 *   - 运行回测 Modal：策略选择 + 股票搜索 + 日期区间 + 初始资金 + 参数 JSON
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Statistic, Table, Empty,
  Modal, Form, Input, InputNumber, Select, DatePicker, message, Alert,
  Tabs, Badge, Descriptions,
} from 'antd';
import {
  ReloadOutlined, PlusOutlined, ArrowLeftOutlined,
  LineChartOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { backtestApi, stocksApi } from '../services/api';

const { Title, Paragraph } = Typography;
const { RangePicker } = DatePicker;

// ============ 类型 ============
interface JobItem {
  id: number;
  name: string;
  strategy_id: number | null;
  strategy_type: string;
  start_date: string;
  end_date: string;
  initial_cash: number;
  status: string;
  message: string | null;
  total_return: number | null;
  max_drawdown: number | null;
  sharpe_ratio: number | null;
  num_trades: number;
  final_equity: number | null;
  created_at: string | null;
  finished_at: string | null;
}

interface EquityPoint {
  trade_date: string;
  equity: number;
  cash: number;
  market_value: number;
  benchmark_equity: number | null;
}

interface TradeItem {
  id: number;
  trade_date: string;
  code: string;
  name: string;
  side: string;
  price: number;
  qty: number;
  amount: number;
  commission: number;
  stamp_tax: number;
  fee: number;
  pnl: number | null;
  reason: string;
}

interface PositionItem {
  id: number;
  stock_id: number;
  code: string;
  name: string;
  qty: number;
  cost: number;
  close_price: number | null;
}

interface Metrics {
  total_return?: number;
  annualized_return?: number;
  max_drawdown?: number;
  sharpe_ratio?: number;
  sortino_ratio?: number;
  win_rate?: number;
  profit_factor?: number;
  num_trades?: number;
  num_wins?: number;
  num_losses?: number;
  avg_win?: number;
  avg_loss?: number;
  avg_holding_days?: number;
  volatility?: number;
  downside_deviation?: number;
  calmar_ratio?: number;
  final_equity?: number;
  initial_cash?: number;
  max_runup?: number;
  total_profit?: number;
  total_loss?: number;
  total_commission?: number;
  total_stamp_tax?: number;
  total_fee?: number;
  exposure?: number;
  long_exposure?: number;
  [key: string]: number | undefined;
}

interface JobDetail {
  id: number;
  name: string;
  strategy_id: number | null;
  strategy_type: string;
  params: Record<string, unknown>;
  start_date: string;
  end_date: string;
  initial_cash: number;
  status: string;
  message: string | null;
  metrics: Metrics;
  equity: EquityPoint[];
  trades: TradeItem[];
  positions: PositionItem[];
  created_at: string | null;
  finished_at: string | null;
}

interface StrategyOption {
  key: string;
  name: string;
  description: string;
  default_params: Record<string, unknown>;
}

interface StockOption {
  id: number;
  code: string;
  name: string;
}

// ============ 主组件 ============
export default function Backtest() {
  const [list, setList] = useState<JobItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [runOpen, setRunOpen] = useState(false);

  const fetchList = async (p = page) => {
    setLoading(true);
    try {
      const { data: res } = await backtestApi.jobs(p, 20);
      setList(res.data || []);
      setTotal(res.total || 0);
      setPage(p);
    } catch (err) {
      message.error('加载回测任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const { data: res } = await backtestApi.detail(id);
      setDetail(res);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || '加载详情失败';
      message.error(msg);
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchList(1);
  }, []);

  useEffect(() => {
    if (detailId !== null) {
      fetchDetail(detailId);
    } else {
      setDetail(null);
    }
  }, [detailId]);

  // ============ 列表视图 ============
  if (detailId === null) {
    const columns = [
      { title: 'ID', dataIndex: 'id', width: 60 },
      {
        title: '任务名', dataIndex: 'name', width: 180, ellipsis: true,
        render: (v: string) => <strong>{v}</strong>,
      },
      {
        title: '策略', dataIndex: 'strategy_type', width: 110,
        render: (v: string) => <Tag color="blue">{v}</Tag>,
      },
      {
        title: '区间', width: 200,
        render: (_: unknown, r: JobItem) => (
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {r.start_date} ~ {r.end_date}
          </span>
        ),
      },
      {
        title: '初始资金', dataIndex: 'initial_cash', width: 110, align: 'right' as const,
        render: (v: number) => (
          <span style={{ fontFamily: 'monospace' }}>{Number(v).toLocaleString()}</span>
        ),
      },
      {
        title: '总收益', dataIndex: 'total_return', width: 110, align: 'right' as const,
        render: (v: number | null) => v == null ? '-' : (
          <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600', fontFamily: 'monospace' }}>
            {v >= 0 ? '+' : ''}{(v * 100).toFixed(2)}%
          </span>
        ),
      },
      {
        title: '最大回撤', dataIndex: 'max_drawdown', width: 100, align: 'right' as const,
        render: (v: number | null) => v == null ? '-' : (
          <span style={{ color: '#3f8600', fontFamily: 'monospace' }}>
            -{(Math.abs(v) * 100).toFixed(2)}%
          </span>
        ),
      },
      {
        title: '夏普', dataIndex: 'sharpe_ratio', width: 80, align: 'right' as const,
        render: (v: number | null) => v == null ? '-' : (
          <span style={{ fontFamily: 'monospace' }}>{v.toFixed(2)}</span>
        ),
      },
      {
        title: '交易', dataIndex: 'num_trades', width: 70, align: 'right' as const,
        render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
      },
      {
        title: '状态', dataIndex: 'status', width: 90,
        render: (v: string) => {
          const color = v === 'done' ? 'green' : v === 'running' ? 'blue' : v === 'failed' ? 'red' : 'default';
          const label = v === 'done' ? '完成' : v === 'running' ? '运行中' : v === 'failed' ? '失败' : v;
          return <Tag color={color}>{label}</Tag>;
        },
      },
      {
        title: '操作', width: 100, fixed: 'right' as const,
        render: (_: unknown, r: JobItem) => (
          <Button type="link" size="small" onClick={() => setDetailId(r.id)}>查看</Button>
        ),
      },
    ];

    return (
      <div style={{ padding: 20 }}>
        <Card loading={loading}>
          <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
            <Title level={4} style={{ margin: 0 }}>
              <ExperimentOutlined /> 策略回测中心
            </Title>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => fetchList(page)} loading={loading}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setRunOpen(true)}>
                发起回测
              </Button>
            </Space>
          </Space>

          <Table
            rowKey="id"
            size="small"
            dataSource={list}
            columns={columns}
            pagination={{
              current: page,
              pageSize: 20,
              total,
              onChange: (p) => fetchList(p),
              showTotal: (t) => `共 ${t} 条`,
            }}
            locale={{ emptyText: <Empty description="暂无回测任务，点击「发起回测」开始" /> }}
            scroll={{ x: 1200 }}
          />
        </Card>

        <RunBacktestModal
          open={runOpen}
          onClose={() => setRunOpen(false)}
          onSuccess={(jobId) => {
            setRunOpen(false);
            message.success('回测完成');
            setDetailId(jobId);
            fetchList(1);
          }}
        />
      </div>
    );
  }

  // ============ 详情视图 ============
  return (
    <BacktestDetail
      jobId={detailId}
      detail={detail}
      loading={detailLoading}
      onBack={() => setDetailId(null)}
      onRefresh={() => fetchDetail(detailId)}
    />
  );
}

// ============ 运行回测 Modal ============
function RunBacktestModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (jobId: number) => void;
}) {
  const [strategies, setStrategies] = useState<StrategyOption[]>([]);
  const [engineReady, setEngineReady] = useState(true);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [stockSearchLoading, setStockSearchLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      backtestApi.catalog().then(({ data: res }) => {
        setStrategies(res.data || []);
        setEngineReady(res.quantengine_available !== false);
        if (res.data?.[0]) {
          form.setFieldsValue({
            strategy_type: res.data[0].key,
            initial_cash: 1_000_000,
            params_json: JSON.stringify(res.data[0].default_params || {}, null, 2),
          });
        }
      }).catch(() => {
        // 静默
      });
    }
  }, [open]);

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

  const onStrategyChange = (key: string) => {
    const s = strategies.find((x) => x.key === key);
    if (s) {
      form.setFieldsValue({
        params_json: JSON.stringify(s.default_params || {}, null, 2),
      });
    }
  };

  const onRun = async () => {
    try {
      const v = await form.validateFields();
      const range = v.range as [dayjs.Dayjs, dayjs.Dayjs];
      if (!range || range.length !== 2) {
        message.error('请选择回测区间');
        return;
      }

      let params: Record<string, unknown> = {};
      if (v.params_json) {
        try {
          params = JSON.parse(v.params_json);
        } catch (e) {
          message.error('参数 JSON 格式错误');
          return;
        }
      }

      setRunning(true);
      const { data: res } = await backtestApi.run({
        strategy_type: v.strategy_type,
        stock_code: v.stock_code,
        start_date: range[0].format('YYYY-MM-DD'),
        end_date: range[1].format('YYYY-MM-DD'),
        initial_cash: Number(v.initial_cash),
        name: v.name || undefined,
        params,
      });
      if (res.job_id) {
        onSuccess(res.job_id);
      } else {
        message.error(res.detail || '回测失败');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || '回测失败';
      message.error(msg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      title="发起策略回测"
      open={open}
      onCancel={onClose}
      onOk={onRun}
      confirmLoading={running}
      okText={running ? '回测中...' : '开始回测'}
      width={640}
      destroyOnClose
    >
      {!engineReady && (
        <Alert
          type="error"
          showIcon
          message="quantengine 引擎不可用，回测将失败"
          description="请检查 quantengine 是否已正确安装"
          style={{ marginBottom: 16 }}
        />
      )}
      <Alert
        type="info"
        showIcon
        message="单股回测 · 同步阻塞 · 8 种策略可选"
        description="按收盘价撮合，T+1 冻结，含佣金/印花税/滑点。回测完成自动跳转详情。"
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="策略" name="strategy_type" rules={[{ required: true, message: '请选择策略' }]}>
              <Select
                placeholder="选择策略"
                onChange={onStrategyChange}
                options={strategies.map((s) => ({
                  value: s.key,
                  label: `${s.name} (${s.key})`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="任务名（可选）" name="name">
              <Input placeholder="留空则自动生成" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="股票" name="stock_code" rules={[{ required: true, message: '请选择/输入股票代码' }]}>
          <Select
            showSearch
            placeholder="输入代码或名称搜索（如 600036 / 招商银行）"
            filterOption={false}
            onSearch={searchStocks}
            loading={stockSearchLoading}
            options={stockOptions.map((s) => ({
              value: s.code,
              label: `${s.code} ${s.name}`,
            }))}
          />
        </Form.Item>

        <Row gutter={16}>
          <Col span={14}>
            <Form.Item label="回测区间" name="range" rules={[{ required: true, message: '请选择区间' }]}>
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item label="初始资金" name="initial_cash" rules={[{ required: true }]}>
              <InputNumber min={10000} step={100000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="策略参数 JSON（可选）" name="params_json">
          <Input.TextArea
            rows={4}
            placeholder='例如 {"fast_period": 5, "slow_period": 20}'
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============ 详情子组件 ============
function BacktestDetail({
  jobId,
  detail,
  loading,
  onBack,
  onRefresh,
}: {
  jobId: number;
  detail: JobDetail | null;
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const m = detail?.metrics || {};

  // ============ KPI ============
  const totalReturn = m.total_return ?? 0;
  const maxDrawdown = m.max_drawdown ?? 0;
  const sharpe = m.sharpe_ratio ?? 0;
  const winRate = m.win_rate ?? 0;
  const numTrades = m.num_trades ?? 0;
  const finalEquity = m.final_equity ?? detail?.initial_cash ?? 0;
  const annualizedReturn = m.annualized_return ?? 0;
  const profitFactor = m.profit_factor ?? 0;

  const retColor = totalReturn >= 0 ? '#cf1322' : '#3f8600';

  // ============ 净值曲线 ============
  const equityCurve = detail?.equity || [];

  // ============ 绩效指标分组 ============
  const metricsGroups = buildMetricsGroups(m);

  // ============ 交易明细列 ============
  const tradeColumns = [
    {
      title: '日期', dataIndex: 'trade_date', width: 110,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>,
    },
    { title: '代码', dataIndex: 'code', width: 100, render: (v: string) => <strong>{v}</strong> },
    { title: '名称', dataIndex: 'name', width: 100 },
    {
      title: '方向', dataIndex: 'side', width: 70,
      render: (v: string) => (
        <Tag color={v === 'buy' ? 'red' : 'green'}>{v === 'buy' ? '买' : '卖'}</Tag>
      ),
    },
    {
      title: '价', dataIndex: 'price', width: 80, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v.toFixed(2)}</span>,
    },
    {
      title: '量', dataIndex: 'qty', width: 80, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '金额', dataIndex: 'amount', width: 120, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{Number(v).toLocaleString()}</span>,
    },
    {
      title: '费用', dataIndex: 'fee', width: 90, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v.toFixed(2)}</span>,
    },
    {
      title: '盈亏', dataIndex: 'pnl', width: 110, align: 'right' as const,
      render: (v: number | null) => v == null ? '-' : (
        <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600', fontFamily: 'monospace' }}>
          {v >= 0 ? '+' : ''}{Number(v).toFixed(2)}
        </span>
      ),
    },
    {
      title: '原因', dataIndex: 'reason', width: 90, ellipsis: true,
      render: (v: string) => v ? <Tag>{v}</Tag> : '-',
    },
  ];

  // ============ 持仓列 ============
  const positionColumns = [
    { title: '代码', dataIndex: 'code', width: 110, render: (v: string) => <strong>{v}</strong> },
    { title: '名称', dataIndex: 'name', width: 120 },
    {
      title: '数量', dataIndex: 'qty', width: 100, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '成本', dataIndex: 'cost', width: 100, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v.toFixed(4)}</span>,
    },
    {
      title: '收盘价', dataIndex: 'close_price', width: 100, align: 'right' as const,
      render: (v: number | null) => v == null ? '-' : (
        <span style={{ fontFamily: 'monospace' }}>{v.toFixed(2)}</span>
      ),
    },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Card loading={loading}>
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
            <Title level={4} style={{ margin: 0 }}>
              <ExperimentOutlined /> {detail?.name || `回测 #${jobId}`}
            </Title>
            <Tag color="blue">{detail?.strategy_type}</Tag>
            <Tag color={detail?.status === 'done' ? 'green' : detail?.status === 'failed' ? 'red' : 'blue'}>
              {detail?.status === 'done' ? '已完成' : detail?.status === 'failed' ? '失败' : detail?.status}
            </Tag>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>刷新</Button>
        </Space>

        {/* 基本信息 */}
        <Descriptions size="small" column={4} bordered style={{ marginBottom: 16 }}>
          <Descriptions.Item label="回测区间">
            <span style={{ fontFamily: 'monospace' }}>
              {detail?.start_date} ~ {detail?.end_date}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="初始资金">
            <span style={{ fontFamily: 'monospace' }}>{Number(detail?.initial_cash ?? 0).toLocaleString()}</span>
          </Descriptions.Item>
          <Descriptions.Item label="交易日数">
            <span style={{ fontFamily: 'monospace' }}>{equityCurve.length}</span>
          </Descriptions.Item>
          <Descriptions.Item label="完成时间">
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{detail?.finished_at || '-'}</span>
          </Descriptions.Item>
        </Descriptions>

        {/* KPI 卡片 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="总收益"
                value={totalReturn * 100}
                precision={2}
                suffix="%"
                valueStyle={{ color: retColor, fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="年化收益"
                value={annualizedReturn * 100}
                precision={2}
                suffix="%"
                valueStyle={{ color: retColor, fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="最大回撤"
                value={Math.abs(maxDrawdown) * 100}
                precision={2}
                suffix="%"
                valueStyle={{ color: '#3f8600', fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="夏普比率"
                value={sharpe}
                precision={3}
                valueStyle={{ fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="最终权益"
                value={finalEquity}
                precision={2}
                valueStyle={{ color: '#cf1322', fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="胜率"
                value={winRate * 100}
                precision={2}
                suffix="%"
                valueStyle={{ fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="盈亏比"
                value={profitFactor}
                precision={2}
                valueStyle={{ fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="交易次数"
                value={numTrades}
                valueStyle={{ fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
        </Row>

        <Tabs
          items={[
            {
              key: 'equity',
              label: <span><LineChartOutlined /> 净值曲线</span>,
              children: equityCurve.length > 0 ? (
                <ReactECharts
                  option={buildEquityOption(equityCurve, detail?.initial_cash ?? 0)}
                  style={{ height: 400 }}
                />
              ) : (
                <Empty description="暂无净值数据" />
              ),
            },
            {
              key: 'metrics',
              label: '绩效指标',
              children: (
                <Row gutter={[16, 16]}>
                  {metricsGroups.map((g) => (
                    <Col span={8} key={g.title}>
                      <Card size="small" title={g.title}>
                        <Descriptions column={1} size="small">
                          {g.items.map((it) => (
                            <Descriptions.Item key={it.label} label={it.label}>
                              <span style={{ fontFamily: 'monospace', color: it.color || 'inherit' }}>
                                {it.value}
                              </span>
                            </Descriptions.Item>
                          ))}
                        </Descriptions>
                      </Card>
                    </Col>
                  ))}
                </Row>
              ),
            },
            {
              key: 'trades',
              label: <span>交易明细 <Badge count={detail?.trades?.length ?? 0} showZero /></span>,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={detail?.trades || []}
                  columns={tradeColumns}
                  pagination={{ pageSize: 20 }}
                  locale={{ emptyText: <Empty description="无交易记录" /> }}
                  scroll={{ x: 950 }}
                />
              ),
            },
            {
              key: 'positions',
              label: <span>最终持仓 <Badge count={detail?.positions?.length ?? 0} showZero /></span>,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={detail?.positions || []}
                  columns={positionColumns}
                  pagination={false}
                  locale={{ emptyText: <Empty description="回测结束时无持仓" /> }}
                />
              ),
            },
            {
              key: 'params',
              label: '策略参数',
              children: (
                <Card size="small">
                  <Paragraph>
                    <pre style={{
                      fontFamily: 'monospace', fontSize: 12, margin: 0,
                      background: '#f5f5f5', padding: 12, borderRadius: 4,
                    }}>
                      {JSON.stringify(detail?.params || {}, null, 2)}
                    </pre>
                  </Paragraph>
                </Card>
              ),
            },
          ]}
        />

        {detail?.message && detail.status === 'failed' && (
          <Alert
            type="error"
            showIcon
            message="回测失败"
            description={detail.message}
            style={{ marginTop: 16 }}
          />
        )}
      </Card>
    </div>
  );
}

// ============ 绩效指标分组 ============
interface MetricItem {
  label: string;
  value: string;
  color?: string;
}
interface MetricGroup {
  title: string;
  items: MetricItem[];
}

function buildMetricsGroups(m: Metrics): MetricGroup[] {
  const pct = (v: number | undefined, digits = 2) =>
    v == null ? '-' : `${(v * 100).toFixed(digits)}%`;
  const num = (v: number | undefined, digits = 2) =>
    v == null ? '-' : v.toFixed(digits);
  const money = (v: number | undefined, digits = 2) =>
    v == null ? '-' : Number(v).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return [
    {
      title: '收益类',
      items: [
        { label: '总收益', value: pct(m.total_return), color: (m.total_return ?? 0) >= 0 ? '#cf1322' : '#3f8600' },
        { label: '年化收益', value: pct(m.annualized_return), color: (m.annualized_return ?? 0) >= 0 ? '#cf1322' : '#3f8600' },
        { label: '最大回撤', value: pct(-Math.abs(m.max_drawdown ?? 0)), color: '#3f8600' },
        { label: '最大连胜', value: pct(m.max_runup) },
        { label: '总盈利', value: money(m.total_profit), color: '#cf1322' },
        { label: '总亏损', value: money(m.total_loss), color: '#3f8600' },
      ],
    },
    {
      title: '风险类',
      items: [
        { label: '夏普比率', value: num(m.sharpe_ratio, 3) },
        { label: '索提诺比率', value: num(m.sortino_ratio, 3) },
        { label: '卡玛比率', value: num(m.calmar_ratio, 3) },
        { label: '波动率', value: pct(m.volatility) },
        { label: '下行波动', value: pct(m.downside_deviation) },
      ],
    },
    {
      title: '效率与交易统计',
      items: [
        { label: '胜率', value: pct(m.win_rate) },
        { label: '盈亏比', value: num(m.profit_factor) },
        { label: '交易次数', value: String(m.num_trades ?? 0) },
        { label: '盈利次数', value: String(m.num_wins ?? 0) },
        { label: '亏损次数', value: String(m.num_losses ?? 0) },
        { label: '平均盈利', value: money(m.avg_win), color: '#cf1322' },
        { label: '平均亏损', value: money(m.avg_loss), color: '#3f8600' },
        { label: '平均持仓(天)', value: num(m.avg_holding_days, 1) },
        { label: '总手续费', value: money(m.total_fee) },
        { label: '总佣金', value: money(m.total_commission) },
        { label: '总印花税', value: money(m.total_stamp_tax) },
        { label: '持仓暴露', value: pct(m.exposure) },
      ],
    },
  ];
}

// ============ 净值曲线图 ============
function buildEquityOption(curve: EquityPoint[], initialCash: number) {
  const dates = curve.map((p) => p.trade_date);
  const equities = curve.map((p) => p.equity);
  const cashs = curve.map((p) => p.cash);
  const mvs = curve.map((p) => p.market_value);
  const benchmarks = curve.map((p) => p.benchmark_equity);

  const series: any[] = [
    {
      name: '策略权益',
      type: 'line',
      data: equities,
      smooth: true,
      symbol: 'none',
      lineStyle: { color: '#cf1322', width: 2 },
      itemStyle: { color: '#cf1322' },
      areaStyle: { color: 'rgba(207,19,34,0.1)' },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#999', type: 'dashed', width: 1 },
        data: [{ yAxis: initialCash, name: '初始资金' }],
      },
    },
    {
      name: '现金',
      type: 'line',
      data: cashs,
      smooth: true,
      symbol: 'none',
      lineStyle: { color: '#fa8c16', width: 1.5, type: 'dashed' },
      itemStyle: { color: '#fa8c16' },
    },
    {
      name: '市值',
      type: 'line',
      data: mvs,
      smooth: true,
      symbol: 'none',
      lineStyle: { color: '#1890ff', width: 1.5, type: 'dashed' },
      itemStyle: { color: '#1890ff' },
    },
  ];

  if (benchmarks.some((v) => v != null)) {
    series.push({
      name: '基准',
      type: 'line',
      data: benchmarks,
      smooth: true,
      symbol: 'none',
      lineStyle: { color: '#722ed1', width: 1.5 },
      itemStyle: { color: '#722ed1' },
    });
  }

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const d = params[0]?.axisValue || '';
        let s = `<div style="font-weight:600">${d}</div>`;
        params.forEach((p) => {
          const v = p.value;
          if (v == null) return;
          s += `<div>${p.marker} ${p.seriesName}: <span style="font-family:monospace">${Number(v).toLocaleString()}</span></div>`;
        });
        return s;
      },
    },
    legend: { data: series.map((s) => s.name) },
    grid: { left: 60, right: 30, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        fontSize: 10,
        formatter: (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toString()),
      },
    },
    series,
  };
}
