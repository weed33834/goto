// @vitest-environment jsdom
/**
 * ConflictDialog 测试(P1-3)
 *
 * 覆盖:
 * - activeModal !== 'conflict-dialog' 时不渲染
 * - 无未决冲突时不渲染(即使 activeModal 打开)
 * - 打开时渲染元数据(recordId/tableName/peerDeviceId)+ 双栏对比 + 决策按钮
 * - SMK 缺失时降级展示元数据 + 解密失败提示
 * - 点击「保留本地」→ setConflictResolution(local)
 * - 点击「接受远端」→ setConflictResolution(remote)
 * - 处理完所有未决冲突后自动关闭(setActiveModal(null) + clearResolvedConflicts)
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAppStore } from '../../../shared/store';
import { ConflictDialog } from './ConflictDialog';
import type { SyncRecord } from '../../../shared/sync/syncStorage';
import type { PendingConflict } from '../../../shared/store/slices/syncSlice';

// mock authStore / themeStore:与 CommandPalette.test 一致,避免真实认证/主题副作用。
const lockMock = vi.fn();
vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector?: (s: { lock: () => void }) => unknown) =>
    selector ? selector({ lock: lockMock }) : { lock: lockMock },
}));
const setModeMock = vi.fn();
vi.mock('../../store/themeStore', () => ({
  useThemeStore: (selector?: (s: { mode: string; setMode: (m: string) => void }) => unknown) =>
    selector ? selector({ mode: 'system', setMode: setModeMock }) : { mode: 'system', setMode: setModeMock },
}));

// mock loadSyncMasterKey:默认返回 null(SMK 未就绪),触发降级展示路径。
// 组件只用 loadSyncMasterKey 一个运行时导出,其余是 type-only(编译期擦除)。
import { loadSyncMasterKey } from '../../../shared/sync/syncStorage';
vi.mock('../../../shared/sync/syncStorage', () => ({
  loadSyncMasterKey: vi.fn().mockResolvedValue(null),
}));

function makeSyncRecord(recordId: string, updatedAt: number): SyncRecord {
  // 真实加密太重,这里 encryptedPayload 用占位字节。SMK mock 为 null 时不会解密,
  // 测试仅验证降级路径(元数据展示)。解密成功路径单独测。
  return {
    id: `rec-${recordId}`,
    tableName: 'tasks',
    recordId,
    version: 1,
    encryptedPayload: new Uint8Array([1, 2, 3]),
    updatedAt,
    deleted: 0,
    deviceVersion: { 'device-A': 1 },
  };
}

/** pushConflict 的入参类型(去掉 id/occurredAt/resolution/applied 这些内部生成字段)。 */
type PushConflictInput = Omit<PendingConflict, 'id' | 'occurredAt' | 'resolution' | 'applied'>;

function pushOneConflict(overrides: Partial<PushConflictInput> = {}) {
  useAppStore.getState().pushConflict({
    recordId: 'task-conflict-1',
    tableName: 'tasks',
    peerDeviceId: 'peer-device-0123456789abcdef',
    localRecord: makeSyncRecord('task-conflict-1', 1000),
    remoteRecord: makeSyncRecord('task-conflict-1', 2000),
    ...overrides,
  });
}

beforeEach(() => {
  useAppStore.setState({
    activeModal: null,
    pendingConflicts: [],
    tasks: [],
  });
  vi.mocked(loadSyncMasterKey).mockResolvedValue(null);
});

describe('ConflictDialog', () => {
  it('activeModal 非 conflict-dialog 时不渲染', () => {
    pushOneConflict();
    useAppStore.setState({ activeModal: null });
    render(<ConflictDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('activeModal=conflict-dialog 但无未决冲突时不渲染', () => {
    useAppStore.setState({ activeModal: 'conflict-dialog', pendingConflicts: [] });
    render(<ConflictDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('打开且有未决冲突时渲染对话框 + 元数据 + 决策按钮', async () => {
    pushOneConflict();
    useAppStore.setState({ activeModal: 'conflict-dialog' });
    render(<ConflictDialog />);

    // 等待解密 effect 完成(SMK=null 走降级路径,异步)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // 元数据:recordId / tableName / peerDeviceId
    expect(screen.getByText('task-conflict-1')).toBeInTheDocument();
    expect(screen.getByText('tasks')).toBeInTheDocument();
    // 决策按钮
    expect(screen.getByText('保留本地')).toBeInTheDocument();
    expect(screen.getByText('接受远端')).toBeInTheDocument();
    // 剩余计数
    expect(screen.getByText(/剩余 1/)).toBeInTheDocument();
  });

  it('SMK 缺失时展示解密失败提示(降级路径)', async () => {
    pushOneConflict();
    useAppStore.setState({ activeModal: 'conflict-dialog' });
    render(<ConflictDialog />);

    await waitFor(() => {
      expect(screen.getByText(/SMK 未就绪|解密失败/)).toBeInTheDocument();
    });
  });

  it('点击「保留本地」→ setConflictResolution(local),applied 仍为 false', async () => {
    // 推入两条冲突:决第一条后第二条仍未决,避免 auto-close effect 干扰断言。
    pushOneConflict({ recordId: 'task-1' });
    pushOneConflict({ recordId: 'task-2' });
    useAppStore.setState({ activeModal: 'conflict-dialog' });
    render(<ConflictDialog />);

    await waitFor(() => {
      expect(screen.getByText('保留本地')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('保留本地'));

    await waitFor(() => {
      const resolved = useAppStore.getState().pendingConflicts.find((c) => c.recordId === 'task-1');
      expect(resolved?.resolution).toBe('local');
      expect(resolved?.applied).toBe(false); // 等回滚
    });
  });

  it('点击「接受远端」→ setConflictResolution(remote),applied 立即 true', async () => {
    // 推入两条冲突:决第一条后第二条仍未决,避免 auto-close effect 清空数组导致断言失败。
    pushOneConflict({ recordId: 'task-1' });
    pushOneConflict({ recordId: 'task-2' });
    useAppStore.setState({ activeModal: 'conflict-dialog' });
    render(<ConflictDialog />);

    await waitFor(() => {
      expect(screen.getByText('接受远端')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('接受远端'));

    // 第一条被决为 remote(applied=true),仍在数组中(因第二条未决,auto-close 不触发)。
    // 用 waitFor 等待 effect(flushOutbox setActiveModal)执行完毕,避免 act 警告。
    await waitFor(() => {
      const resolved = useAppStore.getState().pendingConflicts.find((c) => c.recordId === 'task-1');
      expect(resolved?.resolution).toBe('remote');
      expect(resolved?.applied).toBe(true);
    });
  });

  it('所有未决冲突处理完后自动关闭对话框 + 清理已解决冲突', async () => {
    pushOneConflict();
    useAppStore.setState({ activeModal: 'conflict-dialog' });
    render(<ConflictDialog />);

    await waitFor(() => {
      expect(screen.getByText('接受远端')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('接受远端'));

    // 唯一冲突被决为 remote(applied=true)→ 无未决 → effect 自动 setActiveModal(null)
    await waitFor(() => {
      expect(useAppStore.getState().activeModal).toBeNull();
    });
    // clearResolvedConflicts 被触发,已解决冲突被清理
    expect(useAppStore.getState().pendingConflicts).toHaveLength(0);
  });

  it('多条冲突逐条处理:决完一条后自动跳到下一条', async () => {
    pushOneConflict({ recordId: 'task-1' });
    pushOneConflict({ recordId: 'task-2' });
    useAppStore.setState({ activeModal: 'conflict-dialog' });
    render(<ConflictDialog />);

    // 第一条:剩余 2
    await waitFor(() => {
      expect(screen.getByText(/剩余 2/)).toBeInTheDocument();
    });
    expect(screen.getByText('task-1')).toBeInTheDocument();

    // 决第一条(remote)
    fireEvent.click(screen.getByText('接受远端'));

    // 自动跳到第二条:剩余 1,展示 task-2
    await waitFor(() => {
      expect(screen.getByText(/剩余 1/)).toBeInTheDocument();
    });
    expect(screen.getByText('task-2')).toBeInTheDocument();
    // 第一条已 applied=true 但还在数组里(等 clearResolvedConflicts 在关闭时清理)
    expect(useAppStore.getState().pendingConflicts).toHaveLength(2);

    // 决第二条 → 自动关闭 + 清理
    fireEvent.click(screen.getByText('接受远端'));
    await waitFor(() => {
      expect(useAppStore.getState().activeModal).toBeNull();
    });
    expect(useAppStore.getState().pendingConflicts).toHaveLength(0);
  });

  it('关闭按钮:不强制解决,未决冲突保留', async () => {
    pushOneConflict();
    useAppStore.setState({ activeModal: 'conflict-dialog' });
    render(<ConflictDialog />);

    await waitFor(() => {
      expect(screen.getByText('关闭')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('关闭'));

    expect(useAppStore.getState().activeModal).toBeNull();
    // 冲突仍未决,保留在列表中(SyncSettingsPanel 横幅可重新唤起)
    expect(useAppStore.getState().pendingConflicts).toHaveLength(1);
    expect(useAppStore.getState().pendingConflicts[0].resolution).toBeNull();
  });
});
