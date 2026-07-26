/** 系统设置
 *
 *   - 交易参数（11 个固定参数，用于回测/组合计算）
 *   - 用户管理 CRUD（仅管理员）
 *   - 修改密码（所有用户）
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Table,
  Modal, Form, Input, InputNumber, Select, message, Tabs,
} from 'antd';
import {
  ReloadOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  SettingOutlined, KeyOutlined, LockOutlined,
} from '@ant-design/icons';
import { settingsApi, authApi } from '../services/api';
import { userStorage } from '../services/api';
import type { TradingParamItem } from '../services/api';

const { Title, Text } = Typography;

// ============ 类型 ============

interface UserItem {
  id: number;
  username: string;
  realname: string;
  role: string;
  phone: string;
  status: number;
  created_at: string | null;
  updated_at: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  user: '普通用户',
};

const ROLE_COLOR: Record<string, string> = {
  admin: 'red',
  user: 'blue',
};

// ============ 主组件 ============

export default function Settings() {
  const [tab, setTab] = useState('profile');
  const userInfo = userStorage.get();
  const isAdmin = userInfo?.role === 'admin';

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small">
        <Title level={4} style={{ margin: 0 }}>
          <SettingOutlined /> 系统设置
        </Title>
        <Text type="secondary">交易参数 + 用户管理 + 密码修改</Text>
      </Card>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'profile', label: '修改密码', children: <PasswordTab /> },
          ...(isAdmin ? [
            { key: 'params', label: '交易参数', children: <ParamsTab /> },
            { key: 'users', label: '用户管理', children: <UsersTab /> },
          ] : []),
        ]}
      />
    </Space>
  );
}

// ============ Tab1: 修改密码 ============

function PasswordTab() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    try {
      const v = await form.validateFields();
      setLoading(true);
      await authApi.changePassword(v.old_password, v.new_password);
      message.success('密码已修改，下次登录请使用新密码');
      form.resetFields();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('修改失败：' + (e?.response?.data?.detail || e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card size="small" title={<Space><KeyOutlined /> 修改密码</Space>} style={{ maxWidth: 600 }}>
      <Form form={form} layout="vertical">
        <Form.Item name="old_password" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="原密码" />
        </Form.Item>
        <Form.Item
          name="new_password"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '密码至少 6 位' },
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="新密码（至少 6 位）" />
        </Form.Item>
        <Form.Item
          name="confirm_password"
          label="确认新密码"
          dependencies={['new_password']}
          rules={[
            { required: true, message: '请确认新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('new_password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="确认新密码" />
        </Form.Item>
        <Button type="primary" onClick={submit} loading={loading}>提交修改</Button>
      </Form>
    </Card>
  );
}

// ============ Tab2: 交易参数（11 个固定参数） ============

function ParamsTab() {
  const [params, setParams] = useState<TradingParamItem[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await settingsApi.tradingParams();
      const list = resp.data?.data || [];
      setParams(list);
      const vals: Record<string, string> = {};
      list.forEach((p) => { vals[p.key] = p.current; });
      setFormValues(vals);
    } catch (e: any) {
      message.error('加载交易参数失败：' + (e?.response?.data?.detail || e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      params.forEach((p) => {
        const v = formValues[p.key];
        if (v !== undefined && v !== p.current) {
          payload[p.key] = v;
        }
      });
      if (Object.keys(payload).length === 0) {
        message.info('没有需要保存的修改');
        return;
      }
      await settingsApi.updateTradingParams(payload);
      message.success(`已保存 ${Object.keys(payload).length} 项变更`);
      load();
    } catch (e: any) {
      message.error('保存失败：' + (e?.response?.data?.detail || e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    const vals: Record<string, string> = {};
    params.forEach((p) => { vals[p.key] = p.default; });
    setFormValues(vals);
    message.info('已重置为默认值（未保存，需点击"保存参数"）');
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small">
        <Row align="middle" justify="space-between">
          <Col>
            <Space>
              <Text strong>交易参数（{params.length}）</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                各类费率参数，用于回测/组合计算
              </Text>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
              <Button onClick={resetAll}>重置默认</Button>
              <Button type="primary" onClick={save} loading={saving}>保存参数</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card size="small" loading={loading}>
        <Form layout="vertical">
          <Row gutter={[24, 8]}>
            {params.map((p) => {
              const currentValue = formValues[p.key] ?? p.current;
              const isDefault = currentValue === p.default;
              return (
                <Col span={12} key={p.key}>
                  <Form.Item
                    label={
                      <Space size="small">
                        <Text strong>{p.label}</Text>
                        <Text code style={{ fontSize: 11 }}>{p.key}</Text>
                        {isDefault ? (
                          <Tag color="default" style={{ fontSize: 11 }}>默认</Tag>
                        ) : (
                          <Tag color="orange" style={{ fontSize: 11 }}>已修改</Tag>
                        )}
                      </Space>
                    }
                    extra={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {p.description} · 默认：<Text code>{p.default}</Text>
                      </Text>
                    }
                  >
                    {p.input_type === 'select' ? (
                      <Select
                        value={currentValue || undefined}
                        onChange={(v) => handleChange(p.key, v)}
                        options={(p.options || []).map((o) => ({ value: o, label: o }))}
                        style={{ width: '100%' }}
                      />
                    ) : (
                      <InputNumber
                        value={currentValue === '' ? undefined : Number(currentValue)}
                        onChange={(v) =>
                          handleChange(p.key, v === null || v === undefined ? '' : String(v))
                        }
                        style={{ width: '100%' }}
                        addonAfter={p.unit}
                      />
                    )}
                  </Form.Item>
                </Col>
              );
            })}
          </Row>
        </Form>
      </Card>
    </Space>
  );
}

// ============ Tab3: 用户管理 ============

function UsersTab() {
  const [list, setList] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [form] = Form.useForm();
  const currentUser = userStorage.get();

  const load = async () => {
    setLoading(true);
    try {
      const resp = await settingsApi.users();
      setList(resp.data?.data || []);
    } catch (e: any) {
      message.error('加载用户失败：' + (e?.response?.data?.detail || e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: 'user', status: 1 });
    setModalOpen(true);
  };

  const openEdit = (r: UserItem) => {
    setEditing(r);
    form.setFieldsValue({
      username: r.username,
      realname: r.realname,
      role: r.role,
      phone: r.phone,
      status: r.status,
      password: '',
    });
    setModalOpen(true);
  };

  const submit = async () => {
    try {
      const v = await form.validateFields();
      if (editing) {
        const payload: Record<string, unknown> = {
          realname: v.realname,
          role: v.role,
          phone: v.phone,
          status: v.status,
        };
        if (v.password) payload.password = v.password;
        await settingsApi.updateUser(editing.id, payload);
        message.success('更新成功');
      } else {
        await settingsApi.createUser(v);
        message.success('创建成功');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败：' + (e?.response?.data?.detail || e?.message || e));
    }
  };

  const remove = async (r: UserItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除用户 "${r.username}"？`,
      okType: 'danger',
      onOk: async () => {
        try {
          await settingsApi.removeUser(r.id);
          message.success('已删除');
          load();
        } catch (e: any) {
          message.error('删除失败：' + (e?.response?.data?.detail || e?.message || e));
        }
      },
    });
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '用户名', dataIndex: 'username', width: 140,
      render: (v: string, r: UserItem) => (
        <Space>
          <Text strong>{v}</Text>
          {r.id === currentUser?.id && <Tag color="blue">当前</Tag>}
        </Space>
      ),
    },
    { title: '姓名', dataIndex: 'realname', width: 120 },
    {
      title: '角色', dataIndex: 'role', width: 100,
      render: (v: string) => <Tag color={ROLE_COLOR[v] || 'default'}>{ROLE_LABEL[v] || v}</Tag>,
    },
    { title: '电话', dataIndex: 'phone', width: 130 },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: number) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '禁用'}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 160 },
    {
      title: '操作', width: 130, fixed: 'right' as const,
      render: (_: unknown, r: UserItem) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={r.id === currentUser?.id || (r.role === 'admin' && r.id === 1)}
            onClick={() => remove(r)}
          />
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small">
        <Row align="middle" justify="space-between">
          <Col>
            <Text strong>用户列表（{list.length}）</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增用户</Button>
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
          pagination={{ pageSize: 20 }}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Modal
        title={editing ? `编辑用户：${editing.username}` : '新增用户'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={submit}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input disabled={!!editing} placeholder="登录用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label={editing ? '重置密码（留空不改）' : '密码'}
            rules={editing ? [] : [{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少 6 位' }]}
          >
            <Input.Password placeholder={editing ? '留空不修改密码' : '至少 6 位'} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="realname" label="姓名">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="电话">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="role" label="角色">
                <Select options={[
                  { value: 'user', label: '普通用户' },
                  { value: 'admin', label: '管理员' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select options={[
                  { value: 1, label: '启用' },
                  { value: 0, label: '禁用' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Space>
  );
}
