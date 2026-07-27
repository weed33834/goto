// @vitest-environment jsdom
/**
 * SearchPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SearchPage } from './SearchPage';

// mock 共享 store:空 tasks + 空 searchHistory
vi.mock('../../shared/store', () => {
  const state = {
    tasks: [],
    searchHistory: [],
    addSearchToHistory: () => {},
    clearSearchHistory: () => {},
  };
  return { useAppStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock task store:SearchPage 通过 TaskCard 间接 import taskStore,
// 不 mock 会导致真实 taskStore 模块初始化时调用 useAppStore.subscribe(已被 mock 掉)而报错
vi.mock('../store/taskStore', () => {
  const state = { tasks: [], loading: false, fetch: () => {}, create: () => {}, update: () => {}, delete: () => {} };
  return { useTaskStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

describe('SearchPage', () => {
  it('渲染时不崩溃', () => {
    render(
      <MemoryRouter>
        <SearchPage />
      </MemoryRouter>,
    );
  });

  it('显示"搜索"标题', () => {
    render(
      <MemoryRouter>
        <SearchPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '搜索' })).toBeInTheDocument();
  });

  it('渲染搜索表单与搜索按钮', () => {
    render(
      <MemoryRouter>
        <SearchPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: '搜索' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索任务标题或描述...')).toBeInTheDocument();
  });
});
