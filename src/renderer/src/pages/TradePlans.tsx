/** 交易计划
 *
 * 后端已有完整实现：GET /trade-plans, POST /trade-plans, POST /trade-plans/{id}/close
 */
import { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Form, Input, InputNumber,
  message, Popconfirm,
} from 'antd';
import {
  ReloadOutlined, PlusOutlined, CloseCircleOutlined, AimOutlined,
} from '@ant-design/icons';
import { tradePlanApi, portfolioApi } from '../services/api';

const { Title, Text } = Typography;

interface PlanItem {
  id: number;
  portfolio_id: number;
  stock_id: number;
  code: string;
  name: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  qty: number;
  position_pct: number;
  status: string;
  source: string;
  close_reason: string | null;
  created_at: string;
  closed_at: string | null;
}

interface PortfolioItem {
  id: number;
  name: string;
}

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  active: { color: 'green', label: '进行中' },
  closed: { color: 'default', label: '已关闭' },
  pending: { color: 'gold', label: '待执行' },
};

export default function TradePlans() {
  const [data, setData] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [portfolios, setPortfolios] = useState<PortfolioItem[]>([]);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try {
      const { data: res } = await tradePlanApi.list();
      setData(res.data || []);
    } catch (err) {
      message.error('加载交易计划失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchPortfolios = async () => {
    try {
      const { data: res } = await portfolioApi.list();
      setPortfolios(res.data || []);
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    fetch();
    fetchPortfolios();
  }, []);

  const onCreate = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      await tradePlanApi.create({
        portfolio_id: Number(v.portfolio_id),
        stock_id: Number(v.stock_id),
        code: v.code,
        name: v.name || '',
        entry_price: Number(v.entry_price),
        stop_loss: Number(v.stop_loss),
        take_profit: Number(v.take_profit),
        qty: Number(v.qty || 0),
        position_pct: Number(v.position_pct || 0),
        source: 'desk',
      });
      message.success('交易计划已创建');
      setCreateOpen(false);
      form.resetFields();
      fetch();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '创建失败';
      message.error(detail);
    } finally {
      setSaving(false);
    }
  };

  const onClose = async (id: number, reason = 'manual') => {
    try {
      await tradePlanApi.close(id, reason);
      message.success('交易计划已关闭');
      fetch();
    } catch (err) {
      message.error('关闭失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '代码', dataIndex: 'code', width: 100, render: (v: string) => <strong>{v}</strong> },
    { title: '名称', dataIndex: 'name', width: 100 },
    { title: '组合', dataIndex: 'portfolio_id', width: 80 },
    {
      title: '入场价', dataIndex: 'entry_price', width: 90,
      render: (v: number) => v?.toFixed(2),
    },
    {
      title: '止损', dataIndex: 'stop_loss', width: 90,
      render: (v: number) => <Text type="danger">{v?.toFixed(2)}</Text>,
    },
    {
      title: '止盈', dataIndex: 'take_profit', width: 90,
      render: (v: number) => <Text type="success">{v?.toFixed(2)}</Text>,
    },
    {
      title: '数量', dataIndex: 'qty', width: 80,
      render: (v: number) => v || '-',
    },
    {
      title: '仓位', dataIndex: 'position_pct', width: 80,
      render: (v: number) => v != null && v > 0 ? `${(v * 100).toFixed(1)}%` : '-',
    },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (v: string) => {
        const c = STATUS_TAG[v] ?? { color: 'default', label: v };
        return <Tag color={c.color}>{c.label}</Tag>;
      },
    },
    { title: '来源', dataIndex: 'source', width: 80 },
    { title: '创建时间', dataIndex: 'created_at', width: 160 },
    {
      title: '操作', width: 100,
      render: (_: unknown, row: PlanItem) =>
        row.status === 'active' ? (
          <Popconfirm
            title="确认关闭此交易计划？"
            onConfirm={() => onClose(row.id, 'manual')}
            okText="确认"
            cancelText="取消"
          >
            <Button size="small" danger icon={<CloseCircleOutlined />}>关闭</Button>
          </Popconfirm>
        ) : <Text type="secondary">{row.close_reason ?? '-'}</Text>,
    },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Card loading={loading}>
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            <AimOutlined /> 交易计划管理
          </Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建计划</Button>
          </Space>
        </Space>

        <Table
          rowKey="id"
          size="small"
          dataSource={data}
          columns={columns}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title="新建交易计划"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={onCreate}
        confirmLoading={saving}
        okText="保存"
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="所属组合" name="portfolio_id" rules={[{ required: true, message: '请选择组合' }]}>
            <select className="ant-input" style={{ height: 32 }}>
              <option value="">请选择组合</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Form.Item>
          <Form.Item label="股票 ID" name="stock_id" rules={[{ required: true, message: '请输入股票 ID' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="股票代码" name="code" rules={[{ required: true, message: '请输入股票代码' }]}>
            <Input placeholder="如 002178.SZ" />
          </Form.Item>
          <Form.Item label="股票名称" name="name">
            <Input placeholder="如 延华智能" />
          </Form.Item>
          <Form.Item label="入场价" name="entry_price" rules={[{ required: true, message: '请输入入场价' }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="止损价" name="stop_loss" rules={[{ required: true, message: '请输入止损价' }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="止盈价" name="take_profit" rules={[{ required: true, message: '请输入止盈价' }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="数量" name="qty">
            <InputNumber min={0} step={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="仓位占比" name="position_pct" tooltip="0-1 之间，如 0.3 表示 30%">
            <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
