/** 自选股 */
import { useEffect, useState } from 'react';
import { Card, Table, Tag } from 'antd';
import { watchlistApi } from '../services/api';

interface WatchlistRow {
  id: number;
  name: string;
  user_id: number;
  remark: string;
  items_count: number;
  created_at: string;
}

export default function Watchlists() {
  const [data, setData] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const { data: res } = await watchlistApi.list();
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '名称', dataIndex: 'name', render: (v: string) => <strong>{v}</strong> },
    { title: '备注', dataIndex: 'remark' },
    {
      title: '成分股数', dataIndex: 'items_count', width: 100,
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 180 },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Card title="自选池（双核心 watchlists）">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          columns={columns}
          size="small"
          pagination={false}
        />
      </Card>
    </div>
  );
}
