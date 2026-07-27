// @vitest-environment jsdom
/**
 * VaultPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在
 *
 * 说明:VaultPage 仅渲染 h1 + VaultList。mock 掉 vaultStore(空 items)
 * 让 VaultList 走空态分支。
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VaultPage } from './VaultPage';

// mock vault store:空 items,走 EmptyState 分支
vi.mock('../store/vaultStore', () => {
  const state = {
    items: [],
    loading: false,
    fetch: () => {},
    create: () => {},
    update: () => {},
    delete: () => {},
    generatePassword: async () => '',
  };
  return { useVaultStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

describe('VaultPage', () => {
  it('渲染时不崩溃', () => {
    render(
      <MemoryRouter>
        <VaultPage />
      </MemoryRouter>,
    );
  });

  it('显示"加密保险库"标题', () => {
    render(
      <MemoryRouter>
        <VaultPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '加密保险库' })).toBeInTheDocument();
  });

  it('保险库为空时显示空态提示', () => {
    render(
      <MemoryRouter>
        <VaultPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('保险库为空')).toBeInTheDocument();
  });
});
