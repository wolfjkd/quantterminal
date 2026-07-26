/** vitest 测试环境 setup
 *
 * - 注册 @testing-library/jest-dom 自定义匹配器
 * - 全局清理（每个用例后）
 * - mock 浏览器 API（matchMedia / ResizeObserver）
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// Mock matchMedia（Antd 组件依赖，jsdom 不提供）
if (!window.matchMedia) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Mock ResizeObserver（lightweight-charts 依赖，jsdom 不提供）
// 注意：必须用真正的 function/class，因为业务代码用 `new ResizeObserver(cb)`
//  - vitest 4 不再允许 vi.fn().mockImplementation(...) 作为构造函数
if (!window.ResizeObserver) {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
}
