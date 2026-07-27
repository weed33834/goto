// @vitest-environment jsdom
/**
 * KanbanPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KanbanPage } from './KanbanPage';

// mock task store:返回空任务,5 列均为空
vi.mock('../store/taskStore', () => {
  const state = { tasks: [], update: () => {} };
  return { useTaskStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock 共享 store:看板页读 projects(项目筛选)和 reorderTasks(列内重排)
vi.mock('../../shared/store', () => {
  const state = { projects: [], reorderTasks: () => {} };
  return { useAppStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

describe('KanbanPage', () => {
  it('渲染时不崩溃', () => {
    render(
      <MemoryRouter>
        <KanbanPage />
      </MemoryRouter>,
    );
  });

  it('显示"看板"标题', () => {
    render(
      <MemoryRouter>
        <KanbanPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '看板' })).toBeInTheDocument();
  });

  it('渲染项目筛选下拉框', () => {
    render(
      <MemoryRouter>
        <KanbanPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('项目筛选')).toBeInTheDocument();
  });
});
