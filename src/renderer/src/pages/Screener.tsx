/** 条件选股
 *
*   - 5 类 30+ 条件（基本面/技术面/资金面/风险面/标记类）
 *   - 多条件组合 + 板块过滤 + TopN
 *   - 桥接 quantengine.Screener
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Statistic, Table, Empty,
  InputNumber, Select, message, Alert, Tabs, Badge, Divider, Spin, Switch,
} from 'antd';
import {
  ReloadOutlined, ThunderboltOutlined, FilterOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { screenerApi } from '../services/api';

const { Title, Text } = Typography;

// ============ 类型 ============

interface ConditionConfig {
  name: string;
  category: string;
  description: string;
  params: Record<string, number | string>;
}

interface ConditionsResp {
  available: boolean;
  error?: string;
  conditions: Record<string, ConditionConfig>;
  categories: Record<string, string[]>;
}

interface ScreenResult {
  rank: number;
  code: string;
  name: string;
  close: number;
  volume: number;
  matched_conditions: string[];
}

const CATEGORY_LABEL: Record<string, string> = {
  fundamental: '基本面',
  technical: '技术面',
  money: '资金面',
  risk: '风险面',
  tag: '标记类',
};

const CATEGORY_COLOR: Record<string, string> = {
  fundamental: 'blue',
  technical: 'orange',
  money: 'gold',
  risk: 'red',
  tag: 'purple',
};

// ============ 主组件 ============

export default function Screener() {
  const [data, setData] = useState<ConditionsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [params, setParams] = useState<Record<string, Record<string, number | string>>>({});
  const [limit, setLimit] = useState(1000);
  const [topN, setTopN] = useState(100);
  const [board, setBoard] = useState<string | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ data: ScreenResult[]; count: number; total_matched: number; total_scanned: number } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await screenerApi.conditions();
      setData(resp.data);
    } catch (e: any) {
      message.error('加载条件清单失败：' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleCondition = (code: string, checked: boolean) => {
    setSelected({ ...selected, [code]: checked });
  };

  const setParam = (code: string, key: string, value: number | string) => {
    setParams({ ...params, [code]: { ...(params[code] || {}), [key]: value } });
  };

  const runScreen = async () => {
    const selectedCodes = Object.keys(selected).filter((c) => selected[c]);
    if (selectedCodes.length === 0) {
      message.warning('请至少选择一个条件');
      return;
    }
    const conditions: Record<string, Record<string, unknown>> = {};
    selectedCodes.forEach((code) => {
      conditions[code] = (params[code] || {}) as Record<string, unknown>;
    });

    setRunning(true);
    try {
      const resp = await screenerApi.screen({
        conditions,
        limit,
        board,
        top_n: topN,
      });
      if (resp.data?.error) {
        message.error(resp.data.error);
      } else {
        setResult(resp.data);
        message.success(`筛选完成，命中 ${resp.data.total_matched} / 扫描 ${resp.data.total_scanned}，返回 Top${resp.data.count}`);
      }
    } catch (e: any) {
      message.error('筛选失败：' + (e?.message || e));
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <Spin tip="加载条件清单..." />;
  if (!data) return <Empty />;
  if (!data.available) {
    return <Alert type="error" showIcon message="quantengine 引擎不可用" description={data.error} />;
  }

  const conditions = data.conditions || {};
  const categories = data.categories || {};
  const totalConditions = Object.keys(conditions).length;
  const selectedCount = Object.values(selected).filter(Boolean).length;

  const columns = [
    { title: '排名', dataIndex: 'rank', width: 70, render: (v: number) => <Badge count={v} style={{ backgroundColor: '#1677ff' }} /> },
    { title: '代码', dataIndex: 'code', width: 90 },
    { title: '名称', dataIndex: 'name', width: 120 },
    { title: '最新价', dataIndex: 'close', width: 90, render: (v: number) => v?.toFixed(2) },
    {
      title: '成交量', dataIndex: 'volume', width: 130,
      render: (v: number) => {
        if (v >= 1e8) return (v / 1e8).toFixed(2) + ' 亿';
        if (v >= 1e4) return (v / 1e4).toFixed(0) + ' 万';
        return v;
      },
    },
    {
      title: '命中条件', dataIndex: 'matched_conditions',
      render: (conds: string[]) => (
        <Space wrap size={4}>
          {conds.map((c) => {
            const cfg = conditions[c];
            return (
              <Tag key={c} color={CATEGORY_COLOR[cfg?.category] || 'default'} style={{ fontSize: 11 }}>
                {cfg?.name || c}
              </Tag>
            );
          })}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small">
        <Row align="middle" justify="space-between">
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              <FilterOutlined /> 条件选股器
            </Title>
            <Text type="secondary">
              桥接 quantengine.Screener · {totalConditions} 个条件
            </Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={runScreen}
                loading={running}
              >
                执行筛选 ({selectedCount})
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card size="small" title="筛选配置">
        <Row gutter={16}>
          <Col span={6}>
            <Text>扫描股票数（按成交额降序）</Text>
            <InputNumber min={100} max={5000} step={100} value={limit} onChange={(v) => setLimit(v || 1000)} style={{ width: '100%' }} />
          </Col>
          <Col span={6}>
            <Text>返回 Top N</Text>
            <InputNumber min={1} max={500} value={topN} onChange={(v) => setTopN(v || 100)} style={{ width: '100%' }} />
          </Col>
          <Col span={6}>
            <Text>板块过滤</Text>
            <Select
              allowClear
              value={board}
              onChange={setBoard}
              style={{ width: '100%' }}
              options={[
                { value: 'main', label: '主板' },
                { value: 'gem', label: '创业板' },
                { value: 'star', label: '科创板' },
              ]}
            />
          </Col>
          <Col span={6}>
            <Card size="small" style={{ marginTop: 16 }}>
              <Statistic title="已选条件" value={selectedCount} prefix={<CheckCircleOutlined />} />
            </Card>
          </Col>
        </Row>
      </Card>

      <Tabs
        items={Object.entries(categories).map(([cat, codes]) => ({
          key: cat,
          label: (
            <Space>
              <Tag color={CATEGORY_COLOR[cat] || 'default'}>{CATEGORY_LABEL[cat] || cat}</Tag>
              <Text type="secondary">{codes.length}</Text>
            </Space>
          ),
          children: (
            <Row gutter={[8, 8]}>
              {codes.map((code) => {
                const cfg = conditions[code];
                if (!cfg) return null;
                const isSelected = !!selected[code];
                const cfgParams = params[code] || cfg.params || {};
                return (
                  <Col key={code} xs={24} sm={12} md={8} lg={6}>
                    <Card
                      size="small"
                      style={{
                        borderColor: isSelected ? '#1677ff' : undefined,
                        borderWidth: isSelected ? 2 : 1,
                      }}
                    >
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Space>
                            <Switch size="small" checked={isSelected} onChange={(v) => toggleCondition(code, v)} />
                            <Text strong>{cfg.name}</Text>
                          </Space>
                          <Tag color={CATEGORY_COLOR[cat] || 'default'} style={{ fontSize: 10 }}>{code}</Tag>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 11 }}>{cfg.description}</Text>
                        {Object.keys(cfg.params || {}).length > 0 && (
                          <>
                            <Divider style={{ margin: '4px 0' }} />
                            {Object.entries(cfg.params).map(([pk, pv]) => (
                              <Space key={pk} size={4} style={{ width: '100%', fontSize: 11 }}>
                                <Text type="secondary" style={{ minWidth: 50 }}>{pk}:</Text>
                                <InputNumber
                                  size="small"
                                  style={{ width: '100%' }}
                                  value={cfgParams[pk] ?? pv}
                                  onChange={(v) => setParam(code, pk, v ?? pv)}
                                />
                              </Space>
                            ))}
                          </>
                        )}
                      </Space>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          ),
        }))}
      />

      {result && (
        <Card size="small" title={`筛选结果（Top ${result.count} / 命中 ${result.total_matched} / 扫描 ${result.total_scanned}）`}>
          <Table
            dataSource={result.data}
            columns={columns}
            rowKey="code"
            size="small"
            pagination={{ pageSize: 20, size: 'default' }}
            scroll={{ y: 600 }}
          />
        </Card>
      )}
    </Space>
  );
}
