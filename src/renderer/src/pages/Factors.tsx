/** 因子中心
 *
 *   - 因子目录：5 类 22 因子（quantengine.FactorEngine）+ 自定义因子 CRUD
 *   - 多因子打分选股：按成交额降序扫描 Top1000 → 加权打分 → Top20 结果
 *   - IC 分析：单因子 IC / RankIC / 样本数
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Statistic, Table, Empty,
  Modal, Form, Input, InputNumber, Select, message, Alert,
  Tabs, Badge, Descriptions, Tooltip, Divider, Spin,
} from 'antd';
import {
  ReloadOutlined, PlusOutlined, ThunderboltOutlined,
  ExperimentOutlined, BarChartOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { factorApi } from '../services/api';

const { Title, Paragraph, Text } = Typography;

// ============ 类型 ============

interface FactorConfig {
  name: string;
  category: string;
  direction: 'positive' | 'negative' | 'neutral';
  default_weight: number;
  description: string;
}

interface CatalogResp {
  available: boolean;
  error?: string;
  factors: Record<string, FactorConfig>;
  categories: Record<string, string[]>;
}

interface CustomFactor {
  id: number;
  code: string;
  name: string;
  formula_type: string;
  params_json: string;
  default_weight: number;
  is_reverse: number;
  status: number;
  remark: string;
}

interface ScoreResult {
  rank: number;
  code: string;
  name: string;
  score: number;
  close: number;
  factor_scores: Record<string, number>;
}

interface ICResult {
  ic: number;
  rank_ic: number;
  samples: number;
  factor_code: string;
  factor_name: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  value: '价值类',
  growth: '成长类',
  quality: '质量类',
  momentum: '动量类',
  risk: '风险类',
};

const CATEGORY_COLOR: Record<string, string> = {
  value: 'blue',
  growth: 'green',
  quality: 'purple',
  momentum: 'orange',
  risk: 'red',
};

const DIRECTION_LABEL: Record<string, string> = {
  positive: '正向（越大越好）',
  negative: '反向（越小越好）',
  neutral: '中性',
};

// ============ 主组件 ============

export default function Factors() {
  const [tab, setTab] = useState('catalog');

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small">
        <Row align="middle" justify="space-between">
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              <ExperimentOutlined /> 因子研究中心
            </Title>
            <Text type="secondary">
              桥接 quantengine.FactorEngine · 5 类 22 因子
            </Text>
          </Col>
        </Row>
      </Card>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'catalog', label: '因子目录', children: <CatalogTab /> },
          { key: 'score', label: '多因子打分选股', children: <ScoreTab /> },
          { key: 'ic', label: 'IC 分析', children: <ICTab /> },
          { key: 'custom', label: '自定义因子', children: <CustomTab /> },
        ]}
      />
    </Space>
  );
}

// ============ Tab1: 因子目录 ============

function CatalogTab() {
  const [data, setData] = useState<CatalogResp | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await factorApi.catalog();
      setData(resp.data);
    } catch (e: any) {
      message.error('加载因子目录失败：' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Spin tip="加载因子目录..." />;
  if (!data) return <Empty />;

  if (!data.available) {
    return (
      <Alert
        type="error"
        showIcon
        message="quantengine 引擎不可用"
        description={data.error || '未知错误，请检查 quantengine 路径配置'}
      />
    );
  }

  const factors = data.factors || {};
  const categories = data.categories || {};
  const totalFactors = Object.keys(factors).length;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Row gutter={16}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="因子总数" value={totalFactors} prefix={<BarChartOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="分类数" value={Object.keys(categories).length} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small">
            <Space wrap>
              {Object.entries(categories).map(([cat, codes]) => (
                <Tag key={cat} color={CATEGORY_COLOR[cat] || 'default'}>
                  {CATEGORY_LABEL[cat] || cat}: {codes.length}
                </Tag>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      {Object.entries(categories).map(([cat, codes]) => (
        <Card
          key={cat}
          size="small"
          title={
            <Space>
              <Tag color={CATEGORY_COLOR[cat] || 'default'}>{CATEGORY_LABEL[cat] || cat}</Tag>
              <Text type="secondary">{codes.length} 个因子</Text>
            </Space>
          }
        >
          <Row gutter={[12, 12]}>
            {codes.map((code) => {
              const cfg = factors[code];
              if (!cfg) return null;
              return (
                <Col key={code} xs={24} sm={12} md={8} lg={6}>
                  <Card size="small" hoverable>
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <Space>
                        <Text strong>{cfg.name}</Text>
                        <Tag color={CATEGORY_COLOR[cat] || 'default'}>{code}</Tag>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>{cfg.description}</Text>
                      <Divider style={{ margin: '4px 0' }} />
                      <Space size="small" wrap>
                        <Tooltip title={DIRECTION_LABEL[cfg.direction]}>
                          <Tag color={cfg.direction === 'positive' ? 'green' : cfg.direction === 'negative' ? 'red' : 'default'}>
                            {cfg.direction === 'positive' ? '正向' : cfg.direction === 'negative' ? '反向' : '中性'}
                          </Tag>
                        </Tooltip>
                        <Tag>默认权重: {cfg.default_weight}</Tag>
                      </Space>
                    </Space>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Card>
      ))}
    </Space>
  );
}

// ============ Tab2: 多因子打分选股 ============

function ScoreTab() {
  const [catalog, setCatalog] = useState<CatalogResp | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [topN, setTopN] = useState(20);
  const [limit, setLimit] = useState(1000);
  const [board, setBoard] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ data: ScoreResult[]; count: number; total_scanned: number } | null>(null);

  const loadCatalog = async () => {
    try {
      const resp = await factorApi.catalog();
      setCatalog(resp.data);
      if (resp.data.available) {
        const init: Record<string, number> = {};
        const factors = resp.data.factors as Record<string, FactorConfig>;
        Object.entries(factors).forEach(([code, cfg]) => {
          init[code] = cfg.default_weight;
        });
        setWeights(init);
      }
    } catch (e: any) {
      message.error('加载因子目录失败：' + (e?.message || e));
    }
  };

  useEffect(() => { loadCatalog(); }, []);

  const runScore = async () => {
    setLoading(true);
    try {
      const resp = await factorApi.score({
        factor_weights: weights,
        top_n: topN,
        limit,
        board,
      });
      if (resp.data?.error) {
        message.error(resp.data.error);
      } else {
        setResult(resp.data);
        message.success(`打分完成，扫描 ${resp.data.total_scanned} 只，返回 Top${resp.data.count}`);
      }
    } catch (e: any) {
      message.error('打分失败：' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  if (!catalog) return <Spin tip="加载因子目录..." />;
  if (!catalog.available) {
    return <Alert type="error" showIcon message="quantengine 引擎不可用" description={catalog.error} />;
  }

  const columns = [
    { title: '排名', dataIndex: 'rank', width: 70, render: (v: number) => <Badge count={v} style={{ backgroundColor: v <= 3 ? '#52c41a' : '#1677ff' }} /> },
    { title: '代码', dataIndex: 'code', width: 90 },
    { title: '名称', dataIndex: 'name', width: 120 },
    { title: '综合得分', dataIndex: 'score', width: 100, render: (v: number) => <Text strong style={{ color: '#1677ff' }}>{v.toFixed(4)}</Text> },
    { title: '最新价', dataIndex: 'close', width: 80, render: (v: number) => v?.toFixed(2) },
    {
      title: '因子贡献',
      dataIndex: 'factor_scores',
      render: (scores: Record<string, number>) => (
        <Space wrap size={4}>
          {Object.entries(scores)
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            .slice(0, 5)
            .map(([k, v]) => (
              <Tag key={k} color={v >= 0 ? 'green' : 'red'} style={{ fontSize: 11 }}>
                {k}: {v.toFixed(3)}
              </Tag>
            ))}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small" title="打分配置">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Row gutter={16}>
            <Col span={6}>
              <Text>返回 Top N</Text>
              <InputNumber min={1} max={100} value={topN} onChange={(v) => setTopN(v || 20)} style={{ width: '100%' }} />
            </Col>
            <Col span={6}>
              <Text>扫描股票数（按成交额降序）</Text>
              <InputNumber min={100} max={5000} step={100} value={limit} onChange={(v) => setLimit(v || 1000)} style={{ width: '100%' }} />
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
            <Col span={6} style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button type="primary" icon={<ThunderboltOutlined />} loading={loading} onClick={runScore} block>
                执行打分
              </Button>
            </Col>
          </Row>

          <Divider style={{ margin: '4px 0' }} />

          <Paragraph type="secondary" style={{ margin: 0 }}>
            因子权重配置（0 表示不参与打分，正数表示按方向加权）
          </Paragraph>

          <Row gutter={[8, 8]}>
            {Object.entries(catalog.factors).map(([code, cfg]) => (
              <Col key={code} xs={12} sm={8} md={6} lg={4}>
                <Tooltip title={cfg.description}>
                  <div style={{ marginBottom: 4 }}>
                    <Tag color={CATEGORY_COLOR[cfg.category] || 'default'} style={{ marginRight: 4 }}>{code}</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>{cfg.name}</Text>
                  </div>
                  <InputNumber
                    min={0}
                    max={5}
                    step={0.1}
                    value={weights[code] ?? cfg.default_weight}
                    onChange={(v) => setWeights({ ...weights, [code]: v || 0 })}
                    style={{ width: '100%' }}
                  />
                </Tooltip>
              </Col>
            ))}
          </Row>
        </Space>
      </Card>

      {result && (
        <Card size="small" title={`打分结果（Top ${result.count} / 扫描 ${result.total_scanned}）`}>
          <Table
            dataSource={result.data}
            columns={columns}
            rowKey="code"
            size="small"
            pagination={false}
            scroll={{ y: 600 }}
          />
        </Card>
      )}
    </Space>
  );
}

// ============ Tab3: IC 分析 ============

function ICTab() {
  const [catalog, setCatalog] = useState<CatalogResp | null>(null);
  const [factorCode, setFactorCode] = useState<string | undefined>(undefined);
  const [period, setPeriod] = useState(60);
  const [sampleLimit, setSampleLimit] = useState(500);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ICResult | null>(null);

  const loadCatalog = async () => {
    try {
      const resp = await factorApi.catalog();
      setCatalog(resp.data);
    } catch (e: any) {
      message.error('加载因子目录失败：' + (e?.message || e));
    }
  };

  useEffect(() => { loadCatalog(); }, []);

  const runIC = async () => {
    if (!factorCode) {
      message.warning('请选择因子');
      return;
    }
    setLoading(true);
    try {
      const resp = await factorApi.ic(factorCode, sampleLimit, period);
      if (resp.data?.error) {
        message.error(resp.data.error);
      } else {
        setResult(resp.data);
      }
    } catch (e: any) {
      message.error('IC 分析失败：' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  if (!catalog) return <Spin tip="加载因子目录..." />;
  if (!catalog.available) {
    return <Alert type="error" showIcon message="quantengine 引擎不可用" description={catalog.error} />;
  }

  const icColor = (ic: number) => {
    const abs = Math.abs(ic);
    if (abs >= 0.05) return 'green';
    if (abs >= 0.03) return 'blue';
    return 'default';
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small" title="IC 分析配置">
        <Row gutter={16} align="bottom">
          <Col span={8}>
            <Text>因子</Text>
            <Select
              showSearch
              style={{ width: '100%' }}
              value={factorCode}
              onChange={setFactorCode}
              options={Object.entries(catalog.factors).map(([code, cfg]) => ({
                value: code,
                label: `${code} - ${cfg.name}`,
              }))}
              placeholder="选择因子"
            />
          </Col>
          <Col span={4}>
            <Text>样本数</Text>
            <InputNumber min={50} max={5000} step={50} value={sampleLimit} onChange={(v) => setSampleLimit(v || 500)} style={{ width: '100%' }} />
          </Col>
          <Col span={4}>
            <Text>周期（日）</Text>
            <InputNumber min={5} max={120} value={period} onChange={(v) => setPeriod(v || 60)} style={{ width: '100%' }} />
          </Col>
          <Col span={8}>
            <Button type="primary" icon={<BarChartOutlined />} loading={loading} onClick={runIC} block>
              执行 IC 分析
            </Button>
          </Col>
        </Row>
      </Card>

      {result && (
        <Card size="small" title={`${result.factor_name} (${result.factor_code}) IC 分析结果`}>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="因子代码">{result.factor_code}</Descriptions.Item>
            <Descriptions.Item label="因子名称">{result.factor_name}</Descriptions.Item>
            <Descriptions.Item label="IC（Pearson 相关）">
              <Tag color={icColor(result.ic)}>{result.ic.toFixed(4)}</Tag>
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                {Math.abs(result.ic) >= 0.05 ? '有效因子' : Math.abs(result.ic) >= 0.03 ? '弱有效' : '无效因子'}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Rank IC（Spearman）">
              <Tag color={icColor(result.rank_ic)}>{result.rank_ic.toFixed(4)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="有效样本数">{result.samples}</Descriptions.Item>
            <Descriptions.Item label="评估周期">{period} 日未来收益</Descriptions.Item>
          </Descriptions>

          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="IC 评估标准"
            description={
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li>|IC| ≥ 0.05：有效因子，可用于选股</li>
                <li>0.03 ≤ |IC| &lt; 0.05：弱有效，建议组合使用</li>
                <li>|IC| &lt; 0.03：无效因子，建议剔除</li>
                <li>Rank IC 更抗异常值，通常比 IC 更稳定</li>
              </ul>
            }
          />
        </Card>
      )}
    </Space>
  );
}

// ============ Tab4: 自定义因子 CRUD ============

function CustomTab() {
  const [list, setList] = useState<CustomFactor[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFactor | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const resp = await factorApi.list();
      setList(resp.data?.data || []);
    } catch (e: any) {
      message.error('加载自定义因子失败：' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      formula_type: 'custom', params_json: '{}',
      default_weight: 1.0, is_reverse: 0, status: 1,
    });
    setModalOpen(true);
  };

  const openEdit = (r: CustomFactor) => {
    setEditing(r);
    form.setFieldsValue(r);
    setModalOpen(true);
  };

  const submit = async () => {
    try {
      const v = await form.validateFields();
      if (editing) {
        await factorApi.update(editing.id, v);
        message.success('更新成功');
      } else {
        await factorApi.create(v);
        message.success('创建成功');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败：' + (e?.message || e));
    }
  };

  const remove = async (r: CustomFactor) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除因子 "${r.name}" (${r.code})？`,
      okType: 'danger',
      onOk: async () => {
        try {
          await factorApi.remove(r.id);
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
    { title: '代码', dataIndex: 'code', width: 120 },
    { title: '名称', dataIndex: 'name', width: 150 },
    { title: '公式类型', dataIndex: 'formula_type', width: 100 },
    { title: '默认权重', dataIndex: 'default_weight', width: 90 },
    {
      title: '反向', dataIndex: 'is_reverse', width: 70,
      render: (v: number) => <Tag color={v ? 'red' : 'default'}>{v ? '是' : '否'}</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', width: 70,
      render: (v: number) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag>,
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    {
      title: '操作', width: 130, fixed: 'right' as const,
      render: (_: unknown, r: CustomFactor) => (
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
            <Text strong>自定义因子库（{list.length}）</Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              与 quantengine 内置因子独立，用于扩展因子库
            </Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增因子</Button>
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
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title={editing ? `编辑因子：${editing.name}` : '新增自定义因子'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={submit}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="code" label="因子代码" rules={[{ required: true, message: '请输入因子代码' }]}>
                <Input disabled={!!editing} placeholder="如 custom_mom_30" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="因子名称" rules={[{ required: true, message: '请输入因子名称' }]}>
                <Input placeholder="如 30日自定义动量" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="formula_type" label="公式类型">
                <Select options={[
                  { value: 'custom', label: '自定义' },
                  { value: 'momentum', label: '动量' },
                  { value: 'value', label: '价值' },
                  { value: 'growth', label: '成长' },
                  { value: 'quality', label: '质量' },
                  { value: 'risk', label: '风险' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="default_weight" label="默认权重">
                <InputNumber min={0} max={5} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="is_reverse" label="是否反向">
                <Select options={[
                  { value: 0, label: '否（正向）' },
                  { value: 1, label: '是（反向）' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="params_json" label="参数 JSON">
            <Input.TextArea rows={3} placeholder='{"period": 30}' />
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
        </Form>
      </Modal>
    </Space>
  );
}
