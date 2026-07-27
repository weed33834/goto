// @vitest-environment jsdom
/**
 * CalendarPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CalendarPage } from './CalendarPage';

// mock task store:空任务,useEffect 里的 fetch() 走 no-op
vi.mock('../store/taskStore', () => {
  const state = {
    tasks: [],
    loading: false,
    fetch: () => {},
    create: () => {},
  };
  return { useTaskStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

describe('CalendarPage', () => {
  it('渲染时不崩溃', () => {
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );
  });

  it('显示"日历"标题', () => {
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '日历' })).toBeInTheDocument();
  });

  it('渲染月/周/时间块三个视图切换按钮', () => {
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: '月' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '周' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '时间块' })).toBeInTheDocument();
  });
});
