/** 量化工作台
 *
 *   - 数据健康度面板（fresh/total/as_of）
 *   - 策略目录（6 个内置）
 *   - 最近一次扫描结果（buy/sell/top）
 *   - 运行策略选股（一键扫描）
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Statistic,
  Progress, Table, Empty, Modal, Form, InputNumber, Select, message, Alert,
  Tabs, Badge,
} from 'antd';
import {
  ReloadOutlined, ThunderboltOutlined, ToolOutlined,
  CheckCircleOutlined, WarningOutlined, CloudSyncOutlined,
} from '@ant-design/icons';
import { workbenchApi } from '../services/api';

const { Title, Text } = Typography;

// ============ 类型 ============
interface Health {
  total_stocks: number;
  fresh_stocks: number;
  stale_stocks: number;
  fresh_ratio: number;
  as_of: string | null;
  oldest: string | null;
  total_bars: number;
  ready: boolean;
}

interface StrategyItem {
  key: string;
  name: string;
  type: string;
  description: string;
  min_score: number;
  top_n: number;
}

interface SignalItem {
  id: number;
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
}

interface LastRun {
  run_id: number;
  name: string;
  as_of_date: string;
  scanned: number;
  matched: number;
  created_at: string;
  top: SignalItem[];
  buy: SignalItem[];
  sell: SignalItem[];
}

interface WorkbenchData {
  health: Health;
  strategies: StrategyItem[];
  current_strategy: string;
  last_run: LastRun | null;
}

const SIGNAL_TAG: Record<string, { color: string; label: string }> = {
  STRONG_BUY: { color: 'red', label: '强烈买入' },
  BUY: { color: 'volcano', label: '买入' },
  HOLD: { color: 'gold', label: '持有' },
  SELL: { color: 'cyan', label: '卖出' },
  STRONG_SELL: { color: 'blue', label: '强烈卖出' },
  AVOID: { color: 'default', label: '回避' },
};

// ============ 主组件 ============
export default function Workbench() {
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try {
      const { data: res } = await workbenchApi.index();
      setData(res);
    } catch (err) {
      message.error('加载工作台失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, []);

  const onRun = async () => {
    try {
      const v = await form.validateFields();
      setRunning(true);
      const { data: res } = await workbenchApi.run({
        strategy: v.strategy,
        top_n: Number(v.top_n ?? 15),
        min_score: Number(v.min_score ?? 55),
        min_amount: Number(v.min_amount ?? 20_000_000),
        only_buy: Boolean(v.only_buy),
        fresh_days: Number(v.fresh_days ?? 7),
        scan_all_limit: Number(v.scan_all_limit ?? 800),
      });
      if (res.error) {
        message.error(`策略运行失败：${res.error}`);
      } else {
        message.success(`【${res.strategy?.name}】扫描 ${res.scanned} / 匹配 ${res.matched} / 入榜 ${res.saved}`);
        setRunModalOpen(false);
        fetch();
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '运行失败';
      message.error(detail);
    } finally {
      setRunning(false);
    }
  };

  const handlePrepare = async () => {
    setPreparing(true);
    try {
      const { data: res } = await workbenchApi.prepare('smart', 30);
      message.success(res.message || `同步完成：成功 ${res.success} / 失败 ${res.failed}`);
      fetch();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '同步失败';
      message.error(detail);
    } finally {
      setPreparing(false);
    }
  };

  // ============ 表格列 ============
  const signalColumns = [
    { title: '#', dataIndex: 'rank_no', width: 50 },
    { title: '代码', dataIndex: 'code', width: 110, render: (v: string) => <strong>{v}</strong> },
    { title: '名称', dataIndex: 'name', width: 110 },
    {
      title: '信号', dataIndex: 'signal', width: 100,
      render: (v: string) => {
        const c = SIGNAL_TAG[v] ?? { color: 'default', label: v };
        return <Tag color={c.color}>{c.label}</Tag>;
      },
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

  // ============ 渲染 ============
  return (
    <div style={{ padding: 20 }}>
      <Card loading={loading}>
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            <ToolOutlined /> 量化工作台
          </Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
            <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => {
              if (data?.current_strategy) {
                form.setFieldsValue({
                  strategy: data.current_strategy,
                  top_n: 15,
                  min_score: 55,
                  min_amount: 20_000_000,
                  only_buy: true,
                  fresh_days: 7,
                  scan_all_limit: 800,
                });
              }
              setRunModalOpen(true);
            }}>
              运行策略
            </Button>
            <Button icon={<CloudSyncOutlined />} onClick={handlePrepare} loading={preparing}>
              准备行情
            </Button>
          </Space>
        </Space>

        {/* 数据健康度 */}
        {data?.health && (
          <Card size="small" title={
            <Space>
              <Text strong>数据健康度</Text>
              {data.health.ready ? (
                <Badge status="success" text={<Text type="success">就绪</Text>} />
              ) : (
                <Badge status="warning" text={<Text type="warning">数据不足</Text>} />
              )}
            </Space>
          } style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={4}>
                <Statistic title="总股票数" value={data.health.total_stocks} />
              </Col>
              <Col span={4}>
                <Statistic
                  title="新鲜股票"
                  value={data.health.fresh_stocks}
                  valueStyle={{ color: '#3f8600' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="过期股票"
                  value={data.health.stale_stocks}
                  valueStyle={{ color: '#cf1322' }}
                  prefix={<WarningOutlined />}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="新鲜度"
                  value={(data.health.fresh_ratio * 100).toFixed(1)}
                  suffix="%"
                />
                <Progress percent={data.health.fresh_ratio * 100} size="small" showInfo={false} />
              </Col>
              <Col span={4}>
                <Statistic title="K线总数" value={data.health.total_bars} />
              </Col>
              <Col span={4}>
                <Statistic title="最新数据" value={data.health.as_of ?? '-'} />
              </Col>
            </Row>
          </Card>
        )}

        {!data?.health?.ready && (
          <Alert
            type="warning"
            showIcon
            message="真实行情不足（新鲜股票 < 10）。请先准备行情数据，或降低 min_score 重试。"
            style={{ marginBottom: 16 }}
          />
        )}

        {/* 最近扫描结果 */}
        {data?.last_run ? (
          <Card size="small" title={
            <Space>
              <Text strong>最近扫描</Text>
              <Tag color="blue">Run #{data.last_run.run_id}</Tag>
              <Text type="secondary">{data.last_run.name}</Text>
              <Text type="secondary">扫描 {data.last_run.scanned} / 匹配 {data.last_run.matched}</Text>
            </Space>
          }>
            <Tabs
              items={[
                {
                  key: 'buy',
                  label: <span>买入候选 <Badge count={data.last_run.buy.length} showZero style={{ backgroundColor: '#cf1322' }} /></span>,
                  children: (
                    <Table
                      rowKey={(r) => `${r.run_id}-${r.rank_no}`}
                      size="small"
                      dataSource={data.last_run.buy}
                      columns={signalColumns}
                      pagination={{ pageSize: 10 }}
                      locale={{ emptyText: <Empty description="无买入信号" /> }}
                    />
                  ),
                },
                {
                  key: 'sell',
                  label: <span>卖出候选 <Badge count={data.last_run.sell.length} showZero style={{ backgroundColor: '#3f8600' }} /></span>,
                  children: (
                    <Table
                      rowKey={(r) => `${r.run_id}-${r.rank_no}`}
                      size="small"
                      dataSource={data.last_run.sell}
                      columns={signalColumns}
                      pagination={{ pageSize: 10 }}
                      locale={{ emptyText: <Empty description="无卖出信号" /> }}
                    />
                  ),
                },
                {
                  key: 'top',
                  label: <span>Top 30 <Badge count={data.last_run.top.length} showZero /></span>,
                  children: (
                    <Table
                      rowKey={(r) => `${r.run_id}-${r.rank_no}`}
                      size="small"
                      dataSource={data.last_run.top}
                      columns={signalColumns}
                      pagination={{ pageSize: 15 }}
                    />
                  ),
                },
              ]}
            />
          </Card>
        ) : (
          <Card size="small">
            <Empty description="尚未扫描，请点击「运行策略」">
              <Button type="primary" onClick={() => setRunModalOpen(true)} icon={<ThunderboltOutlined />}>
                立即运行
              </Button>
            </Empty>
          </Card>
        )}

        {/* 策略目录 */}
        {data?.strategies && data.strategies.length > 0 && (
          <Card size="small" title={<Text strong>策略目录（{data.strategies.length}）</Text>} style={{ marginTop: 16 }}>
            <Row gutter={[8, 8]}>
              {data.strategies.map((s) => (
                <Col span={8} key={s.key}>
                  <Card size="small" hoverable>
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space>
                        <Tag color="blue">{s.type}</Tag>
                        <Text strong>{s.name}</Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>{s.description}</Text>
                      <Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>门槛 {s.min_score}分</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>Top {s.top_n}</Text>
                      </Space>
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        )}
      </Card>

      {/* 运行策略 Modal */}
      <Modal
        title="运行策略选股"
        open={runModalOpen}
        onCancel={() => setRunModalOpen(false)}
        onOk={onRun}
        confirmLoading={running}
        okText="开始扫描"
        width={520}
      >
        <Form form={form} layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
          <Form.Item label="选择策略" name="strategy">
            <Select
              options={(data?.strategies ?? []).map((s) => ({
                value: s.key, label: `${s.name}（${s.type}）`,
              }))}
            />
          </Form.Item>
          <Form.Item label="Top N" name="top_n">
            <InputNumber min={5} max={50} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="最低评分" name="min_score">
            <InputNumber min={0} max={100} step={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="最低成交额" name="min_amount">
            <InputNumber min={0} step={5_000_000} style={{ width: '100%' }} />
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
        </Form>
      </Modal>
    </div>
  );
}
