// @vitest-environment jsdom
/**
 * ProjectsPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectsPage } from './ProjectsPage';

// mock 共享 store:空项目列表,走 EmptyState 分支
vi.mock('../../shared/store', () => {
  const state = { projects: [], addProject: () => {}, deleteProject: () => {} };
  return { useAppStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

describe('ProjectsPage', () => {
  it('渲染时不崩溃', () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
  });

  it('显示"项目"标题', () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '项目' })).toBeInTheDocument();
  });

  it('无项目时显示空态提示', () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('暂无项目')).toBeInTheDocument();
  });
});
