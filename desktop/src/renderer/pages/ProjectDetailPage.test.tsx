// @vitest-environment jsdom
/**
 * ProjectDetailPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在
 *
 * 说明:用空 projects 渲染,命中"项目不存在"分支(mock store 中无对应 id 的项目)。
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProjectDetailPage } from './ProjectDetailPage';

// mock 共享 store:空项目,使 useParams 取到的 id 找不到 project
vi.mock('../../shared/store', () => {
  const state = { projects: [], updateProject: () => {}, deleteProject: () => {} };
  return { useAppStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock task store:空任务
vi.mock('../store/taskStore', () => {
  const state = { tasks: [] };
  return { useTaskStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProjectDetailPage', () => {
  it('渲染时不崩溃', () => {
    renderAt('/projects/missing-id');
  });

  it('项目不存在时显示提示文案', () => {
    renderAt('/projects/missing-id');
    expect(screen.getByText('项目不存在或已被删除')).toBeInTheDocument();
  });

  it('项目不存在时显示返回项目列表入口', () => {
    renderAt('/projects/missing-id');
    expect(screen.getByRole('link', { name: '返回项目列表' })).toBeInTheDocument();
  });
});
