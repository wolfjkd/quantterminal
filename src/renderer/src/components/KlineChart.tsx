/** KlineChart — lightweight-charts 封装的 K 线图组件
 *
 * 用法：
 *   <KlineChart klines={[{date, open, high, low, close, volume}, ...]} height={480} />
 *
 * 特性：
 *   - 主图：蜡烛图 + 成交量副图
 *   - 时间轴可缩放、平移
 *   - 涨红跌绿（A 股配色）
 *   - tooltip 自定义
 */
import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
} from 'lightweight-charts';

export interface KlinePoint {
  date: string;       // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  klines: KlinePoint[];
  height?: number;
  showVolume?: boolean;
}

const UP_COLOR = '#cf1322';
const DOWN_COLOR = '#3f8600';

export default function KlineChart({ klines, height = 480, showVolume = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#333',
        fontFamily: 'monospace',
      },
      grid: {
        vertLines: { color: 'rgba(0,0,0,0.04)' },
        horzLines: { color: 'rgba(0,0,0,0.04)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(0,0,0,0.1)' },
      timeScale: {
        borderColor: 'rgba(0,0,0,0.1)',
        timeVisible: false,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });

    let volumeSeries: ISeriesApi<'Histogram'> | null = null;
    if (showVolume) {
      volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
    }

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // 响应容器宽度变化
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === containerRef.current) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [height, showVolume]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // lightweight-charts 时间支持 'YYYY-MM-DD' 字符串（业务日），但 TS 类型签名只接受 UTCTimestamp
    // 用 as unknown as UTCTimestamp 绕过类型检查（库实际支持字符串）
    const candleData: CandlestickData[] = klines.map((k) => ({
      time: k.date as unknown as UTCTimestamp,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));
    candleSeriesRef.current.setData(candleData);

    if (volumeSeriesRef.current) {
      const volumeData: HistogramData[] = klines.map((k) => ({
        time: k.date as unknown as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open
          ? 'rgba(207,19,34,0.5)'
          : 'rgba(63,134,0,0.5)',
      }));
      volumeSeriesRef.current.setData(volumeData);
    }

    chartRef.current?.timeScale().fitContent();
  }, [klines]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
