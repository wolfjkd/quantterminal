import { useState, useEffect } from 'react';
import { Card, Row, Col, Select, Button, Table, Tag, Spin, Input, InputNumber, message, Empty, Statistic } from 'antd';
import { SearchOutlined, ReloadOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { ScreenerCondition, ScreenerResult } from '@/types';
import { screenerApi } from '@/services/api';

const { Option } = Select;

interface ConditionGroup {
  key: string;
  field: string;
  operator: string;
  value: number | string | boolean;
}

const OPERATORS = [
  { value: '>', label: '大于 >' },
  { value: '<', label: '小于 <' },
  { value: '>=', label: '大于等于 ≥' },
  { value: '<=', label: '小于等于 ≤' },
  { value: '==', label: '等于 =' },
  { value: '!=', label: '不等于 ≠' },
];

const Screener = () => {
  const [conditions, setConditions] = useState<Record<string, ScreenerCondition>>({});
  const [conditionGroups, setConditionGroups] = useState<ConditionGroup[]>([
    { key: '1', field: '', operator: '>', value: 0 },
  ]);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [conditionsLoading, setConditionsLoading] = useState(false);

  useEffect(() => {
    fetchConditions();
  }, []);

  const fetchConditions = async () => {
    setConditionsLoading(true);
    try {
      const res = await screenerApi.getConditions();
      setConditions(res.data.data || {});
    } catch (error) {
      console.error('Failed to fetch conditions:', error);
      message.error('获取选股条件失败');
    } finally {
      setConditionsLoading(false);
    }
  };

  const handleAddCondition = () => {
    const newKey = String(Date.now());
    setConditionGroups([...conditionGroups, { key: newKey, field: '', operator: '>', value: 0 }]);
  };

  const handleRemoveCondition = (key: string) => {
    setConditionGroups(conditionGroups.filter(g => g.key !== key));
  };

  const handleConditionChange = (key: string, field: keyof ConditionGroup, value: any) => {
    setConditionGroups(conditionGroups.map(g => g.key === key ? { ...g, [field]: value } : g));
  };

  const handleScreen = async () => {
    const validGroups = conditionGroups.filter(g => g.field);
    if (validGroups.length === 0) {
      message.warning('请至少添加一个有效条件');
      return;
    }

    const conditionsPayload: Record<string, Record<string, any>> = {};
    validGroups.forEach((g, idx) => {
      conditionsPayload[`cond_${idx + 1}`] = {
        field: g.field,
        operator: g.operator,
        value: g.value,
      };
    });

    setLoading(true);
    try {
      const res = await screenerApi.screen(conditionsPayload);
      setResults(res.data.data || []);
      message.success(`筛选完成，共匹配 ${res.data.count || 0} 只股票`);
    } catch (error) {
      console.error('Screen failed:', error);
      message.error('筛选失败，请检查后端服务');
    } finally {
      setLoading(false);
    }
  };

  const fieldOptions = Object.entries(conditions).map(([key, cond]) => ({
    value: key,
    label: `${key} - ${cond.description}`,
  }));

  const columns = [
    {
      title: '股票代码',
      dataIndex: 'stock_code',
      key: 'stock_code',
      width: 120,
      render: (code: string) => <a href={`#${code}`}>{code}</a>,
    },
    {
      title: '收盘价',
      dataIndex: 'close',
      key: 'close',
      width: 100,
      sorter: (a: ScreenerResult, b: ScreenerResult) => a.close - b.close,
      render: (v: number) => v?.toFixed(2),
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      key: 'volume',
      width: 120,
      sorter: (a: ScreenerResult, b: ScreenerResult) => a.volume - b.volume,
      render: (v: number) => v?.toLocaleString(),
    },
    {
      title: '匹配条件',
      dataIndex: 'matched_conditions',
      key: 'matched_conditions',
      render: (conds: string[]) => (
        <span>
          {conds?.map(c => <Tag key={c} color="blue">{c}</Tag>)}
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <Spin spinning={conditionsLoading}>
        <Card
          title="条件选股"
          extra={
            <Button icon={<ReloadOutlined />} onClick={fetchConditions}>
              刷新条件
            </Button>
          }
        >
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col span={24}>
              <Statistic
                title="可选条件数"
                value={Object.keys(conditions).length}
                suffix="个"
              />
            </Col>
          </Row>

          {conditionGroups.map(group => (
            <Row gutter={[8, 8]} key={group.key} style={{ marginBottom: 8 }}>
              <Col span={10}>
                <Select
                  style={{ width: '100%' }}
                  placeholder="选择条件字段"
                  value={group.field || undefined}
                  onChange={v => handleConditionChange(group.key, 'field', v)}
                  showSearch
                  optionFilterProp="label"
                  options={fieldOptions}
                />
              </Col>
              <Col span={4}>
                <Select
                  style={{ width: '100%' }}
                  value={group.operator}
                  onChange={v => handleConditionChange(group.key, 'operator', v)}
                  options={OPERATORS}
                />
              </Col>
              <Col span={8}>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="输入阈值"
                  value={group.value as number}
                  onChange={v => handleConditionChange(group.key, 'value', v ?? 0)}
                />
              </Col>
              <Col span={2}>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveCondition(group.key)}
                  disabled={conditionGroups.length === 1}
                />
              </Col>
            </Row>
          ))}

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={6}>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={handleAddCondition}
                block
              >
                添加条件
              </Button>
            </Col>
            <Col span={6}>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleScreen}
                loading={loading}
                block
              >
                开始筛选
              </Button>
            </Col>
          </Row>
        </Card>
      </Spin>

      <Card
        title="筛选结果"
        style={{ marginTop: 16 }}
        extra={<Tag color="blue">{results.length} 只匹配</Tag>}
      >
        {results.length === 0 ? (
          <Empty description="暂无筛选结果，请配置条件后筛选" />
        ) : (
          <Table
            columns={columns}
            dataSource={results}
            rowKey="stock_code"
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ y: 500 }}
            loading={loading}
          />
        )}
      </Card>
    </div>
  );
};

export default Screener;
