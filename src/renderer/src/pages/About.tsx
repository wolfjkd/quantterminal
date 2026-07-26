/** 关于 QuantTerminal */
import { Card, Typography, Descriptions, Tag, Space, Row, Col, Statistic } from 'antd';
import {
  CheckCircleOutlined,
  DashboardOutlined,
  ThunderboltOutlined,
  SwapOutlined,
  ToolOutlined,
  RadarChartOutlined,
  StockOutlined,
  StarOutlined,
  WalletOutlined,
  BarChartOutlined,
  ExperimentOutlined,
  FundProjectionScreenOutlined,
  FilterOutlined,
  LineChartOutlined,
  GlobalOutlined,
  CloudSyncOutlined,
  AimOutlined,
  FileTextOutlined,
  SettingOutlined,
  AuditOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const MODULE_GROUPS: Array<{ label: string; items: Array<{ name: string; icon: React.ReactNode }> }> = [
  {
    label: '指挥与操盘',
    items: [
      { name: '总览', icon: <DashboardOutlined /> },
      { name: '操盘台', icon: <ThunderboltOutlined /> },
      { name: '双核对比', icon: <SwapOutlined /> },
      { name: '量化工作台', icon: <ToolOutlined /> },
      { name: '市场雷达', icon: <RadarChartOutlined /> },
    ],
  },
  {
    label: '股票与组合',
    items: [
      { name: '股票池', icon: <StockOutlined /> },
      { name: '自选股', icon: <StarOutlined /> },
      { name: '投资组合', icon: <WalletOutlined /> },
      { name: '交易计划', icon: <AimOutlined /> },
      { name: '交易笔记', icon: <FileTextOutlined /> },
    ],
  },
  {
    label: '量化研究',
    items: [
      { name: '回测中心', icon: <BarChartOutlined /> },
      { name: '策略管理', icon: <ExperimentOutlined /> },
      { name: '因子中心', icon: <FundProjectionScreenOutlined /> },
      { name: '条件选股', icon: <FilterOutlined /> },
    ],
  },
  {
    label: '行情与系统',
    items: [
      { name: '实时分析', icon: <LineChartOutlined /> },
      { name: '全A动向', icon: <GlobalOutlined /> },
      { name: '行情同步', icon: <CloudSyncOutlined /> },
      { name: '系统设置', icon: <SettingOutlined /> },
      { name: '审计日志', icon: <AuditOutlined /> },
    ],
  },
];

const About = () => {
  return (
    <div style={{ padding: 20 }}>
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space align="baseline">
            <Title level={3} style={{ margin: 0 }}>QuantTerminal v0.3.0</Title>
            <Tag color="green">稳定版</Tag>
          </Space>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            A 股量化研究平台，采用 Electron + React + TypeScript + FastAPI + SQLite 技术栈，
            集成 quantcore 指标库与 quantengine 信号/回测/因子引擎，提供从行情同步到策略回测的完整工作流。
          </Paragraph>

          <Row gutter={16}>
            <Col xs={12} sm={6}>
              <Statistic title="业务模块" value={20} suffix="个" />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="数据库表" value={26} suffix="张" />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="内置策略" value={8} suffix="个" />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="内置因子" value={22} suffix="个" />
            </Col>
          </Row>

          <Descriptions title="技术栈" bordered column={2} size="small">
            <Descriptions.Item label="前端框架">React 18 + TypeScript 5</Descriptions.Item>
            <Descriptions.Item label="UI 库">Ant Design 5</Descriptions.Item>
            <Descriptions.Item label="路由">React Router 6</Descriptions.Item>
            <Descriptions.Item label="图表">ECharts 5</Descriptions.Item>
            <Descriptions.Item label="后端">FastAPI + Python 3.11</Descriptions.Item>
            <Descriptions.Item label="数据库">SQLite（嵌入式）</Descriptions.Item>
            <Descriptions.Item label="桌面壳">Electron</Descriptions.Item>
            <Descriptions.Item label="认证">JWT Token + bcrypt</Descriptions.Item>
            <Descriptions.Item label="指标库">quantcore（共享算法层）</Descriptions.Item>
            <Descriptions.Item label="引擎层">quantengine（信号/回测/因子/选股）</Descriptions.Item>
          </Descriptions>

          <Descriptions title="业务模块（20 个）" bordered column={1} size="small">
            {MODULE_GROUPS.map((g) => (
              <Descriptions.Item key={g.label} label={g.label}>
                <Space wrap>
                  {g.items.map((m) => (
                    <Tag key={m.name} icon={m.icon} style={{ marginBottom: 4 }}>
                      {m.name}
                    </Tag>
                  ))}
                </Space>
              </Descriptions.Item>
            ))}
          </Descriptions>

          <Descriptions title="核心能力" bordered column={1} size="small">
            <Descriptions.Item label="行情同步">
              接入东方财富公开接口（push2his / push2），支持日 K 线、股票列表、实时报价
            </Descriptions.Item>
            <Descriptions.Item label="信号引擎">
              quantengine.SignalEngine，输出 6 级信号 + 6 维度评分 + 交易计划
            </Descriptions.Item>
            <Descriptions.Item label="回测引擎">
              8 种策略（双均线/MACD/KDJ/布林/RSI/动量/均值回归/复合）+ 29 项绩效指标
            </Descriptions.Item>
            <Descriptions.Item label="因子引擎">
              5 类 22 因子（价值/成长/质量/动量/风险），支持多因子加权打分与 IC 分析
            </Descriptions.Item>
            <Descriptions.Item label="条件选股">
              5 类 30+ 条件组合筛选，支持多条件 AND 逻辑与 6 种比较运算符
            </Descriptions.Item>
            <Descriptions.Item label="A 股特色">
              T+1 交易制度、5%/10%/20% 三档涨跌停、佣金+印花税模拟
            </Descriptions.Item>
          </Descriptions>

          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <Text type="secondary">
              数据规模：5,067 只股票 / 85,527 条 K 线 / 43 个选股条件
            </Text>
          </Space>
        </Space>
      </Card>
    </div>
  );
};

export default About;
