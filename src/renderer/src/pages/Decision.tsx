/** 操盘台
 *
 * 三个 Tab：
 *   1. 今日决策：买/卖/Top 列表 + 一键扫描按钮
 *   2. 历史扫描：扫描任务列表
 *   3. 个股查询：输入代码查历史信号
 */
import { useEffect, useState } from 'react';
import {
  Card, Tabs, Table, Tag, Button, Space, Typography, Input, Descriptions,
  Statistic, Row, Col, message, Modal, InputNumber, Form, Select, Alert, Empty,
} from 'antd';
import {
  ThunderboltOutlined, ReloadOutlined, HistoryOutlined, SearchOutlined,
  ArrowUpOutlined, ArrowDownOutlined, StarOutlined,
} from '@ant-design/icons';
import { decisionApi } from '../services/api';

const { Title } = Typography;

// ============ 类型 ============
interface SignalItem {
  id: number | null;
  run_id: number;
  rank_no: number;
  code: string;
  name: string;
  signal: string;
  score: number;
  confidence: number;
  close_price: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  position_pct: number | null;
  action_text: string;
  reasons?: { dimensions?: Record<string, number> };
  detail?: { trade_plan?: Record<string, number> };
  created_at: string | null;
}

interface TodayDecision {
  as_of_date: string;
  has_data: boolean;
  message?: string;
  buy: SignalItem[];
  sell: SignalItem[];
  top: SignalItem[];
  last_run: {
    run_id: number;
    name: string;
    scanned: number;
    matched: number;
    created_at: string;
  } | null;
  summary?: { buy_count: number; sell_count: number; hold_count: number; total_saved: number };
}

interface HistoryItem {
  id: number;
  name: string;
  as_of_date: string;
  scanned: number;
  matched: number;
  created_by: number;
  created_at: string;
}

interface RunDetail {
  run_id: number;
  name: string;
  as_of_date: string;
  scanned: number;
  matched: number;
  created_at: string;
  summary: Record<string, unknown>;
  results: SignalItem[];
}

// ============ 信号标签 ============
const SIGNAL_TAG: Record<string, { color: string; label: string }> = {
  STRONG_BUY: { color: 'red', label: '强烈买入' },
  BUY: { color: 'volcano', label: '买入' },
  HOLD: { color: 'gold', label: '持有' },
  SELL: { color: 'cyan', label: '卖出' },
  STRONG_SELL: { color: 'blue', label: '强烈卖出' },
  AVOID: { color: 'default', label: '回避' },
};

const SignalTag = ({ signal }: { signal: string }) => {
  const conf = SIGNAL_TAG[signal] ?? { color: 'default', label: signal };
  return <Tag color={conf.color}>{conf.label}</Tag>;
};

// ============ 主组件 ============
export default function Decision() {
  const [activeTab, setActiveTab] = useState('today');
  const [today, setToday] = useState<TodayDecision | null>(null);
  const [history, setHistory] = useState<{ data: HistoryItem[]; total: number }>({ data: [], total: 0 });
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [runDetailOpen, setRunDetailOpen] = useState(false);
  const [stockCode, setStockCode] = useState('');
  const [stockHistory, setStockHistory] = useState<SignalItem[]>([]);
  const [stockSearching, setStockSearching] = useState(false);

  const fetchToday = async () => {
    setLoading(true);
    try {
      const { data } = await decisionApi.index();
      setToday(data);
    } catch (err) {
      message.error('加载今日决策失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await decisionApi.history(page, 20);
      setHistory({ data: data.data, total: data.total });
      setHistoryPage(page);
    } catch (err) {
      message.error('加载历史扫描失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchRunDetail = async (runId: number) => {
    setLoading(true);
    try {
      const { data } = await decisionApi.runDetail(runId);
      setRunDetail(data);
      setRunDetailOpen(true);
    } catch (err) {
      message.error('加载扫描详情失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchStockHistory = async (code: string) => {
    if (!code.trim()) {
      message.warning('请输入股票代码');
      return;
    }
    setStockSearching(true);
    try {
      const { data } = await decisionApi.stockHistory(code.trim());
      setStockHistory(data.history || []);
    } catch (err) {
      message.error('查询个股历史失败');
    } finally {
      setStockSearching(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'today') fetchToday();
    else if (activeTab === 'history') fetchHistory(1);
  }, [activeTab]);

  // ============ 一键扫描 ============
  const onScan = async (values: Record<string, unknown>) => {
    setScanning(true);
    try {
      const { data } = await decisionApi.run({
        scope: values.scope as string,
        scan_all_limit: Number(values.scan_all_limit ?? 800),
        top_n: Number(values.top_n ?? 20),
        min_score: Number(values.min_score ?? 55),
        only_buy: Boolean(values.only_buy),
        min_amount: Number(values.min_amount ?? 20_000_000),
        fresh_days: Number(values.fresh_days ?? 7),
      });
      if (data.error) {
        message.error(`扫描失败：${data.error}`);
      } else {
        message.success(`扫描完成：扫描 ${data.scanned} 只 / 匹配 ${data.matched} 只 / 入榜 ${data.saved} 只`);
        setScanModalOpen(false);
        fetchToday();
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '扫描失败';
      message.error(detail);
    } finally {
      setScanning(false);
    }
  };

  // ============ 表格列 ============
  const signalColumns = [
    { title: '#', dataIndex: 'rank_no', width: 50 },
    { title: '代码', dataIndex: 'code', width: 110, render: (v: string) => <strong>{v}</strong> },
    { title: '名称', dataIndex: 'name', width: 110 },
    {
      title: '信号', dataIndex: 'signal', width: 100,
      render: (v: string) => <SignalTag signal={v} />,
    },
    {
      title: '评分', dataIndex: 'score', width: 80,
      render: (v: number) => <strong style={{ color: v >= 70 ? '#cf1322' : v >= 55 ? '#fa8c16' : '#8c8c8c' }}>{v.toFixed(1)}</strong>,
    },
    { title: '现价', dataIndex: 'close_price', width: 80, render: (v: number | null) => v?.toFixed(2) ?? '-' },
    { title: '入场', dataIndex: 'entry_price', width: 80, render: (v: number | null) => v?.toFixed(2) ?? '-' },
    { title: '止损', dataIndex: 'stop_loss', width: 80, render: (v: number | null) => v?.toFixed(2) ?? '-' },
    { title: '止盈', dataIndex: 'take_profit', width: 80, render: (v: number | null) => v?.toFixed(2) ?? '-' },
    {
      title: '仓位', dataIndex: 'position_pct', width: 80,
      render: (v: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : '-',
    },
    { title: '行动指引', dataIndex: 'action_text', ellipsis: true },
  ];

  const historyColumns = [
    { title: 'Run ID', dataIndex: 'id', width: 80 },
    { title: '名称', dataIndex: 'name' },
    { title: '扫描日期', dataIndex: 'as_of_date', width: 120 },
    { title: '扫描数', dataIndex: 'scanned', width: 80 },
    { title: '匹配数', dataIndex: 'matched', width: 80 },
    { title: '创建时间', dataIndex: 'created_at', width: 180 },
    {
      title: '操作', width: 100,
      render: (_: unknown, row: HistoryItem) => (
        <Button size="small" onClick={() => fetchRunDetail(row.id)}>查看详情</Button>
      ),
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
              key: 'today',
              label: (
                <span><ThunderboltOutlined /> 今日决策</span>
              ),
              children: (
                <div>
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="买入信号"
                          value={today?.summary?.buy_count ?? 0}
                          prefix={<ArrowUpOutlined style={{ color: '#cf1322' }} />}
                          valueStyle={{ color: '#cf1322' }}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="卖出信号"
                          value={today?.summary?.sell_count ?? 0}
                          prefix={<ArrowDownOutlined style={{ color: '#3f8600' }} />}
                          valueStyle={{ color: '#3f8600' }}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="持有信号"
                          value={today?.summary?.hold_count ?? 0}
                          prefix={<StarOutlined />}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="扫描日期"
                          value={today?.as_of_date ?? '-'}
                        />
                      </Card>
                    </Col>
                  </Row>

                  <Space style={{ marginBottom: 16 }}>
                    <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => setScanModalOpen(true)}>
                      一键扫描
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={fetchToday} loading={loading}>
                      刷新
                    </Button>
                    <Button icon={<HistoryOutlined />} onClick={() => setActiveTab('history')}>
                      历史扫描
                    </Button>
                  </Space>

                  {today?.last_run && (
                    <Descriptions size="small" bordered column={4} style={{ marginBottom: 16 }}>
                      <Descriptions.Item label="最近 Run ID">{today.last_run.run_id}</Descriptions.Item>
                      <Descriptions.Item label="扫描数">{today.last_run.scanned}</Descriptions.Item>
                      <Descriptions.Item label="匹配数">{today.last_run.matched}</Descriptions.Item>
                      <Descriptions.Item label="创建时间">{today.last_run.created_at}</Descriptions.Item>
                    </Descriptions>
                  )}

                  {!today?.has_data && (
                    <Alert
                      type="info"
                      showIcon
                      message={today?.message ?? '今日尚未扫描，请点击「一键扫描」'}
                      style={{ marginBottom: 16 }}
                    />
                  )}

                  <Title level={5}>买入信号（{today?.buy?.length ?? 0}）</Title>
                  <Table
                    rowKey={(r) => `${r.run_id}-${r.rank_no}`}
                    size="small"
                    loading={loading}
                    dataSource={today?.buy ?? []}
                    columns={signalColumns}
                    pagination={false}
                    locale={{ emptyText: <Empty description="无买入信号" /> }}
                    style={{ marginBottom: 24 }}
                  />

                  <Title level={5}>卖出信号（{today?.sell?.length ?? 0}）</Title>
                  <Table
                    rowKey={(r) => `${r.run_id}-${r.rank_no}`}
                    size="small"
                    loading={loading}
                    dataSource={today?.sell ?? []}
                    columns={signalColumns}
                    pagination={false}
                    locale={{ emptyText: <Empty description="无卖出信号" /> }}
                    style={{ marginBottom: 24 }}
                  />

                  <Title level={5}>Top 10 综合榜</Title>
                  <Table
                    rowKey={(r) => `${r.run_id}-${r.rank_no}`}
                    size="small"
                    loading={loading}
                    dataSource={today?.top ?? []}
                    columns={signalColumns}
                    pagination={false}
                  />
                </div>
              ),
            },
            {
              key: 'history',
              label: (
                <span><HistoryOutlined /> 历史扫描</span>
              ),
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  loading={loading}
                  dataSource={history.data}
                  columns={historyColumns}
                  pagination={{
                    current: historyPage,
                    pageSize: 20,
                    total: history.total,
                    onChange: (p) => fetchHistory(p),
                  }}
                />
              ),
            },
            {
              key: 'stock',
              label: (
                <span><SearchOutlined /> 个股查询</span>
              ),
              children: (
                <div>
                  <Space style={{ marginBottom: 16 }}>
                    <Input.Search
                      placeholder="输入股票代码，如 000001 或 600519"
                      allowClear
                      style={{ width: 320 }}
                      onSearch={fetchStockHistory}
                      onChange={(e) => setStockCode(e.target.value)}
                      value={stockCode}
                      enterButton
                      loading={stockSearching}
                    />
                  </Space>
                  <Table
                    rowKey={(r, i) => `${r.run_id}-${i}`}
                    size="small"
                    loading={stockSearching}
                    dataSource={stockHistory}
                    columns={signalColumns}
                    pagination={{ pageSize: 20 }}
                    locale={{ emptyText: <Empty description="输入股票代码查询历史信号" /> }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* 一键扫描 Modal */}
      <Modal
        title="一键扫描选股"
        open={scanModalOpen}
        onCancel={() => setScanModalOpen(false)}
        footer={null}
        width={520}
      >
        <Form
          layout="horizontal"
          labelCol={{ span: 8 }}
          wrapperCol={{ span: 16 }}
          initialValues={{
            scope: 'all',
            scan_all_limit: 800,
            top_n: 20,
            min_score: 55,
            only_buy: true,
            min_amount: 20_000_000,
            fresh_days: 7,
          }}
          onFinish={onScan}
        >
          <Form.Item label="扫描范围" name="scope">
            <Select
              options={[
                { value: 'all', label: '全市场（限 800 只）' },
                { value: 'main', label: '沪深主板' },
                { value: 'watchlist', label: '自选股' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Top N" name="top_n">
            <InputNumber min={5} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="最低评分" name="min_score">
            <InputNumber min={0} max={100} step={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="最低成交额" name="min_amount" tooltip="单位：元，过滤低流动性">
            <InputNumber min={0} step={5_000_000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="数据新鲜度" name="fresh_days" tooltip="要求最近 N 天内有 K 线">
            <InputNumber min={1} max={30} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="扫描上限" name="scan_all_limit">
            <InputNumber min={50} max={5000} step={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="仅看买入" name="only_buy" valuePropName="checked">
            <Select
              options={[
                { value: true, label: '只看 STRONG_BUY/BUY' },
                { value: false, label: '全部信号' },
              ]}
            />
          </Form.Item>
          <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
            <Space>
              <Button type="primary" htmlType="submit" loading={scanning} icon={<ThunderboltOutlined />}>
                开始扫描
              </Button>
              <Button onClick={() => setScanModalOpen(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 扫描详情 Modal */}
      <Modal
        title={runDetail ? `扫描详情 #${runDetail.run_id} - ${runDetail.name}` : '扫描详情'}
        open={runDetailOpen}
        onCancel={() => setRunDetailOpen(false)}
        footer={<Button onClick={() => setRunDetailOpen(false)}>关闭</Button>}
        width={1100}
      >
        {runDetail && (
          <>
            <Descriptions size="small" bordered column={4} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="扫描日期">{runDetail.as_of_date}</Descriptions.Item>
              <Descriptions.Item label="扫描数">{runDetail.scanned}</Descriptions.Item>
              <Descriptions.Item label="匹配数">{runDetail.matched}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{runDetail.created_at}</Descriptions.Item>
            </Descriptions>
            <Table
              rowKey={(r, i) => `${r.run_id}-${i}`}
              size="small"
              dataSource={runDetail.results}
              columns={signalColumns}
              pagination={{ pageSize: 10 }}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
