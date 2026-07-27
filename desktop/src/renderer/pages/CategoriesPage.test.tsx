// @vitest-environment jsdom
/**
 * CategoriesPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CategoriesPage } from './CategoriesPage';

// mock 共享 store:空分类,走 EmptyState 分支
vi.mock('../../shared/store', () => {
  const state = { categories: [], addCategory: () => {}, deleteCategory: () => {} };
  return { useAppStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

describe('CategoriesPage', () => {
  it('渲染时不崩溃', () => {
    render(
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>,
    );
  });

  it('显示"分类"标题', () => {
    render(
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '分类' })).toBeInTheDocument();
  });

  it('无分类时显示空态提示', () => {
    render(
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('暂无分类')).toBeInTheDocument();
  });
});
