// @vitest-environment jsdom
/**
 * ReviewPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReviewPage } from './ReviewPage';

// mock task store:空任务,各统计区间均为 0
vi.mock('../store/taskStore', () => {
  const state = { tasks: [], update: () => {} };
  return { useTaskStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock 共享 store:空项目,不渲染项目进度区
vi.mock('../../shared/store', () => {
  const state = { projects: [] };
  return { useAppStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

describe('ReviewPage', () => {
  it('渲染时不崩溃', () => {
    render(
      <MemoryRouter>
        <ReviewPage />
      </MemoryRouter>,
    );
  });

  it('显示"每周回顾"标题', () => {
    render(
      <MemoryRouter>
        <ReviewPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '每周回顾' })).toBeInTheDocument();
  });

  it('渲染四个概要统计卡片', () => {
    render(
      <MemoryRouter>
        <ReviewPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('本周完成')).toBeInTheDocument();
    expect(screen.getByText('本周新建未完')).toBeInTheDocument();
    expect(screen.getByText('逾期任务')).toBeInTheDocument();
    expect(screen.getByText('本周到期')).toBeInTheDocument();
  });
});
