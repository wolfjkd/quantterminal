/** 审计日志
 *
*   - 操作日志查询（按 action/user_id/关键词/时间范围）
 *   - 按 action 分组统计（最近 N 天）
 *   - 导出 CSV
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Statistic, Table, Empty,
  Input, InputNumber, Select, DatePicker, message,
  Tabs, Badge, Tooltip, Divider, Spin, Progress,
} from 'antd';
import {
  ReloadOutlined, DownloadOutlined, SearchOutlined, AuditOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { auditApi } from '../services/api';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// ============ 类型 ============

interface AuditItem {
  id: number;
  user_id: number;
  action: string;
  detail: string;
  ip: string;
  created_at: string | null;
}

interface StatItem {
  action: string;
  count: number;
  percent: number;
}

// ============ 常量 ============

const ACTION_LABEL: Record<string, string> = {
  login: '登录',
  logout: '注销',
  change_password: '修改密码',
  setting_create: '新增参数',
  setting_update: '修改参数',
  setting_delete: '删除参数',
  user_create: '新增用户',
  user_update: '修改用户',
  user_delete: '删除用户',
};

const ACTION_COLOR: Record<string, string> = {
  login: 'blue',
  logout: 'default',
  change_password: 'orange',
  setting_create: 'green',
  setting_update: 'gold',
  setting_delete: 'red',
  user_create: 'green',
  user_update: 'gold',
  user_delete: 'red',
};

// ============ 主组件 ============

export default function Audit() {
  const [tab, setTab] = useState('logs');

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small">
        <Title level={4} style={{ margin: 0 }}>
          <AuditOutlined /> 审计日志
        </Title>
        <Text type="secondary">操作日志 + 统计 + 导出</Text>
      </Card>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'logs', label: '操作日志', children: <LogsTab /> },
          { key: 'stats', label: '统计分析', children: <StatsTab /> },
        ]}
      />
    </Space>
  );
}

// ============ Tab1: 操作日志 ============

function LogsTab() {
  const [list, setList] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [action, setAction] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState<string>('');
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, page_size: pageSize };
      if (action) params.action = action;
      if (userId) params.user_id = userId;
      if (keyword) params.keyword = keyword;
      if (range && range.length === 2) {
        params.start_date = range[0].format('YYYY-MM-DD');
        params.end_date = range[1].format('YYYY-MM-DD');
      }
      const resp = await auditApi.list(params);
      setList(resp.data?.data || []);
      setTotal(resp.data?.total || 0);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail?.includes('admin') || e?.response?.status === 403) {
        message.error('仅管理员可查看审计日志');
      } else {
        message.error('加载失败：' + (detail || e?.message || e));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, pageSize]);

  const onSearch = () => {
    setPage(1);
    load();
  };

  const onReset = () => {
    setAction(undefined);
    setUserId(undefined);
    setKeyword('');
    setRange(null);
    setPage(1);
    setTimeout(load, 0);
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, unknown> = {};
      if (action) params.action = action;
      if (userId) params.user_id = userId;
      if (keyword) params.keyword = keyword;
      if (range && range.length === 2) {
        params.start_date = range[0].format('YYYY-MM-DD');
        params.end_date = range[1].format('YYYY-MM-DD');
      }
      const resp = await auditApi.export(params);
      const blob = new Blob([resp.data as BlobPart], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_log_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success('已导出');
    } catch (e: any) {
      message.error('导出失败：' + (e?.message || e));
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    {
      title: '时间', dataIndex: 'created_at', width: 160,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '操作', dataIndex: 'action', width: 130,
      render: (v: string) => <Tag color={ACTION_COLOR[v] || 'default'}>{ACTION_LABEL[v] || v}</Tag>,
    },
    {
      title: '用户ID', dataIndex: 'user_id', width: 80,
    },
    {
      title: '详情', dataIndex: 'detail', ellipsis: true,
      render: (v: string) => v ? <Tooltip title={v}><Text>{v}</Text></Tooltip> : <Text type="secondary">-</Text>,
    },
    { title: 'IP', dataIndex: 'ip', width: 130 },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small" title="筛选条件">
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Text>操作类型</Text>
            <Select
              allowClear
              style={{ width: '100%' }}
              value={action}
              onChange={setAction}
              placeholder="全部"
              options={Object.entries(ACTION_LABEL).map(([k, v]) => ({ value: k, label: v }))}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Text>用户ID</Text>
            <InputNumber
              style={{ width: '100%' }}
              value={userId}
              onChange={(v) => setUserId(v || undefined)}
              placeholder="留空查全部"
              min={1}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Text>关键词</Text>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索详情"
              onPressEnter={onSearch}
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text>时间范围</Text>
            <RangePicker
              style={{ width: '100%' }}
              value={range as any}
              onChange={(v) => setRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            />
          </Col>
        </Row>
        <Divider style={{ margin: '12px 0' }} />
        <Space>
          <Button type="primary" icon={<SearchOutlined />} onClick={onSearch} loading={loading}>
            查询
          </Button>
          <Button onClick={onReset}>重置</Button>
          <Button icon={<DownloadOutlined />} onClick={onExport} loading={exporting}>
            导出 CSV
          </Button>
          <Text type="secondary">共 {total} 条</Text>
        </Space>
      </Card>

      <Card size="small">
        <Table
          dataSource={list}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
          scroll={{ x: 900 }}
        />
      </Card>
    </Space>
  );
}

// ============ Tab2: 统计分析 ============

function StatsTab() {
  const [data, setData] = useState<{ data: StatItem[]; total: number; days: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await auditApi.stats(days);
      setData(resp.data);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail?.includes('admin') || e?.response?.status === 403) {
        message.error('仅管理员可查看审计日志');
      } else {
        message.error('加载统计失败：' + (detail || e?.message || e));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [days]);

  if (loading) return <Spin tip="加载统计..." />;
  if (!data) return <Empty />;

  const columns = [
    {
      title: '排名', width: 70,
      render: (_: unknown, _r: StatItem, idx: number) => <Badge count={idx + 1} style={{ backgroundColor: idx < 3 ? '#52c41a' : '#1677ff' }} />,
    },
    {
      title: '操作类型', dataIndex: 'action', width: 150,
      render: (v: string) => <Tag color={ACTION_COLOR[v] || 'default'}>{ACTION_LABEL[v] || v}</Tag>,
    },
    { title: '操作代码', dataIndex: 'action', width: 150, render: (v: string) => <Text code>{v}</Text> },
    {
      title: '次数', dataIndex: 'count', width: 100,
      render: (v: number) => <Text strong style={{ color: '#1677ff' }}>{v}</Text>,
    },
    {
      title: '占比', dataIndex: 'percent', width: 200,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small">
        <Row align="middle" justify="space-between">
          <Col>
            <Space>
              <Text>统计周期：</Text>
              <Select
                value={days}
                onChange={setDays}
                style={{ width: 120 }}
                options={[
                  { value: 7, label: '最近 7 天' },
                  { value: 30, label: '最近 30 天' },
                  { value: 90, label: '最近 90 天' },
                  { value: 365, label: '最近 1 年' },
                ]}
              />
            </Space>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title={`最近 ${data.days} 天总操作`}
              value={data.total}
              prefix={<BarChartOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="操作类型数" value={data.data.length} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="Top 5 操作类型">
            <Space wrap>
              {data.data.slice(0, 5).map((s) => (
                <Tag key={s.action} color={ACTION_COLOR[s.action] || 'default'}>
                  {ACTION_LABEL[s.action] || s.action}: {s.count} ({s.percent}%)
                </Tag>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card size="small" title="操作类型分布">
        <Table
          dataSource={data.data}
          columns={columns}
          rowKey="action"
          size="small"
          pagination={false}
        />
      </Card>
    </Space>
  );
}
