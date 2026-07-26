/** 双核对比
 *
 * 把两只重点关注股票（核心 A / 核心 B）放在一起做 SignalEngine 全方位对比：
 *   - 信号 / 综合评分 / 置信度 / 现价
 *   - 交易计划（入场价 / 止损价 / 止盈价 / 建议仓位）
 *   - 6 维度雷达图（趋势 / 动量 / 量能 / RSI / 风控 / 形态）
 *   - 近 80 日走势 mini 图
 *   - 评分差 / 偏向 / 对比结论
 *
 * 用途：在两只候选标的中二选一，量化判断当前更值得操作的方向。
 * 支持 admin 修改双核心配置（默认 002178.SZ 延华智能 / 002697.SZ 红旗连锁）。
 */
import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Descriptions, Statistic,
  Progress, Empty, Modal, Form, Input, message, Alert, Divider,
} from 'antd';
import {
  ReloadOutlined, SettingOutlined, SwapOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { compareApi } from '../services/api';
import { userStorage } from '../services/api';

const { Title, Text } = Typography;

// ============ 类型 ============
interface FocusStock {
  code: string;
  name: string;
  note?: string;
  color?: string;
}

interface AnalysisData {
  signal: string;
  score: number;
  confidence: number;
  close: number;
  trade_plan: {
    entry_price: number;
    stop_loss: number;
    take_profit: number;
    position_pct: number;
  } | null;
  dimensions: Record<string, number>;
}

interface CardData {
  meta: FocusStock;
  stock: {
    id: number; code: string; name: string;
    market: string; board: string; industry: string;
    is_st: number; status: number; list_date: string;
  } | null;
  analysis: AnalysisData | null;
  bars: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
  dims: Array<{ label: string; value: number }>;
  stats: {
    range_pos: number; hh: number; ll: number;
    dist_stop: number; dist_tp: number;
  } | null;
  message?: string;
}

interface CompareData {
  focus_stocks: FocusStock[];
  cards: CardData[];
  compare: {
    bias: number; diff: number;
    summary: string; winner: string;
    scores: { a: number; b: number };
  } | null;
  as_of_date: string;
}

const SIGNAL_TAG: Record<string, { color: string; label: string }> = {
  STRONG_BUY: { color: 'red', label: '强烈买入' },
  BUY: { color: 'volcano', label: '买入' },
  HOLD: { color: 'gold', label: '持有' },
  SELL: { color: 'cyan', label: '卖出' },
  STRONG_SELL: { color: 'blue', label: '强烈卖出' },
  AVOID: { color: 'default', label: '回避' },
};

// ============ 主组件 ============
export default function Compare() {
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const userInfo = userStorage.get() as { role?: string } | null;
  const isAdmin = userInfo?.role === 'admin';

  const fetch = async () => {
    setLoading(true);
    try {
      const { data: res } = await compareApi.overview();
      setData(res);
    } catch (err) {
      message.error('加载双核对比失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, []);

  // ============ 配置 Modal ============
  const openConfig = () => {
    if (!data) return;
    form.setFieldsValue({
      a_code: data.focus_stocks[0]?.code ?? '',
      a_name: data.focus_stocks[0]?.name ?? '',
      b_code: data.focus_stocks[1]?.code ?? '',
      b_name: data.focus_stocks[1]?.name ?? '',
    });
    setConfigOpen(true);
  };

  const onSaveConfig = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      await compareApi.updateFocus([
        { code: v.a_code, name: v.a_name, note: '核心A', color: '#22d3ee' },
        { code: v.b_code, name: v.b_name, note: '核心B', color: '#818cf8' },
      ]);
      message.success('双核心配置已更新');
      setConfigOpen(false);
      fetch();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '保存失败';
      message.error(detail);
    } finally {
      setSaving(false);
    }
  };

  // ============ 渲染 ============
  return (
    <div style={{ padding: 20 }}>
      <Card loading={loading}>
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            <SwapOutlined /> 双核心全屏对比
            {data?.as_of_date && (
              <Text type="secondary" style={{ fontSize: 14, marginLeft: 12 }}>
                {data.as_of_date}
              </Text>
            )}
          </Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
            {isAdmin && (
              <Button icon={<SettingOutlined />} onClick={openConfig}>配置双核心</Button>
            )}
          </Space>
        </Space>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="双核对比有什么用？"
          description="把两只重点关注股票放在一起做 SignalEngine 全方位对比：信号 / 评分 / 交易计划 / 6 维度雷达图 / 近 80 日走势。帮你在两只候选中二选一，量化判断当前更值得操作的方向。"
        />

        {data?.compare && (
          <Alert
            type={data.compare.diff < 5 ? 'info' : 'success'}
            showIcon
            style={{ marginBottom: 16 }}
            message={
              <Space split={<Divider type="vertical" />}>
                <span>对比结论：<strong>{data.compare.summary}</strong></span>
                <span>评分差：<strong>{data.compare.diff}</strong></span>
                <span>偏向：<strong>{data.compare.bias}%</strong></span>
              </Space>
            }
          />
        )}

        <Row gutter={16}>
          {data?.cards?.map((card, idx) => (
            <Col span={12} key={card.meta.code}>
              <StockCard card={card} side={idx === 0 ? 'A' : 'B'} />
            </Col>
          ))}
        </Row>
      </Card>

      {/* 双核心配置 Modal */}
      <Modal
        title="配置双核心"
        open={configOpen}
        onCancel={() => setConfigOpen(false)}
        onOk={onSaveConfig}
        confirmLoading={saving}
        okText="保存"
      >
        <Form form={form} layout="vertical">
          <Title level={5}>核心 A</Title>
          <Form.Item label="股票代码" name="a_code" rules={[{ required: true, message: '请输入代码' }]}>
            <Input placeholder="如 002178.SZ" />
          </Form.Item>
          <Form.Item label="股票名称" name="a_name">
            <Input placeholder="如 延华智能" />
          </Form.Item>
          <Title level={5}>核心 B</Title>
          <Form.Item label="股票代码" name="b_code" rules={[{ required: true, message: '请输入代码' }]}>
            <Input placeholder="如 002697.SZ" />
          </Form.Item>
          <Form.Item label="股票名称" name="b_name">
            <Input placeholder="如 红旗连锁" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ============ 单股卡片 ============
const StockCard = ({ card, side }: { card: CardData; side: 'A' | 'B' }) => {
  const color = card.meta.color || (side === 'A' ? '#22d3ee' : '#818cf8');
  const sigConf = card.analysis ? SIGNAL_TAG[card.analysis.signal] : null;

  return (
    <Card
      title={
        <Space>
          <Tag color={side === 'A' ? 'cyan' : 'purple'}>核心 {side}</Tag>
          <span style={{ color }}>{card.meta.name || card.stock?.name || card.meta.code}</span>
          <Text type="secondary" style={{ fontSize: 12 }}>{card.meta.code}</Text>
          {card.meta.note && <Tag>{card.meta.note}</Tag>}
        </Space>
      }
      styles={{ header: { borderLeft: `4px solid ${color}` } }}
    >
      {!card.stock ? (
        <Empty description={card.message || '股票不在数据库'} />
      ) : !card.analysis ? (
        <Empty description={card.message || '分析数据不足'} />
      ) : (
        <>
          {/* 信号 + 评分 */}
          <Row gutter={8} style={{ marginBottom: 12 }}>
            <Col span={6}>
              <Statistic
                title="信号"
                valueRender={() => sigConf ? <Tag color={sigConf.color}>{sigConf.label}</Tag> : '-'}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="综合评分"
                value={card.analysis.score.toFixed(1)}
                valueStyle={{ color: card.analysis.score >= 70 ? '#cf1322' : card.analysis.score >= 55 ? '#fa8c16' : '#8c8c8c' }}
              />
            </Col>
            <Col span={6}>
              <Statistic title="置信度" value={`${card.analysis.confidence}%`} />
            </Col>
            <Col span={6}>
              <Statistic title="现价" value={card.analysis.close.toFixed(2)} />
            </Col>
          </Row>

          {/* 交易计划 */}
          {card.analysis.trade_plan && (
            <Descriptions size="small" bordered column={2} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="入场价">
                {card.analysis.trade_plan.entry_price != null ? card.analysis.trade_plan.entry_price.toFixed(2) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="止损价">
                {card.analysis.trade_plan.stop_loss != null ? card.analysis.trade_plan.stop_loss.toFixed(2) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="止盈价">
                {card.analysis.trade_plan.take_profit != null ? card.analysis.trade_plan.take_profit.toFixed(2) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="建议仓位">
                {card.analysis.trade_plan.position_pct != null
                  ? `${(card.analysis.trade_plan.position_pct * 100).toFixed(1)}%`
                  : '-'}
              </Descriptions.Item>
            </Descriptions>
          )}

          {/* 6 维度雷达图 */}
          {card.dims.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Text strong>六维度雷达图</Text>
              <ReactECharts
                option={buildRadarOption(card.dims, color)}
                style={{ height: 240 }}
              />
            </div>
          )}

          {/* 区间统计 */}
          {card.stats && (
            <Descriptions size="small" bordered column={2} title="区间统计">
              <Descriptions.Item label="区间位置">
                <Progress percent={(card.stats.range_pos ?? 0) * 100} size="small" />
              </Descriptions.Item>
              <Descriptions.Item label="80日最高">
                {card.stats.hh != null ? card.stats.hh.toFixed(2) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="80日最低">
                {card.stats.ll != null ? card.stats.ll.toFixed(2) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="距止损">
                {card.stats.dist_stop != null ? `${(card.stats.dist_stop * 100).toFixed(2)}%` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="距止盈">
                {card.stats.dist_tp != null ? `${(card.stats.dist_tp * 100).toFixed(2)}%` : '-'}
              </Descriptions.Item>
            </Descriptions>
          )}

          {/* K 线 mini 走势图 */}
          {card.bars.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Text strong>近 80 日走势</Text>
              <ReactECharts
                option={buildLineOption(card.bars, color)}
                style={{ height: 180 }}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
};

// ============ 图表配置 ============
const buildRadarOption = (dims: Array<{ label: string; value: number }>, color: string) => ({
  tooltip: {},
  radar: {
    indicator: dims.map((d) => ({ name: d.label, max: 100 })),
    radius: '65%',
  },
  series: [{
    type: 'radar',
    data: [{
      value: dims.map((d) => d.value),
      name: '评分',
      areaStyle: { color: color + '40' },
      lineStyle: { color },
      itemStyle: { color },
    }],
  }],
});

const buildLineOption = (
  bars: Array<{ date: string; close: number; volume: number }>,
  color: string,
) => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 40, right: 20, top: 20, bottom: 30 },
  xAxis: {
    type: 'category',
    data: bars.map((b) => b.date),
    axisLabel: { fontSize: 10 },
  },
  yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 } },
  series: [{
    type: 'line',
    data: bars.map((b) => b.close),
    smooth: true,
    symbol: 'none',
    lineStyle: { color, width: 2 },
    areaStyle: { color: color + '20' },
  }],
});
