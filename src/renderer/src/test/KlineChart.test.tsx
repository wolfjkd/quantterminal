/** KlineChart 组件渲染测试 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import KlineChart from '../components/KlineChart';

// Mock lightweight-charts（避免 jsdom 不支持 canvas/ResizeObserver 等高级 API）
vi.mock('lightweight-charts', () => {
  const mockSetData = vi.fn();
  const mockFitContent = vi.fn();
  const mockApplyOptions = vi.fn();
  const mockAddCandlestickSeries = vi.fn(() => ({ setData: mockSetData }));
  const mockAddHistogramSeries = vi.fn(() => ({ setData: mockSetData }));
  const mockPriceScale = vi.fn(() => ({ applyOptions: mockApplyOptions }));
  const mockTimeScale = vi.fn(() => ({ fitContent: mockFitContent }));
  const mockRemove = vi.fn();
  return {
    createChart: vi.fn(() => ({
      addCandlestickSeries: mockAddCandlestickSeries,
      addHistogramSeries: mockAddHistogramSeries,
      priceScale: mockPriceScale,
      timeScale: mockTimeScale,
      applyOptions: mockApplyOptions,
      remove: mockRemove,
    })),
    ColorType: { Solid: 'solid' },
    CrosshairMode: { Normal: 1 },
  };
});

describe('KlineChart', () => {
  it('renders empty container with no klines', () => {
    const { container } = render(<KlineChart klines={[]} height={300} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders with klines data', () => {
    const klines = [
      { date: '2026-01-01', open: 10, high: 11, low: 9, close: 10.5, volume: 1000 },
      { date: '2026-01-02', open: 10.5, high: 11, low: 10, close: 10.2, volume: 800 },
    ];
    const { container } = render(<KlineChart klines={klines} height={300} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('respects height prop', () => {
    const { container } = render(<KlineChart klines={[]} height={500} />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.height).toBe('500px');
  });
});
