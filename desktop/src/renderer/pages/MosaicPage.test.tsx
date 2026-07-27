// @vitest-environment jsdom
/**
 * MosaicPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在
 *
 * 说明:MosaicView 依赖 Canvas 2D context,jsdom 不实现绘制,这里 mock 掉
 * MosaicView 组件,只验证 MosaicPage 本身的标题与统计卡渲染。
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MosaicPage } from './MosaicPage';

// mock task store:空任务,织锦统计全为 0
vi.mock('../store/taskStore', () => {
  const state = { tasks: [] };
  return { useTaskStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock MosaicView:Canvas 在 jsdom 下无法绘制,用占位 stub 替代
vi.mock('../components/mosaic/MosaicView', () => ({
  MosaicView: () => <div data-testid="mosaic-view-stub" />,
}));

describe('MosaicPage', () => {
  it('渲染时不崩溃', () => {
    render(
      <MemoryRouter>
        <MosaicPage />
      </MemoryRouter>,
    );
  });

  it('显示"时间织锦"标题', () => {
    render(
      <MemoryRouter>
        <MosaicPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '时间织锦' })).toBeInTheDocument();
  });

  it('渲染总砖数 / 当前连续 / 今日 三张统计卡', () => {
    render(
      <MemoryRouter>
        <MosaicPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('总砖数')).toBeInTheDocument();
    expect(screen.getByText('当前连续')).toBeInTheDocument();
    expect(screen.getByText('今日')).toBeInTheDocument();
  });
});
