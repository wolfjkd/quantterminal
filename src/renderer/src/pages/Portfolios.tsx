/** 投资组合
 *
 *   - 列表视图：组合 KPI + 表格（初始资金/现金/市值/权益/盈亏）
 *   - 详情视图：快速下单 + 持仓表 + 最近成交 + 委托记录 + 权益曲线
 *   - 创建组合 Modal
 *   - 日终解冻按钮（T+1 模拟）
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Statistic, Table, Empty,
  Modal, Form, Input, InputNumber, Select, message, Alert,
  Popconfirm, Tabs, Badge,
} from 'antd';
import {
  ReloadOutlined, PlusOutlined, ArrowLeftOutlined, ThunderboltOutlined,
  UnlockOutlined, WalletOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { portfolioApi, stocksApi } from '../services/api';

const { Title } = Typography;

// ============ 类型 ============
interface PortfolioItem {
  id: number;
  name: string;
  initial_cash: number;
  cash: number;
  market_value: number;
  equity: number;
  pnl: number;
  pnl_pct: number | null;
  status: number;
  created_at: string;
}

interface PositionItem {
  id: number;
  stock_id: number;
  code: string;
  name: string;
  qty: number;
  available_qty: number;
  cost: number;
  current_price: number | null;
  market_value: number;
  float_pnl: number | null;
  float_pct: number | null;
}

interface FillItem {
  id: number;
  code: string;
  name: string;
  side: string;
  price: number;
  qty: number;
  amount: number;
  commission: number;
  stamp_tax: number;
  fee: number;
  trade_date: string;
}

interface OrderItem {
  id: number;
  code: string;
  side: string;
  order_price: number;
  qty: number;
  status: string;
  message: string;
  created_at: string;
}

interface EquityPoint {
  trade_date: string;
  equity: number;
  cash: number;
  market_value: number;
}

interface PortfolioDetail extends PortfolioItem {
  positions: PositionItem[];
  fills: FillItem[];
  orders: OrderItem[];
  position_count: number;
}

interface StockOption {
  id: number;
  code: string;
  name: string;
}

// ============ 主组件 ============
export default function Portfolios() {
  const [list, setList] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PortfolioDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchList = async () => {
    setLoading(true);
    try {
      const { data: res } = await portfolioApi.list();
      setList(res.data || []);
    } catch (err) {
      message.error('加载组合列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const { data: res } = await portfolioApi.detail(id);
      setDetail(res);
    } catch (err) {
      message.error('加载组合详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  useEffect(() => {
    if (detailId !== null) {
      fetchDetail(detailId);
    } else {
      setDetail(null);
    }
  }, [detailId]);

  const onCreate = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      await portfolioApi.create(v.name, v.initial_cash ? Number(v.initial_cash) : undefined);
      message.success('组合已创建');
      setCreateOpen(false);
      form.resetFields();
      fetchList();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '创建失败';
      message.error(detail);
    } finally {
      setSaving(false);
    }
  };

  // ============ 列表视图 ============
  if (detailId === null) {
    const columns = [
      { title: 'ID', dataIndex: 'id', width: 60 },
      {
        title: '名称', dataIndex: 'name', width: 160,
        render: (v: string) => <strong>{v}</strong>,
      },
      {
        title: '初始资金', dataIndex: 'initial_cash', width: 120, align: 'right' as const,
        render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{Number(v).toLocaleString()}</span>,
      },
      {
        title: '现金', dataIndex: 'cash', width: 120, align: 'right' as const,
        render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{Number(v).toLocaleString()}</span>,
      },
      {
        title: '市值', dataIndex: 'market_value', width: 120, align: 'right' as const,
        render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{Number(v).toLocaleString()}</span>,
      },
      {
        title: '总权益', dataIndex: 'equity', width: 130, align: 'right' as const,
        render: (v: number) => (
          <strong style={{ color: '#cf1322', fontFamily: 'monospace' }}>{Number(v).toLocaleString()}</strong>
        ),
      },
      {
        title: '盈亏', dataIndex: 'pnl', width: 140, align: 'right' as const,
        render: (v: number, r: PortfolioItem) => {
          const pct = r.pnl_pct != null ? `${(r.pnl_pct * 100).toFixed(2)}%` : '-';
          return (
            <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600', fontFamily: 'monospace' }}>
              {v >= 0 ? '+' : ''}{Number(v).toLocaleString()}
              <div style={{ fontSize: 12 }}>{pct}</div>
            </span>
          );
        },
      },
      {
        title: '操作', width: 120, fixed: 'right' as const,
        render: (_: unknown, r: PortfolioItem) => (
          <Button type="link" size="small" onClick={() => setDetailId(r.id)}>进入</Button>
        ),
      },
    ];

    return (
      <div style={{ padding: 20 }}>
        <Card loading={loading}>
          <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
            <Title level={4} style={{ margin: 0 }}>
              <WalletOutlined /> 模拟组合管理
            </Title>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={fetchList} loading={loading}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建组合
              </Button>
            </Space>
          </Space>

          <Table
            rowKey="id"
            size="small"
            dataSource={list}
            columns={columns}
            pagination={{ pageSize: 20 }}
            locale={{ emptyText: <Empty description="暂无组合，先创建模拟账户" /> }}
            scroll={{ x: 1000 }}
          />
        </Card>

        <Modal
          title="新建模拟组合"
          open={createOpen}
          onCancel={() => setCreateOpen(false)}
          onOk={onCreate}
          confirmLoading={saving}
          okText="创建"
        >
          <Form form={form} layout="vertical">
            <Form.Item label="组合名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="如 短线模拟账户" />
            </Form.Item>
            <Form.Item label="初始资金" name="initial_cash" initialValue={1000000}>
              <InputNumber min={10000} step={100000} style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    );
  }

  // ============ 详情视图 ============
  return (
    <PortfolioDetail
      portfolioId={detailId}
      detail={detail}
      loading={detailLoading}
      onBack={() => setDetailId(null)}
      onRefresh={() => fetchDetail(detailId)}
    />
  );
}

// ============ 详情子组件 ============
function PortfolioDetail({
  portfolioId,
  detail,
  loading,
  onBack,
  onRefresh,
}: {
  portfolioId: number;
  detail: PortfolioDetail | null;
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [settling, setSettling] = useState(false);
  const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [stockSearchLoading, setStockSearchLoading] = useState(false);
  const [orderForm] = Form.useForm();

  const fetchEquity = async () => {
    try {
      const { data: res } = await portfolioApi.equity(portfolioId, 60);
      setEquityCurve(res.curve || []);
    } catch (err) {
      // 静默
    }
  };

  useEffect(() => {
    fetchEquity();
  }, [portfolioId, detail?.fills?.length]);

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

  const openOrderModal = (preset?: { stock_id?: number; side?: 'buy' | 'sell' }) => {
    orderForm.resetFields();
    if (preset?.stock_id) {
      orderForm.setFieldsValue({
        stock_id: preset.stock_id,
        side: preset.side || 'buy',
        qty: 100,
      });
      // 同步补齐 stockOptions
      const pos = detail?.positions?.find((p) => p.stock_id === preset.stock_id);
      if (pos) {
        setStockOptions([{ id: pos.stock_id, code: pos.code, name: pos.name }]);
      }
    } else {
      orderForm.setFieldsValue({ side: 'buy', qty: 100 });
    }
    setOrderModalOpen(true);
  };

  const onPlaceOrder = async () => {
    try {
      const v = await orderForm.validateFields();
      setPlacing(true);
      const { data: res } = await portfolioApi.order(
        portfolioId,
        Number(v.stock_id),
        v.side,
        Number(v.qty),
      );
      message.success(res.message || '下单成功');
      setOrderModalOpen(false);
      onRefresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '下单失败';
      message.error(detail);
    } finally {
      setPlacing(false);
    }
  };

  const onSettle = async () => {
    setSettling(true);
    try {
      const { data: res } = await portfolioApi.settle(portfolioId);
      message.success(res.message || '已解冻');
      onRefresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '解冻失败';
      message.error(detail);
    } finally {
      setSettling(false);
    }
  };

  // ============ KPI ============
  const pnl = detail?.pnl ?? 0;
  const pnlPct = detail?.pnl_pct;
  const pnlColor = pnl >= 0 ? '#cf1322' : '#3f8600';

  // ============ 持仓表 ============
  const positionColumns = [
    { title: '代码', dataIndex: 'code', width: 110, render: (v: string) => <strong>{v}</strong> },
    { title: '名称', dataIndex: 'name', width: 100 },
    {
      title: '数量', dataIndex: 'qty', width: 80, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '可卖', dataIndex: 'available_qty', width: 80, align: 'right' as const,
      render: (v: number, r: PositionItem) => (
        <span style={{
          fontFamily: 'monospace',
          color: v < r.qty ? '#fa8c16' : 'inherit',
        }}>{v}</span>
      ),
    },
    {
      title: '成本', dataIndex: 'cost', width: 90, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v.toFixed(4)}</span>,
    },
    {
      title: '现价', dataIndex: 'current_price', width: 90, align: 'right' as const,
      render: (v: number | null) => v != null ?
        <span style={{ fontFamily: 'monospace' }}>{v.toFixed(2)}</span> : '-',
    },
    {
      title: '市值', dataIndex: 'market_value', width: 110, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{Number(v).toLocaleString()}</span>,
    },
    {
      title: '浮盈', dataIndex: 'float_pnl', width: 120, align: 'right' as const,
      render: (v: number | null, r: PositionItem) => {
        if (v == null) return '-';
        const pct = r.float_pct != null ? `${(r.float_pct * 100).toFixed(2)}%` : '';
        return (
          <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600', fontFamily: 'monospace' }}>
            {v >= 0 ? '+' : ''}{Number(v).toFixed(2)}
            <div style={{ fontSize: 12 }}>{pct}</div>
          </span>
        );
      },
    },
    {
      title: '', width: 100,
      render: (_: unknown, r: PositionItem) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => openOrderModal({ stock_id: r.stock_id, side: 'sell' })}>
            卖出
          </Button>
          <Button type="link" size="small" onClick={() => openOrderModal({ stock_id: r.stock_id, side: 'buy' })}>
            加仓
          </Button>
        </Space>
      ),
    },
  ];

  // ============ 成交表 ============
  const fillColumns = [
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
  ];

  // ============ 委托表 ============
  const orderColumns = [
    {
      title: '时间', dataIndex: 'created_at', width: 160,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>,
    },
    { title: '代码', dataIndex: 'code', width: 100, render: (v: string) => <strong>{v}</strong> },
    {
      title: '方向', dataIndex: 'side', width: 70,
      render: (v: string) => (
        <Tag color={v === 'buy' ? 'red' : 'green'}>{v === 'buy' ? '买' : '卖'}</Tag>
      ),
    },
    {
      title: '价', dataIndex: 'order_price', width: 80, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v.toFixed(2)}</span>,
    },
    {
      title: '量', dataIndex: 'qty', width: 80, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => (
        <Tag color={v === 'filled' ? 'green' : v === 'rejected' ? 'red' : 'default'}>
          {v === 'filled' ? '已成' : v === 'rejected' ? '拒单' : v}
        </Tag>
      ),
    },
    { title: '说明', dataIndex: 'message', ellipsis: true },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Card loading={loading}>
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
            <Title level={4} style={{ margin: 0 }}>
              <WalletOutlined /> {detail?.name || `组合 #${portfolioId}`}
            </Title>
            <Tag color="blue">模拟组合 · T+1</Tag>
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>刷新</Button>
            <Popconfirm
              title="解冻全部持仓可卖数量？"
              description="模拟下一交易日开盘（T+1 解冻）"
              onConfirm={onSettle}
              okText="解冻"
              cancelText="取消"
            >
              <Button icon={<UnlockOutlined />} loading={settling}>日终解冻</Button>
            </Popconfirm>
            <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => openOrderModal()}>
              快速下单
            </Button>
          </Space>
        </Space>

        {/* KPI */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={5}>
            <Card size="small">
              <Statistic
                title="现金"
                value={detail?.cash ?? 0}
                precision={2}
                valueStyle={{ fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small">
              <Statistic
                title="市值"
                value={detail?.market_value ?? 0}
                precision={2}
                valueStyle={{ fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small">
              <Statistic
                title="总权益"
                value={detail?.equity ?? 0}
                precision={2}
                valueStyle={{ color: '#cf1322', fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small">
              <Statistic
                title="初始资金"
                value={detail?.initial_cash ?? 0}
                precision={2}
                valueStyle={{ fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic
                title="盈亏"
                value={pnl}
                precision={2}
                valueStyle={{ color: pnlColor, fontFamily: 'monospace' }}
                suffix={pnlPct != null ? `(${(pnlPct * 100).toFixed(2)}%)` : ''}
              />
            </Card>
          </Col>
        </Row>

        <Tabs
          items={[
            {
              key: 'positions',
              label: <span>持仓 <Badge count={detail?.position_count ?? 0} showZero /></span>,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={detail?.positions || []}
                  columns={positionColumns}
                  pagination={false}
                  locale={{ emptyText: <Empty description="空仓" /> }}
                  scroll={{ x: 900 }}
                />
              ),
            },
            {
              key: 'fills',
              label: <span>最近成交 <Badge count={detail?.fills?.length ?? 0} showZero /></span>,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={detail?.fills || []}
                  columns={fillColumns}
                  pagination={{ pageSize: 15 }}
                  locale={{ emptyText: <Empty description="暂无成交" /> }}
                  scroll={{ x: 800 }}
                />
              ),
            },
            {
              key: 'orders',
              label: <span>委托记录 <Badge count={detail?.orders?.length ?? 0} showZero /></span>,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={detail?.orders || []}
                  columns={orderColumns}
                  pagination={{ pageSize: 15 }}
                  locale={{ emptyText: <Empty description="暂无委托" /> }}
                  scroll={{ x: 800 }}
                />
              ),
            },
            {
              key: 'equity',
              label: '权益曲线',
              children: equityCurve.length > 0 ? (
                <ReactECharts
                  option={buildEquityOption(equityCurve)}
                  style={{ height: 360 }}
                />
              ) : (
                <Empty description="暂无权益数据（下单后将自动记录）" />
              ),
            },
          ]}
        />
      </Card>

      {/* 下单 Modal */}
      <Modal
        title="快速下单"
        open={orderModalOpen}
        onCancel={() => setOrderModalOpen(false)}
        onOk={onPlaceOrder}
        confirmLoading={placing}
        okText="提交委托"
        width={520}
      >
        <Alert
          type="info"
          showIcon
          message="按最新收盘价撮合，T+1 不可卖（需日终解冻）"
          style={{ marginBottom: 16 }}
        />
        <Form form={orderForm} layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
          <Form.Item label="股票" name="stock_id" rules={[{ required: true, message: '请选择股票' }]}>
            <Select
              showSearch
              placeholder="输入代码或名称搜索"
              filterOption={false}
              onSearch={searchStocks}
              loading={stockSearchLoading}
              options={stockOptions.map((s) => ({
                value: s.id,
                label: `${s.code} ${s.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item label="方向" name="side" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'buy', label: '买入（红）' },
                { value: 'sell', label: '卖出（绿）' },
              ]}
            />
          </Form.Item>
          <Form.Item label="数量" name="qty" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber min={1} step={100} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ============ 图表配置 ============
function buildEquityOption(curve: EquityPoint[]) {
  const dates = curve.map((p) => p.trade_date);
  const equities = curve.map((p) => p.equity);
  const cashs = curve.map((p) => p.cash);
  const mvs = curve.map((p) => p.market_value);

  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['总权益', '现金', '市值'] },
    grid: { left: 50, right: 30, top: 40, bottom: 30 },
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
    series: [
      {
        name: '总权益',
        type: 'line',
        data: equities,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#cf1322', width: 2 },
        itemStyle: { color: '#cf1322' },
        areaStyle: { color: 'rgba(207,19,34,0.1)' },
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
    ],
  };
}
