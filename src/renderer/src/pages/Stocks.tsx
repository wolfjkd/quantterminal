/** 股票池 */
import { useEffect, useState } from 'react';
import { Card, Table, Input, Space, Tag, Select } from 'antd';
import { stocksApi } from '../services/api';

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
    </div>
  );
}
