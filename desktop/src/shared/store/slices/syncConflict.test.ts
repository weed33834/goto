// P1-3 冲突解决 UI — syncSlice 冲突管理方法单测。
//
// 覆盖:
// - pendingConflicts 初始为空
// - pushConflict:新增未决冲突 + 同 recordId 未决只保留最新
// - setConflictResolution:'local' 不立即 applied,'remote' 直接 applied=true
// - markConflictApplied:标记单条 applied
// - clearResolvedConflicts:清掉所有 applied=true 的条目,保留未决
//
// 不测 useSyncScheduler 的回滚执行(那需要真实 SyncStore + SMK,归 multiDeviceSync.test.ts)。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../index';
import { defaultTheme } from '../constants';
import type { SyncRecord } from '../../sync/syncStorage';

// Mock API:performSync 不应在此测试触发,但 store 初始化可能间接调用。
vi.mock('../../api', () => ({
  isApiAvailable: vi.fn().mockResolvedValue(false),
  fetchTasks: vi.fn().mockResolvedValue([]),
  fetchProjects: vi.fn().mockResolvedValue([]),
  fetchCategories: vi.fn().mockResolvedValue([]),
  fetchTags: vi.fn().mockResolvedValue([]),
  fetchTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

// Mock syncIdentity:避免 ensureDeviceIdentity 触发真实 Ed25519 生成。
vi.mock('../../sync/syncIdentity', () => ({
  generateDeviceIdentity: vi.fn(),
  loadDeviceIdentity: vi.fn().mockResolvedValue(null),
}));

/** 构造一条 SyncRecord,encryptedPayload 用空 Uint8Array(本测试不解密)。 */
function makeSyncRecord(recordId: string, updatedAt: number): SyncRecord {
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

beforeEach(() => {
  useAppStore.setState({
    tasks: [],
    projects: [],
    categories: [],
    tags: [],
    syncConfig: {
      enabled: false,
      provider: 'expo',
      syncInterval: 15,
      lastSyncAt: null,
      syncStatus: 'idle',
      conflictStrategy: 'merge',
      autoSync: false,
      syncOnStart: false,
      syncOnEdit: false,
      wifiOnly: false,
      credentials: null,
      syncProtocol: 'http-rest',
      deviceId: null,
      relayUrl: null,
      pairedDevices: [],
    },
    lastSyncAt: null,
    isSyncing: false,
    apiAvailable: false,
    currentDeviceId: null,
    pendingConflicts: [],
    theme: defaultTheme,
  });
});

describe('syncSlice — P1-3 冲突管理方法', () => {
  it('初始状态:pendingConflicts 为空数组', () => {
    expect(useAppStore.getState().pendingConflicts).toEqual([]);
  });

  it('pushConflict:新增一条未决冲突,resolution=null applied=false', () => {
    const before = Date.now();
    useAppStore.getState().pushConflict({
      recordId: 'task-1',
      tableName: 'tasks',
      peerDeviceId: 'peer-abc',
      localRecord: makeSyncRecord('task-1', 1000),
      remoteRecord: makeSyncRecord('task-1', 2000),
    });

    const conflicts = useAppStore.getState().pendingConflicts;
    expect(conflicts).toHaveLength(1);
    const c = conflicts[0];
    expect(c.id).toEqual(expect.any(String));
    expect(c.recordId).toBe('task-1');
    expect(c.tableName).toBe('tasks');
    expect(c.peerDeviceId).toBe('peer-abc');
    expect(c.localRecord).not.toBeNull();
    expect(c.remoteRecord).not.toBeNull();
    expect(c.resolution).toBeNull();
    expect(c.applied).toBe(false);
    expect(c.occurredAt).toBeGreaterThanOrEqual(before);
  });

  it('pushConflict:同 recordId 未决冲突只保留最新一条(避免堆积)', () => {
    useAppStore.getState().pushConflict({
      recordId: 'task-1',
      tableName: 'tasks',
      peerDeviceId: 'peer-A',
      localRecord: makeSyncRecord('task-1', 1000),
      remoteRecord: makeSyncRecord('task-1', 1000),
    });
    useAppStore.getState().pushConflict({
      recordId: 'task-1',
      tableName: 'tasks',
      peerDeviceId: 'peer-B',
      localRecord: makeSyncRecord('task-1', 2000),
      remoteRecord: makeSyncRecord('task-1', 2000),
    });

    const conflicts = useAppStore.getState().pendingConflicts;
    // 第二条覆盖第一条(同 recordId 未决只留最新)
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].peerDeviceId).toBe('peer-B');
  });

  it('pushConflict:不同 recordId 的冲突各自保留', () => {
    useAppStore.getState().pushConflict({
      recordId: 'task-1',
      tableName: 'tasks',
      peerDeviceId: 'peer-A',
      localRecord: makeSyncRecord('task-1', 1000),
      remoteRecord: makeSyncRecord('task-1', 1000),
    });
    useAppStore.getState().pushConflict({
      recordId: 'task-2',
      tableName: 'tasks',
      peerDeviceId: 'peer-A',
      localRecord: makeSyncRecord('task-2', 1000),
      remoteRecord: makeSyncRecord('task-2', 1000),
    });

    const conflicts = useAppStore.getState().pendingConflicts;
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => c.recordId).sort()).toEqual(['task-1', 'task-2']);
  });

  it('setConflictResolution(local):resolution=local 但 applied 仍为 false(等回滚)', () => {
    useAppStore.getState().pushConflict({
      recordId: 'task-1',
      tableName: 'tasks',
      peerDeviceId: 'peer-A',
      localRecord: makeSyncRecord('task-1', 1000),
      remoteRecord: makeSyncRecord('task-1', 1000),
    });
    const id = useAppStore.getState().pendingConflicts[0].id;

    useAppStore.getState().setConflictResolution(id, 'local');

    const c = useAppStore.getState().pendingConflicts[0];
    expect(c.resolution).toBe('local');
    expect(c.applied).toBe(false); // 等待 useSyncScheduler 回滚后 markApplied
  });

  it('setConflictResolution(remote):resolution=remote 且 applied 立即为 true(无需回滚)', () => {
    useAppStore.getState().pushConflict({
      recordId: 'task-1',
      tableName: 'tasks',
      peerDeviceId: 'peer-A',
      localRecord: makeSyncRecord('task-1', 1000),
      remoteRecord: makeSyncRecord('task-1', 1000),
    });
    const id = useAppStore.getState().pendingConflicts[0].id;

    useAppStore.getState().setConflictResolution(id, 'remote');

    const c = useAppStore.getState().pendingConflicts[0];
    expect(c.resolution).toBe('remote');
    expect(c.applied).toBe(true); // remote 无需回滚,直接标记完成
  });

  it('setConflictResolution:不影响其他冲突', () => {
    useAppStore.getState().pushConflict({
      recordId: 'task-1',
      tableName: 'tasks',
      peerDeviceId: 'peer-A',
      localRecord: makeSyncRecord('task-1', 1000),
      remoteRecord: makeSyncRecord('task-1', 1000),
    });
    useAppStore.getState().pushConflict({
      recordId: 'task-2',
      tableName: 'tasks',
      peerDeviceId: 'peer-A',
      localRecord: makeSyncRecord('task-2', 1000),
      remoteRecord: makeSyncRecord('task-2', 1000),
    });
    const [c1, c2] = useAppStore.getState().pendingConflicts;

    useAppStore.getState().setConflictResolution(c1.id, 'remote');

    const state = useAppStore.getState().pendingConflicts;
    const updated = state.find((c) => c.id === c1.id);
    const untouched = state.find((c) => c.id === c2.id);
    expect(updated?.resolution).toBe('remote');
    expect(updated?.applied).toBe(true);
    expect(untouched?.resolution).toBeNull();
    expect(untouched?.applied).toBe(false);
  });

  it('markConflictApplied:把指定冲突标记 applied=true', () => {
    useAppStore.getState().pushConflict({
      recordId: 'task-1',
      tableName: 'tasks',
      peerDeviceId: 'peer-A',
      localRecord: makeSyncRecord('task-1', 1000),
      remoteRecord: makeSyncRecord('task-1', 1000),
    });
    const id = useAppStore.getState().pendingConflicts[0].id;

    useAppStore.getState().setConflictResolution(id, 'local');
    expect(useAppStore.getState().pendingConflicts[0].applied).toBe(false);

    useAppStore.getState().markConflictApplied(id);
    expect(useAppStore.getState().pendingConflicts[0].applied).toBe(true);
  });

  it('clearResolvedConflicts:清除 applied=true,保留未决与已决未应用的', () => {
    // c1: 未决
    useAppStore.getState().pushConflict({
      recordId: 'task-1',
      tableName: 'tasks',
      peerDeviceId: 'peer-A',
      localRecord: makeSyncRecord('task-1', 1000),
      remoteRecord: makeSyncRecord('task-1', 1000),
    });
    // c2: 已决 remote → applied=true
    useAppStore.getState().pushConflict({
      recordId: 'task-2',
      tableName: 'tasks',
      peerDeviceId: 'peer-A',
      localRecord: makeSyncRecord('task-2', 1000),
      remoteRecord: makeSyncRecord('task-2', 1000),
    });
    // c3: 已决 local 但未 applied(回滚中)
    useAppStore.getState().pushConflict({
      recordId: 'task-3',
      tableName: 'tasks',
      peerDeviceId: 'peer-A',
      localRecord: makeSyncRecord('task-3', 1000),
      remoteRecord: makeSyncRecord('task-3', 1000),
    });

    const [, c2, c3] = useAppStore.getState().pendingConflicts;
    useAppStore.getState().setConflictResolution(c2.id, 'remote'); // applied=true
    useAppStore.getState().setConflictResolution(c3.id, 'local');  // applied=false

    useAppStore.getState().clearResolvedConflicts();

    const remaining = useAppStore.getState().pendingConflicts;
    // c2 被清除(applied=true),c1(未决)与 c3(local 回滚中)保留
    expect(remaining).toHaveLength(2);
    expect(remaining.map((c) => c.recordId).sort()).toEqual(['task-1', 'task-3']);
  });
});
