// @vitest-environment jsdom
/**
 * TimeCapsulePage 测试(s1)
 *
 * 覆盖:
 * - 渲染不崩溃 + 标题/简介展示
 * - 空态:无胶囊时显示 EmptyState
 * - 列表:仅展示 type === 'timeCapsule' 的 VaultItem(过滤掉普通保险库项)
 * - 排序:锁定中的胶囊按 unlockAt 升序排在前,已解锁的排后
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { VaultItem } from '../../shared/types';
import { TimeCapsulePage } from './TimeCapsulePage';

// 默认空 store;各测试通过 setMockVaultItems 注入数据。
let mockItems: VaultItem[] = [];

vi.mock('../store/vaultStore', () => {
  const getState = () => ({
    items: mockItems,
    loading: false,
    fetch: () => {},
    create: () => {},
    update: () => {},
    delete: () => {},
    generatePassword: async () => '',
  });
  return {
    useVaultStore: (selector?: (s: ReturnType<typeof getState>) => unknown) =>
      selector ? selector(getState()) : getState(),
  };
});

function makeCapsule(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'cap-1',
    type: 'timeCapsule',
    title: '一封胶囊',
    fields: [{ id: 'f1', name: 'message', value: '未来的你好', isSensitive: true }],
    isHidden: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    timeCapsule: { unlockAt: new Date(Date.now() + 86_400_000).toISOString() },
    ...overrides,
  };
}

function makeVaultItem(): VaultItem {
  return {
    id: 'pwd-1',
    type: 'password',
    title: 'GitHub 账号',
    fields: [{ id: 'f1', name: '密码', value: 'secret', isSensitive: true }],
    isHidden: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  mockItems = [];
});

describe('TimeCapsulePage', () => {
  it('渲染时不崩溃并展示标题与简介', () => {
    render(
      <MemoryRouter>
        <TimeCapsulePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '加密时间胶囊' })).toBeInTheDocument();
    // 简介:关键词 "写给未来自己"
    expect(screen.getByText(/写给未来自己/)).toBeInTheDocument();
  });

  it('无胶囊时显示空态', () => {
    render(
      <MemoryRouter>
        <TimeCapsulePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('还没有胶囊')).toBeInTheDocument();
  });

  it('过滤掉普通保险库项,仅展示时间胶囊', () => {
    mockItems = [makeVaultItem(), makeCapsule({ id: 'cap-1', title: '第一封信' })];
    render(
      <MemoryRouter>
        <TimeCapsulePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('第一封信')).toBeInTheDocument();
    expect(screen.queryByText('GitHub 账号')).not.toBeInTheDocument();
  });

  it('锁定中的胶囊按 unlockAt 升序排列在前', () => {
    const now = Date.now();
    mockItems = [
      makeCapsule({ id: 'cap-late', title: '后解锁', timeCapsule: { unlockAt: new Date(now + 7 * 86_400_000).toISOString() } }),
      makeCapsule({ id: 'cap-soon', title: '先解锁', timeCapsule: { unlockAt: new Date(now + 86_400_000).toISOString() } }),
    ];
    const { container } = render(
      <MemoryRouter>
        <TimeCapsulePage />
      </MemoryRouter>,
    );
    const titles = Array.from(container.querySelectorAll('h3')).map((h) => h.textContent);
    expect(titles).toEqual(['先解锁', '后解锁']);
  });

  it('已解锁胶囊也展示(排在锁定胶囊之后)', () => {
    const now = Date.now();
    mockItems = [
      makeCapsule({ id: 'cap-locked', title: '锁着', timeCapsule: { unlockAt: new Date(now + 86_400_000).toISOString() } }),
      makeCapsule({ id: 'cap-open', title: '已开', timeCapsule: { unlockAt: new Date(now - 86_400_000).toISOString() } }),
    ];
    render(
      <MemoryRouter>
        <TimeCapsulePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('锁着')).toBeInTheDocument();
    expect(screen.getByText('已开')).toBeInTheDocument();
  });
});
