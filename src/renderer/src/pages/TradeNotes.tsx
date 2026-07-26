/** 交易笔记
 *
 * 后端已有完整实现：GET /trade-notes, POST /trade-notes, DELETE /trade-notes/{id}
 */
import { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Form, Input,
  message, Popconfirm, Empty,
} from 'antd';
import {
  ReloadOutlined, PlusOutlined, DeleteOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { tradeNoteApi } from '../services/api';

const { Title, Text, Paragraph } = Typography;

interface NoteItem {
  id: number;
  user_id: number;
  code: string;
  content: string;
  created_at: string;
}

export default function TradeNotes() {
  const [data, setData] = useState<NoteItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterCode, setFilterCode] = useState('');
  const [form] = Form.useForm();

  const fetch = async (p = page) => {
    setLoading(true);
    try {
      const { data: res } = await tradeNoteApi.list(filterCode || undefined, p, 20);
      setData(res.data || []);
      setTotal(res.total || 0);
      setPage(p);
    } catch (err) {
      message.error('加载交易笔记失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch(1);
  }, [filterCode]);

  const onCreate = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      await tradeNoteApi.create(v.code || '', v.content);
      message.success('笔记已保存');
      setCreateOpen(false);
      form.resetFields();
      fetch(1);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '保存失败';
      message.error(detail);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: number) => {
    try {
      await tradeNoteApi.remove(id);
      message.success('已删除');
      fetch();
    } catch (err) {
      message.error('删除失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '代码', dataIndex: 'code', width: 100,
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: '内容', dataIndex: 'content',
      render: (v: string) => (
        <Paragraph
          ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
          style={{ margin: 0, whiteSpace: 'pre-wrap' }}
        >
          {v}
        </Paragraph>
      ),
    },
    { title: '创建时间', dataIndex: 'created_at', width: 160 },
    {
      title: '操作', width: 80,
      render: (_: unknown, row: NoteItem) => (
        <Popconfirm
          title="确认删除此笔记？"
          onConfirm={() => onDelete(row.id)}
          okText="删除"
          cancelText="取消"
        >
          <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Card loading={loading}>
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            <FileTextOutlined /> 交易笔记
          </Title>
          <Space>
            <Input.Search
              placeholder="按代码筛选，如 002178"
              allowClear
              style={{ width: 200 }}
              onSearch={(v) => setFilterCode(v)}
            />
            <Button icon={<ReloadOutlined />} onClick={() => fetch()} loading={loading}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建笔记</Button>
          </Space>
        </Space>

        <Table
          rowKey="id"
          size="small"
          dataSource={data}
          columns={columns}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            onChange: (p) => fetch(p),
            showTotal: (t) => `共 ${t} 条`,
          }}
          locale={{ emptyText: <Empty description="暂无交易笔记" /> }}
        />
      </Card>

      <Modal
        title="新建交易笔记"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={onCreate}
        confirmLoading={saving}
        okText="保存"
      >
        <Form form={form} layout="vertical">
          <Form.Item label="股票代码（可选）" name="code">
            <Input placeholder="如 002178.SZ，留空表示通用笔记" />
          </Form.Item>
          <Form.Item label="笔记内容" name="content" rules={[{ required: true, message: '请输入笔记内容' }]}>
            <Input.TextArea rows={6} placeholder="记录交易思路、复盘要点、操作心得..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
