// @vitest-environment jsdom
/**
 * InsightsPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InsightsPage } from './InsightsPage';

// mock task store:空任务,所有统计为 0
vi.mock('../store/taskStore', () => {
  const state = { tasks: [] };
  return { useTaskStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock 共享 store:空项目/习惯/目标(D5 建议引擎需读取这三类数据)
vi.mock('../../shared/store', () => {
  const state = { projects: [], habits: [], goals: [] };
  return { useAppStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

describe('InsightsPage', () => {
  it('渲染时不崩溃', () => {
    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );
  });

  it('显示"统计仪表"标题', () => {
    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '统计仪表' })).toBeInTheDocument();
  });

  it('渲染 Karma 分数区与近 14 天趋势区', () => {
    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Karma 分数')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '近 14 天完成趋势' })).toBeInTheDocument();
  });
});
