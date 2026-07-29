// @vitest-environment jsdom
/**
 * TimeCapsuleCard 测试(s1)
 *
 * 覆盖:
 * - 锁定状态:展示倒计时,消息内容遮蔽,无「展开查看」按钮,无「编辑」按钮
 * - 锁定状态:仍可点击「删除」
 * - 解锁状态:展示「展开查看」按钮 + 「编辑」按钮
 * - 解锁状态:点击「展开查看」后展示明文,且出现「隐藏」按钮
 * - 点击「编辑」切换到 TimeCapsuleEditor(出现表单)
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { VaultItem } from '../../../shared/types';
import { TimeCapsuleCard } from './TimeCapsuleCard';

const { deleteMock, updateMock, createMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  updateMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock('../../store/vaultStore', () => {
  const state = {
    items: [],
    loading: false,
    fetch: () => {},
    create: createMock,
    update: updateMock,
    delete: deleteMock,
    generatePassword: async () => '',
  };
  return {
    useVaultStore: (selector?: (s: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

function makeCapsule(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'cap-1',
    type: 'timeCapsule',
    title: '一封信',
    fields: [{ id: 'f1', name: 'message', value: '秘密内容', isSensitive: true }],
    isHidden: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    timeCapsule: { unlockAt: new Date(Date.now() + 86_400_000).toISOString() },
    ...overrides,
  };
}

beforeEach(() => {
  deleteMock.mockClear();
  updateMock.mockClear();
  createMock.mockClear();
});

describe('TimeCapsuleCard', () => {
  it('锁定状态:展示倒计时,消息遮蔽,无展开/编辑入口', () => {
    render(
      <MemoryRouter>
        <TimeCapsuleCard item={makeCapsule()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/解锁于/)).toBeInTheDocument();
    expect(screen.getByText(/倒计时/)).toBeInTheDocument();
    // 消息遮蔽
    expect(screen.getByText('••••••••')).toBeInTheDocument();
    expect(screen.queryByText('秘密内容')).not.toBeInTheDocument();
    expect(screen.queryByText('展开查看')).not.toBeInTheDocument();
    expect(screen.queryByText('编辑')).not.toBeInTheDocument();
  });

  it('锁定状态:仍允许删除', () => {
    render(
      <MemoryRouter>
        <TimeCapsuleCard item={makeCapsule()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('删除'));
    expect(deleteMock).toHaveBeenCalledWith('cap-1');
  });

  it('解锁状态:展示「展开查看」与「编辑」按钮', () => {
    const unlocked = makeCapsule({
      timeCapsule: { unlockAt: new Date(Date.now() - 1000).toISOString() },
    });
    render(
      <MemoryRouter>
        <TimeCapsuleCard item={unlocked} />
      </MemoryRouter>,
    );
    expect(screen.getByText('已解锁 · 可查看明文')).toBeInTheDocument();
    expect(screen.getByText('展开查看')).toBeInTheDocument();
    expect(screen.getByText('编辑')).toBeInTheDocument();
  });

  it('解锁状态:点击「展开查看」展示明文,并出现「隐藏」按钮', () => {
    const unlocked = makeCapsule({
      timeCapsule: { unlockAt: new Date(Date.now() - 1000).toISOString() },
    });
    render(
      <MemoryRouter>
        <TimeCapsuleCard item={unlocked} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('展开查看'));
    expect(screen.getByText('秘密内容')).toBeInTheDocument();
    expect(screen.getByText('隐藏')).toBeInTheDocument();
  });

  it('点击「编辑」切换到 TimeCapsuleEditor 表单', () => {
    const unlocked = makeCapsule({
      timeCapsule: { unlockAt: new Date(Date.now() - 1000).toISOString() },
    });
    render(
      <MemoryRouter>
        <TimeCapsuleCard item={unlocked} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('编辑'));
    // 表单中出现「保存修改」按钮
    expect(screen.getByText('保存修改')).toBeInTheDocument();
    // 表单中出现「解锁时间在创建后不可修改」的提示
    expect(screen.getByText(/解锁时间在创建后不可修改/)).toBeInTheDocument();
  });
});
