/** 股票池 — 列表 + 点击查看 K 线图（lightweight-charts） */
import { useEffect, useState } from 'react';
import { Card, Table, Input, Space, Tag, Select, Modal, Spin, Empty, message } from 'antd';
import { stocksApi, realtimeApi } from '../services/api';
import KlineChart, { type KlinePoint } from '../components/KlineChart';

interface StockRow {
  id: number;
  code: string;
  name: string;
  market: string;
  board: string;
  industry: string;
  is_st: number;
  status: number;
  list_date: string | null;
}

export default function Stocks() {
  const [data, setData] = useState<StockRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [keyword, setKeyword] = useState('');
  const [market, setMarket] = useState<string | undefined>(undefined);

  // K 线 Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStock, setModalStock] = useState<StockRow | null>(null);
  const [modalKlines, setModalKlines] = useState<KlinePoint[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const { data: res } = await stocksApi.list({
        page, page_size: pageSize, keyword: keyword || undefined, market,
      });
      setData(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [page, pageSize, market]);

  const showKline = async (row: StockRow) => {
    setModalStock(row);
    setModalOpen(true);
    setModalKlines([]);
    setModalLoading(true);
    try {
      const { data: res } = await realtimeApi.stock(row.code);
      setModalKlines(res.klines || []);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = status === 404
        ? '该股票暂无 K 线数据（请先在「行情同步」页拉取）'
        : (err?.response?.data?.detail || '加载失败');
      message.error(msg);
    } finally {
      setModalLoading(false);
    }
  };

  const columns = [
    { title: '代码', dataIndex: 'code', width: 120, render: (v: string) => <strong>{v}</strong> },
    { title: '名称', dataIndex: 'name', width: 120 },
    {
      title: '市场', dataIndex: 'market', width: 80,
      render: (v: string) => <Tag color={v === 'SH' ? 'red' : v === 'SZ' ? 'blue' : 'orange'}>{v}</Tag>,
    },
    { title: '板块', dataIndex: 'board', width: 100 },
    { title: '行业', dataIndex: 'industry' },
    {
      title: 'ST', dataIndex: 'is_st', width: 60,
      render: (v: number) => v ? <Tag color="red">ST</Tag> : '-',
    },
    { title: '上市日期', dataIndex: 'list_date', width: 120 },
    {
      title: '操作', width: 100,
      render: (_: unknown, row: StockRow) => (
        <a onClick={() => showKline(row)}>查看 K 线</a>
      ),
    },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Card title={`股票池（共 ${total} 只）`}>
        <Space style={{ marginBottom: 12 }}>
          <Input.Search
            placeholder="代码或名称关键字"
            allowClear
            style={{ width: 240 }}
            onSearch={(v) => { setKeyword(v); setPage(1); fetch(); }}
          />
          <Select
            placeholder="市场"
            allowClear
            style={{ width: 120 }}
            onChange={(v) => { setMarket(v); setPage(1); }}
            options={[
              { value: 'SH', label: '沪市 SH' },
              { value: 'SZ', label: '深市 SZ' },
              { value: 'BJ', label: '北交所 BJ' },
            ]}
          />
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          columns={columns}
          size="small"
          pagination={{
            current: page, pageSize, total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
        />
      </Card>

      <Modal
        title={modalStock ? `${modalStock.code} ${modalStock.name} — K 线图` : 'K 线图'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={960}
      >
        {modalLoading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <Spin tip="加载 K 线中..." />
          </div>
        ) : modalKlines.length > 0 ? (
          <KlineChart klines={modalKlines} height={500} />
        ) : (
          <Empty description="暂无 K 线数据" />
        )}
      </Modal>
    </div>
  );
}
