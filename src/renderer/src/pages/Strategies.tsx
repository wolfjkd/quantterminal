/** 策略管理
 *
*   - 内置策略目录（8种，桥接 quantengine.BacktestEngine.STRATEGY_CATALOG）
 *   - 自定义策略 CRUD + 参数 JSON 配置
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Statistic, Table, Empty,
  Modal, Form, Input, Select, message, Alert,
  Tabs, Tooltip, Divider, Spin,
} from 'antd';
import {
  ReloadOutlined, PlusOutlined, ThunderboltOutlined,
  BulbOutlined, EditOutlined, DeleteOutlined, CodeOutlined,
} from '@ant-design/icons';
import { strategyApi } from '../services/api';

const { Title, Text } = Typography;

// ============ 类型 ============

interface CatalogItem {
  key: string;
  name: string;
  description: string;
  default_params: Record<string, number | string>;
}

interface CustomStrategy {
  id: number;
  name: string;
  strategy_type: string;
  params_json: string;
  status: number;
  remark: string;
  created_at: string | null;
  updated_at: string | null;
}

const TYPE_COLOR: Record<string, string> = {
  dual_ma: 'blue',
  macd: 'cyan',
  kdj: 'geekblue',
  boll: 'purple',
  rsi: 'orange',
  momentum: 'gold',
  mean_reversion: 'green',
  composite: 'magenta',
  custom: 'default',
};

// ============ 主组件 ============

export default function Strategies() {
  const [tab, setTab] = useState('catalog');

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small">
        <Row align="middle" justify="space-between">
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              <BulbOutlined /> 策略管理中心
            </Title>
            <Text type="secondary">
              桥接 quantengine.BacktestEngine · 8 种内置策略
            </Text>
          </Col>
        </Row>
      </Card>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'catalog', label: '内置策略目录', children: <CatalogTab /> },
          { key: 'custom', label: '自定义策略', children: <CustomTab /> },
        ]}
      />
    </Space>
  );
}

// ============ Tab1: 内置策略目录 ============

function CatalogTab() {
  const [data, setData] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await strategyApi.catalog();
      setData(resp.data?.data || []);
    } catch (e: any) {
      message.error('加载策略目录失败：' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Spin tip="加载策略目录..." />;
  if (!data.length) return <Empty />;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Row gutter={16}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="内置策略数" value={data.length} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
        <Col span={18}>
          <Card size="small">
            <Space wrap>
              {data.map((s) => (
                <Tag key={s.key} color={TYPE_COLOR[s.key] || 'default'}>
                  {s.name} ({s.key})
                </Tag>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        {data.map((s) => (
          <Col key={s.key} xs={24} sm={12} md={8} lg={6}>
            <Card
              size="small"
              hoverable
              title={
                <Space>
                  <Tag color={TYPE_COLOR[s.key] || 'default'}>{s.key}</Tag>
                  <Text strong>{s.name}</Text>
                </Space>
              }
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{s.description}</Text>
                <Divider style={{ margin: '4px 0' }} />
                <Text strong style={{ fontSize: 12 }}>
                  <CodeOutlined /> 默认参数
                </Text>
                {Object.keys(s.default_params || {}).length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 11 }}>无参数</Text>
                ) : (
                  Object.entries(s.default_params).map(([k, v]) => (
                    <Tag key={k} style={{ fontSize: 11 }}>
                      {k}: {String(v)}
                    </Tag>
                  ))
                )}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
}

// ============ Tab2: 自定义策略 CRUD ============

function CustomTab() {
  const [list, setList] = useState<CustomStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomStrategy | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const resp = await strategyApi.list();
      setList(resp.data?.data || []);
    } catch (e: any) {
      message.error('加载策略列表失败：' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      strategy_type: 'custom', params_json: '{}',
      status: 1, remark: '',
    });
    setModalOpen(true);
  };

  const openEdit = (r: CustomStrategy) => {
    setEditing(r);
    form.setFieldsValue(r);
    setModalOpen(true);
  };

  const submit = async () => {
    try {
      const v = await form.validateFields();
      if (editing) {
        await strategyApi.update(editing.id, v);
        message.success('更新成功');
      } else {
        await strategyApi.create(v);
        message.success('创建成功');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败：' + (e?.message || e));
    }
  };

  const remove = async (r: CustomStrategy) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除策略 "${r.name}"？`,
      okType: 'danger',
      onOk: async () => {
        try {
          await strategyApi.remove(r.id);
          message.success('已删除');
          load();
        } catch (e: any) {
          message.error('删除失败：' + (e?.message || e));
        }
      },
    });
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '名称', dataIndex: 'name', width: 180,
      render: (v: string, r: CustomStrategy) => (
        <Space>
          <Text strong>{v}</Text>
          <Tag color={TYPE_COLOR[r.strategy_type] || 'default'}>{r.strategy_type}</Tag>
        </Space>
      ),
    },
    {
      title: '参数 JSON', dataIndex: 'params_json', ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <Text code style={{ fontSize: 11 }}>{v}</Text>
        </Tooltip>
      ),
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: number) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag>,
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true, width: 180 },
    { title: '创建时间', dataIndex: 'created_at', width: 160 },
    {
      title: '操作', width: 130, fixed: 'right' as const,
      render: (_: unknown, r: CustomStrategy) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(r)} />
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small">
        <Row align="middle" justify="space-between">
          <Col>
            <Text strong>自定义策略库（{list.length}）</Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              可保存常用策略参数模板，便于在回测中心调用
            </Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增策略</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card size="small">
        <Table
          dataSource={list}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 20, size: 'default' }}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Modal
        title={editing ? `编辑策略：${editing.name}` : '新增自定义策略'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={submit}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="策略名称" rules={[{ required: true, message: '请输入策略名称' }]}>
            <Input placeholder="如 我的双均线策略" />
          </Form.Item>
          <Form.Item name="strategy_type" label="策略类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'custom', label: '自定义' },
                { value: 'dual_ma', label: '双均线金叉' },
                { value: 'macd', label: 'MACD 策略' },
                { value: 'kdj', label: 'KDJ 策略' },
                { value: 'boll', label: '布林带策略' },
                { value: 'rsi', label: 'RSI 策略' },
                { value: 'momentum', label: '动量策略' },
                { value: 'mean_reversion', label: '均值回归' },
                { value: 'composite', label: '综合策略' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="params_json"
            label="参数 JSON"
            tooltip='如 {"fast_period": 5, "slow_period": 20}'
          >
            <Input.TextArea rows={4} placeholder='{"fast_period": 5, "slow_period": 20}' />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="status" label="状态">
                <Select options={[
                  { value: 1, label: '启用' },
                  { value: 0, label: '停用' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="remark" label="备注">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Alert
            type="info"
            showIcon
            message="参数 JSON 说明"
            description={
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                <li>dual_ma: fast_period / slow_period</li>
                <li>rsi: oversold / overbought</li>
                <li>momentum: period</li>
                <li>mean_reversion: period / threshold</li>
                <li>其他策略默认参数即可</li>
              </ul>
            }
          />
        </Form>
      </Modal>
    </Space>
  );
}
