// @vitest-environment jsdom
/**
 * TodayPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TodayPage } from './TodayPage';

// mock task store:返回空任务,让 TaskList 走空态分支
vi.mock('../store/taskStore', () => {
  const state = {
    tasks: [],
    loading: false,
    fetch: () => {},
    create: () => {},
    update: () => {},
    delete: () => {},
  };
  return { useTaskStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock 共享 store:TaskList 子组件会读 useAppStore(projects / reorderTasks 等)
vi.mock('../../shared/store', () => {
  const state = {
    projects: [],
    categories: [],
    tags: [],
    tasks: [],
    reorderTasks: () => {},
  };
  return { useAppStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock 首砖分享 hook:返回 null,避免触发 lazy 加载的 ShareBrickModal
vi.mock('../features/share/useFirstBrickShare', () => ({
  useFirstBrickShare: () => ({ shareTask: null, dismiss: () => {} }),
}));

describe('TodayPage', () => {
  it('渲染时不崩溃', () => {
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
  });

  it('显示"今日任务"标题', () => {
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '今日任务' })).toBeInTheDocument();
  });

  it('渲染过滤标签 tablist', () => {
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('tablist', { name: '任务过滤' })).toBeInTheDocument();
  });
});
