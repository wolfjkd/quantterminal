import { useState, useEffect } from 'react';
import { Card, Row, Col, Select, Button, Table, Tag, Spin, InputNumber, message, Empty, Statistic, Tabs, Input } from 'antd';
import { ReloadOutlined, ThunderboltOutlined, BarChartOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { Factor, FactorScore, ICAnalysis } from '@/types';
import { factorApi } from '@/services/api';

const FactorCenter = () => {
  const [factors, setFactors] = useState<Record<string, Factor>>({});
  const [factorScores, setFactorScores] = useState<FactorScore[]>([]);
  const [factorWeights, setFactorWeights] = useState<Record<string, number>>({});
  const [icResult, setIcResult] = useState<ICAnalysis | null>(null);
  const [selectedFactorForIC, setSelectedFactorForIC] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [factorsLoading, setFactorsLoading] = useState(false);

  useEffect(() => {
    fetchFactors();
  }, []);

  const fetchFactors = async () => {
    setFactorsLoading(true);
    try {
      const res = await factorApi.getFactors();
      const data = res.data.data || {};
      setFactors(data);
      // 初始化权重为默认值
      const initWeights: Record<string, number> = {};
      Object.entries(data).forEach(([key, factor]) => {
        initWeights[key] = factor.default_weight;
      });
      setFactorWeights(initWeights);
    } catch (error) {
      console.error('Failed to fetch factors:', error);
      message.error('获取因子列表失败');
    } finally {
      setFactorsLoading(false);
    }
  };

  const handleScore = async () => {
    setLoading(true);
    try {
      const res = await factorApi.score(factorWeights);
      setFactorScores(res.data.data || []);
      message.success(`评分完成，共 ${res.data.count || 0} 只股票`);
    } catch (error) {
      console.error('Factor score failed:', error);
      message.error('因子评分失败');
    } finally {
      setLoading(false);
    }
  };

  const handleICAnalysis = async () => {
    if (!selectedFactorForIC) {
      message.warning('请选择要分析IC的因子');
      return;
    }
    setLoading(true);
    try {
      const res = await factorApi.icAnalysis(selectedFactorForIC);
      setIcResult(res.data);
      message.success('IC分析完成');
    } catch (error) {
      console.error('IC analysis failed:', error);
      message.error('IC分析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleWeightChange = (factorKey: string, value: number | null) => {
    setFactorWeights({
      ...factorWeights,
      [factorKey]: value ?? 0,
    });
  };

  const factorList = Object.entries(factors).map(([key, factor]) => ({
    key,
    code: key,
    ...factor,
  }));

  const factorColumns = [
    {
      title: '因子代码',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (code: string) => <Tag color="cyan">{code}</Tag>,
    },
    {
      title: '因子名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '方向',
      dataIndex: 'direction',
      key: 'direction',
      width: 80,
      render: (d: string) => (
        <Tag color={d === 'positive' ? 'green' : d === 'negative' ? 'red' : 'gray'}>
          {d === 'positive' ? '正向' : d === 'negative' ? '负向' : d}
        </Tag>
      ),
    },
    {
      title: '默认权重',
      dataIndex: 'default_weight',
      key: 'default_weight',
      width: 100,
      render: (v: number) => v?.toFixed(2),
    },
    {
      title: '自定义权重',
      key: 'custom_weight',
      width: 150,
      render: (_: any, record: any) => (
        <InputNumber
          size="small"
          min={0}
          max={1}
          step={0.05}
          value={factorWeights[record.code] ?? record.default_weight}
          onChange={v => handleWeightChange(record.code, v)}
        />
      ),
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
  ];

  const scoreColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 70,
      render: (_: any, __: any, idx: number) => idx + 1,
    },
    {
      title: '股票代码',
      dataIndex: 'stock_code',
      key: 'stock_code',
      width: 120,
      render: (code: string) => <a href={`#${code}`}>{code}</a>,
    },
    {
      title: '综合评分',
      dataIndex: 'score',
      key: 'score',
      width: 120,
      sorter: (a: FactorScore, b: FactorScore) => a.score - b.score,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => <span style={{ fontWeight: 'bold', color: '#1890ff' }}>{v?.toFixed(4)}</span>,
    },
    {
      title: '收盘价',
      dataIndex: 'close',
      key: 'close',
      width: 100,
      render: (v: number) => v?.toFixed(2),
    },
    {
      title: '因子明细',
      dataIndex: 'factor_scores',
      key: 'factor_scores',
      render: (scores: Record<string, number>) => (
        <span>
          {Object.entries(scores || {}).slice(0, 5).map(([k, v]) => (
            <Tag key={k}>{k}: {v?.toFixed(2)}</Tag>
          ))}
        </span>
      ),
    },
  ];

  // 因子评分分布图
  const scoreDistributionOption = factorScores.length > 0 ? {
    title: { text: '因子评分分布', left: 'center' },
    tooltip: { trigger: 'item' },
    grid: { left: '5%', right: '5%', bottom: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: factorScores.slice(0, 30).map(s => s.stock_code),
      axisLabel: { rotate: 45 },
    },
    yAxis: { type: 'value', name: '综合评分' },
    series: [{
      type: 'bar',
      data: factorScores.slice(0, 30).map(s => s.score),
      itemStyle: {
        color: '#1890ff',
      },
    }],
  } : {};

  // IC分析图
  const icChartOption = icResult ? {
    title: { text: `${icResult.factor_name} IC 分析`, left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['IC', 'Rank IC'], top: 30 },
    grid: { top: 80 },
    xAxis: { type: 'category', data: ['IC', 'Rank IC'] },
    yAxis: { type: 'value', name: '相关系数' },
    series: [
      {
        name: 'IC',
        type: 'bar',
        data: [icResult.ic],
        itemStyle: { color: '#52c41a' },
      },
      {
        name: 'Rank IC',
        type: 'bar',
        data: [icResult.rank_ic],
        itemStyle: { color: '#1890ff' },
      },
    ],
  } : {};

  return (
    <div style={{ padding: '20px' }}>
      <Spin spinning={factorsLoading}>
        <Tabs
          items={[
            {
              key: 'catalog',
              label: '因子库',
              children: (
                <div>
                  <Card
                    title="因子库管理"
                    extra={
                      <Button icon={<ReloadOutlined />} onClick={fetchFactors}>
                        刷新
                      </Button>
                    }
                  >
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                      <Col span={6}>
                        <Statistic title="因子总数" value={Object.keys(factors).length} suffix="个" />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title="正向因子"
                          value={Object.values(factors).filter(f => f.direction === 'positive').length}
                          suffix="个"
                        />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title="负向因子"
                          value={Object.values(factors).filter(f => f.direction === 'negative').length}
                          suffix="个"
                        />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title="权重总和"
                          value={Object.values(factorWeights).reduce((a, b) => a + b, 0)}
                          precision={2}
                        />
                      </Col>
                    </Row>

                    <Table
                      columns={factorColumns}
                      dataSource={factorList}
                      rowKey="code"
                      pagination={{ pageSize: 15 }}
                      scroll={{ y: 400 }}
                    />

                    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                      <Col span={6}>
                        <Button
                          type="primary"
                          icon={<ThunderboltOutlined />}
                          onClick={handleScore}
                          loading={loading}
                          block
                          size="large"
                        >
                          按权重计算评分
                        </Button>
                      </Col>
                    </Row>
                  </Card>

                  <Card title="因子评分排行" style={{ marginTop: 16 }}>
                    {factorScores.length === 0 ? (
                      <Empty description="暂无评分结果，请配置权重后计算" />
                    ) : (
                      <Table
                        columns={scoreColumns}
                        dataSource={factorScores}
                        rowKey="stock_code"
                        pagination={{ pageSize: 20, showSizeChanger: true }}
                        scroll={{ y: 500 }}
                        loading={loading}
                      />
                    )}
                  </Card>

                  {factorScores.length > 0 && (
                    <Card title="评分分布图" style={{ marginTop: 16 }}>
                      <ReactECharts option={scoreDistributionOption} style={{ height: '400px' }} />
                    </Card>
                  )}
                </div>
              ),
            },
            {
              key: 'ic_analysis',
              label: 'IC 分析',
              children: (
                <Card title="因子 IC 分析">
                  <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                    <Col span={12}>
                      <Select
                        style={{ width: '100%' }}
                        placeholder="选择因子进行IC分析"
                        value={selectedFactorForIC || undefined}
                        onChange={setSelectedFactorForIC}
                        showSearch
                        optionFilterProp="label"
                        options={Object.entries(factors).map(([key, f]) => ({
                          value: key,
                          label: `${key} - ${f.name}`,
                        }))}
                      />
                    </Col>
                    <Col span={6}>
                      <Button
                        type="primary"
                        icon={<BarChartOutlined />}
                        onClick={handleICAnalysis}
                        loading={loading}
                        block
                      >
                        执行 IC 分析
                      </Button>
                    </Col>
                  </Row>

                  {icResult ? (
                    <div>
                      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                        <Col span={6}>
                          <Card>
                            <Statistic
                              title="IC（信息系数）"
                              value={icResult.ic}
                              precision={4}
                            />
                          </Card>
                        </Col>
                        <Col span={6}>
                          <Card>
                            <Statistic
                              title="Rank IC（秩相关）"
                              value={icResult.rank_ic}
                              precision={4}
                            />
                          </Card>
                        </Col>
                        <Col span={6}>
                          <Card>
                            <Statistic
                              title="样本数"
                              value={icResult.samples}
                              suffix="只"
                            />
                          </Card>
                        </Col>
                        <Col span={6}>
                          <Card>
                            <Statistic
                              title="因子名称"
                              value={icResult.factor_name}
                            />
                          </Card>
                        </Col>
                      </Row>

                      <Card title="IC vs Rank IC 对比">
                        <ReactECharts option={icChartOption} style={{ height: '350px' }} />
                      </Card>
                    </div>
                  ) : (
                    <Empty description="请选择因子并执行IC分析" />
                  )}
                </Card>
              ),
            },
          ]}
        />
      </Spin>
    </div>
  );
};

export default FactorCenter;
