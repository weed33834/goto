// @vitest-environment jsdom
/**
 * TagsPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TagsPage } from './TagsPage';

// mock 共享 store:空标签,走 EmptyState 分支
vi.mock('../../shared/store', () => {
  const state = { tags: [], addTag: () => {}, deleteTag: () => {} };
  return { useAppStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

describe('TagsPage', () => {
  it('渲染时不崩溃', () => {
    render(
      <MemoryRouter>
        <TagsPage />
      </MemoryRouter>,
    );
  });

  it('显示"标签"标题', () => {
    render(
      <MemoryRouter>
        <TagsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '标签' })).toBeInTheDocument();
  });

  it('无标签时显示空态提示', () => {
    render(
      <MemoryRouter>
        <TagsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('暂无标签')).toBeInTheDocument();
  });
});
