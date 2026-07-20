import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../index';
import type { Task, SyncConfig, SyncConflictStrategy } from '../../types';
import { defaultTheme } from '../constants';

// Mock the API module so performSync never hits the network.
// Per-test implementations are configured in beforeEach / each test.
vi.mock('../../api', () => ({
  isApiAvailable: vi.fn(),
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchCategories: vi.fn(),
  fetchTags: vi.fn(),
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

// Mock syncIdentity：ensureDeviceIdentity 测试不依赖真实 Ed25519 密钥生成
// （慢且非确定性）。各测试通过 vi.mocked(...) 配置具体返回值。
vi.mock('../../sync/syncIdentity', () => ({
  generateDeviceIdentity: vi.fn(),
  loadDeviceIdentity: vi.fn(),
}));

import * as api from '../../api';
import * as syncIdentity from '../../sync/syncIdentity';

// Build a complete Task with sensible defaults; only id/title/updatedAt typically
// matter for sync-merge tests, but the type requires every field.
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-default',
    title: 'task',
    description: '',
    content: '',
    dueDate: null,
    dueTime: null,
    startDate: null,
    startTime: null,
    endDate: null,
    reminderDate: null,
    recurrence: null,
    priority: 'medium',
    status: 'todo',
    progress: 0,
    categoryId: null,
    projectId: null,
    tags: [],
    completed: false,
    completedAt: null,
    estimatedTime: null,
    actualTime: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    isRecurring: false,
    parentTaskId: null,
    subtasks: [],
    attachments: [],
    comments: [],
    links: [],
    customFields: [],
    location: null,
    dependencies: [],
    blockedBy: [],
    isStarred: false,
    isHidden: false,
    isArchived: false,
    notes: [],
    checklist: [],
    assigneeId: null,
    createdBy: null,
    order: 0,
    version: 0,
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

function makeSyncConfig(strategy: SyncConflictStrategy): SyncConfig {
  return {
    enabled: true,
    provider: 'expo',
    syncInterval: 15,
    lastSyncAt: null,
    syncStatus: 'idle',
    conflictStrategy: strategy,
    autoSync: false,
    syncOnStart: false,
    syncOnEdit: false,
    wifiOnly: false,
    credentials: null,
  };
}

beforeEach(() => {
  // Default: API available, remote returns empty arrays, push succeeds.
  vi.mocked(api.isApiAvailable).mockResolvedValue(true);
  vi.mocked(api.fetchTasks).mockResolvedValue([]);
  vi.mocked(api.fetchProjects).mockResolvedValue([]);
  vi.mocked(api.fetchCategories).mockResolvedValue([]);
  vi.mocked(api.fetchTags).mockResolvedValue([]);
  vi.mocked(api.createTask).mockResolvedValue(makeTask());
  vi.mocked(api.updateTask).mockResolvedValue(makeTask());

  // syncIdentity 默认：安全存储无已存身份。各 ensureDeviceIdentity 测试按需覆盖。
  vi.mocked(syncIdentity.loadDeviceIdentity).mockResolvedValue(null);
  vi.mocked(syncIdentity.generateDeviceIdentity).mockResolvedValue({
    deviceId: 'mock-device-fingerprint',
    name: 'Goto Mobile',
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nmock\n-----END PUBLIC KEY-----\n',
    privateKeyPem: '-----BEGIN PRIVATE KEY-----\nmock\n-----END PRIVATE KEY-----\n',
  });

  // Reset store to a clean baseline.
  // currentDeviceId 必须显式重置：zustand setState 浅合并，否则跨测试会残留。
  useAppStore.setState({
    tasks: [],
    projects: [],
    categories: [],
    tags: [],
    syncConfig: makeSyncConfig('merge'),
    lastSyncAt: null,
    isSyncing: false,
    apiAvailable: false,
    currentDeviceId: null,
    theme: defaultTheme,
  });
});

describe('syncSlice', () => {
  describe('performSync — preconditions & lifecycle', () => {
    it('is a no-op when isSyncing is already true', async () => {
      useAppStore.setState({ isSyncing: true, lastSyncAt: null });
      await useAppStore.getState().performSync();
      // performSync returned immediately without touching the API.
      expect(api.isApiAvailable).not.toHaveBeenCalled();
      expect(useAppStore.getState().isSyncing).toBe(true);
      expect(useAppStore.getState().lastSyncAt).toBeNull();
    });

    it('aborts cleanly when the API is unavailable, setting apiAvailable=false', async () => {
      vi.mocked(api.isApiAvailable).mockResolvedValue(false);
      await useAppStore.getState().performSync();
      expect(useAppStore.getState().isSyncing).toBe(false);
      expect(useAppStore.getState().apiAvailable).toBe(false);
      expect(api.fetchTasks).not.toHaveBeenCalled();
      expect(useAppStore.getState().lastSyncAt).toBeNull();
    });

    it('sets apiAvailable=true, fetches remote, and stamps lastSyncAt on a successful sync', async () => {
      const before = Date.now();
      await useAppStore.getState().performSync();
      expect(useAppStore.getState().apiAvailable).toBe(true);
      expect(useAppStore.getState().isSyncing).toBe(false);
      expect(useAppStore.getState().lastSyncAt).toBeInstanceOf(Date);
      expect(useAppStore.getState().lastSyncAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(api.fetchTasks).toHaveBeenCalledTimes(1);
      expect(api.fetchProjects).toHaveBeenCalledTimes(1);
      expect(api.fetchCategories).toHaveBeenCalledTimes(1);
      expect(api.fetchTags).toHaveBeenCalledTimes(1);
    });
  });

  describe('performSync — conflict merge strategies', () => {
    it('merge strategy: keeps local when local.updatedAt is newer than remote', async () => {
      const local = makeTask({
        id: 'shared',
        title: 'local-version',
        updatedAt: new Date('2026-06-10T00:00:00.000Z'),
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote-version',
        updatedAt: new Date('2026-06-01T00:00:00.000Z'), // older
      });
      useAppStore.setState({ tasks: [local] });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      const tasks = useAppStore.getState().tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('local-version'); // local kept (newer)
    });

    it('merge strategy: takes remote when remote.updatedAt is newer than local', async () => {
      const local = makeTask({
        id: 'shared',
        title: 'local-version',
        updatedAt: new Date('2026-06-01T00:00:00.000Z'), // older
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote-version',
        updatedAt: new Date('2026-06-10T00:00:00.000Z'), // newer
      });
      useAppStore.setState({ tasks: [local] });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      const tasks = useAppStore.getState().tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('remote-version'); // remote wins (newer)
    });

    it('merge strategy: keeps local when timestamps are equal', async () => {
      const ts = new Date('2026-06-05T00:00:00.000Z');
      const local = makeTask({ id: 'shared', title: 'local', updatedAt: ts });
      const remote = makeTask({ id: 'shared', title: 'remote', updatedAt: ts });
      useAppStore.setState({ tasks: [local] });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      // remote > local is strict (>) so equal timestamps keep local.
      expect(useAppStore.getState().tasks[0].title).toBe('local');
    });

    it('remote strategy: always takes the remote version regardless of timestamps', async () => {
      const local = makeTask({
        id: 'shared',
        title: 'local',
        updatedAt: new Date('2026-12-31T00:00:00.000Z'), // much newer
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'), // much older
      });
      useAppStore.setState({
        tasks: [local],
        syncConfig: makeSyncConfig('remote'),
      });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      expect(useAppStore.getState().tasks[0].title).toBe('remote');
    });

    it('local strategy: always keeps the local version regardless of timestamps', async () => {
      const local = makeTask({
        id: 'shared',
        title: 'local',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'), // much older
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote',
        updatedAt: new Date('2026-12-31T00:00:00.000Z'), // much newer
      });
      useAppStore.setState({
        tasks: [local],
        syncConfig: makeSyncConfig('local'),
      });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      expect(useAppStore.getState().tasks[0].title).toBe('local');
    });

    it('all strategies pull remote-only tasks (new on remote, absent locally) into local', async () => {
      for (const strategy of ['merge', 'remote', 'local'] as SyncConflictStrategy[]) {
        useAppStore.setState({
          tasks: [],
          syncConfig: makeSyncConfig(strategy),
          isSyncing: false,
        });
        const remoteOnly = makeTask({ id: 'remote-new', title: 'From remote' });
        vi.mocked(api.fetchTasks).mockResolvedValue([remoteOnly]);

        await useAppStore.getState().performSync();

        const tasks = useAppStore.getState().tasks;
        expect(tasks).toHaveLength(1);
        expect(tasks[0].id).toBe('remote-new');
        expect(tasks[0].title).toBe('From remote');
      }
    });
  });

  describe('performSync — push behavior', () => {
    it('pushes local-only tasks (absent on remote) to the API via createTask', async () => {
      const localOnly = makeTask({ id: 'local-new', title: 'Local only' });
      useAppStore.setState({ tasks: [localOnly] });
      vi.mocked(api.fetchTasks).mockResolvedValue([]); // remote has nothing

      await useAppStore.getState().performSync();

      expect(api.createTask).toHaveBeenCalledWith(localOnly);
    });

    it('pushes locally-updated tasks (local.updatedAt > remote.updatedAt) via updateTask', async () => {
      const local = makeTask({
        id: 'shared',
        title: 'local-updated',
        updatedAt: new Date('2026-06-10T00:00:00.000Z'),
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote-stale',
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      useAppStore.setState({ tasks: [local] });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      expect(api.updateTask).toHaveBeenCalledWith('shared', local);
    });

    it('does not call updateTask when the remote version is newer or equal', async () => {
      const local = makeTask({
        id: 'shared',
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      const remote = makeTask({
        id: 'shared',
        updatedAt: new Date('2026-06-10T00:00:00.000Z'),
      });
      useAppStore.setState({ tasks: [local] });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      expect(api.updateTask).not.toHaveBeenCalled();
    });

    it('does not let a failing push abort the sync (errors are swallowed per-task)', async () => {
      const localOnly = makeTask({ id: 'local-new' });
      useAppStore.setState({ tasks: [localOnly] });
      vi.mocked(api.fetchTasks).mockResolvedValue([]);
      vi.mocked(api.createTask).mockRejectedValue(new Error('push failed'));

      // performSync should still complete despite the push error.
      // P0 数据丢失修复:推送失败时**不更新 lastSyncAt**(否则下次同步会把这些任务
      // 误判为"远端已删除"清理掉)。lastSyncAt 保持 null,syncStatus 标记 'error'。
      await useAppStore.getState().performSync();
      expect(useAppStore.getState().lastSyncAt).toBeNull();
      expect(useAppStore.getState().isSyncing).toBe(false);
      expect(useAppStore.getState().syncConfig.syncStatus).toBe('error');
    });
  });

  describe('performSync — projects/categories/tags from remote', () => {
    it('replaces local projects/categories/tags when remote returns non-empty arrays', async () => {
      vi.mocked(api.fetchProjects).mockResolvedValue([{ id: 'rp-1' }] as never);
      vi.mocked(api.fetchCategories).mockResolvedValue([{ id: 'rc-1' }] as never);
      vi.mocked(api.fetchTags).mockResolvedValue([{ id: 'rt-1' }] as never);

      await useAppStore.getState().performSync();

      expect(useAppStore.getState().projects).toEqual([{ id: 'rp-1' }]);
      expect(useAppStore.getState().categories).toEqual([{ id: 'rc-1' }]);
      expect(useAppStore.getState().tags).toEqual([{ id: 'rt-1' }]);
    });

    it('keeps local projects/categories/tags when remote returns empty arrays', async () => {
      const localProjects = [{ id: 'lp-1' }] as never;
      const localCategories = [{ id: 'lc-1' }] as never;
      const localTags = [{ id: 'lt-1' }] as never;
      useAppStore.setState({
        projects: localProjects,
        categories: localCategories,
        tags: localTags,
      });
      vi.mocked(api.fetchProjects).mockResolvedValue([]);
      vi.mocked(api.fetchCategories).mockResolvedValue([]);
      vi.mocked(api.fetchTags).mockResolvedValue([]);

      await useAppStore.getState().performSync();

      expect(useAppStore.getState().projects).toBe(localProjects);
      expect(useAppStore.getState().categories).toBe(localCategories);
      expect(useAppStore.getState().tags).toBe(localTags);
    });
  });

  describe('setSyncConfig / setLastSyncAt / checkApiAvailability', () => {
    it('setSyncConfig stores the config and persists via saveData', async () => {
      const cfg = makeSyncConfig('remote');
      useAppStore.getState().setSyncConfig(cfg);
      expect(useAppStore.getState().syncConfig.conflictStrategy).toBe('remote');
    });

    it('setLastSyncAt stores the given date', () => {
      const d = new Date('2026-07-01T00:00:00.000Z');
      useAppStore.getState().setLastSyncAt(d);
      expect(useAppStore.getState().lastSyncAt).toBe(d);
    });

    it('checkApiAvailability sets apiAvailable based on isApiAvailable()', async () => {
      vi.mocked(api.isApiAvailable).mockResolvedValue(true);
      await useAppStore.getState().checkApiAvailability();
      expect(useAppStore.getState().apiAvailable).toBe(true);

      vi.mocked(api.isApiAvailable).mockResolvedValue(false);
      await useAppStore.getState().checkApiAvailability();
      expect(useAppStore.getState().apiAvailable).toBe(false);
    });
  });

  describe('ensureDeviceIdentity', () => {
    it('首次调用：安全存储无身份时生成新身份并写入 store / syncConfig', async () => {
      const deviceId = await useAppStore.getState().ensureDeviceIdentity('My iPhone');
      expect(syncIdentity.loadDeviceIdentity).toHaveBeenCalledTimes(1);
      expect(syncIdentity.generateDeviceIdentity).toHaveBeenCalledWith('My iPhone');
      expect(deviceId).toBe('mock-device-fingerprint');
      expect(useAppStore.getState().currentDeviceId).toBe('mock-device-fingerprint');
      expect(useAppStore.getState().syncConfig.deviceId).toBe('mock-device-fingerprint');
    });

    it('首次调用：name 缺省时使用 "Goto Mobile"', async () => {
      await useAppStore.getState().ensureDeviceIdentity();
      expect(syncIdentity.generateDeviceIdentity).toHaveBeenCalledWith('Goto Mobile');
    });

    it('复用安全存储中的已有身份：不触发 generateDeviceIdentity', async () => {
      const existing = {
        deviceId: 'existing-fingerprint',
        name: 'Old Device',
        publicKeyPem: '-----BEGIN PUBLIC KEY-----\nold\n-----END PUBLIC KEY-----\n',
        privateKeyPem: '-----BEGIN PRIVATE KEY-----\nold\n-----END PRIVATE KEY-----\n',
      };
      vi.mocked(syncIdentity.loadDeviceIdentity).mockResolvedValue(existing);

      const deviceId = await useAppStore.getState().ensureDeviceIdentity();
      expect(syncIdentity.generateDeviceIdentity).not.toHaveBeenCalled();
      expect(deviceId).toBe('existing-fingerprint');
      expect(useAppStore.getState().currentDeviceId).toBe('existing-fingerprint');
      expect(useAppStore.getState().syncConfig.deviceId).toBe('existing-fingerprint');
    });

    it('重复调用：直接返回 store 中已缓存的 deviceId，不再访问安全存储', async () => {
      // 预置已缓存的 deviceId（模拟首次调用后的状态）
      useAppStore.setState({ currentDeviceId: 'cached-fingerprint' });

      const deviceId = await useAppStore.getState().ensureDeviceIdentity();
      expect(syncIdentity.loadDeviceIdentity).not.toHaveBeenCalled();
      expect(syncIdentity.generateDeviceIdentity).not.toHaveBeenCalled();
      expect(deviceId).toBe('cached-fingerprint');
    });

    it('syncConfig.deviceId 已存在但 currentDeviceId 为空时也能复用（持久化恢复场景）', async () => {
      const cfg = makeSyncConfig('merge');
      useAppStore.setState({
        currentDeviceId: null,
        syncConfig: { ...cfg, deviceId: 'persisted-fingerprint' },
      });

      const deviceId = await useAppStore.getState().ensureDeviceIdentity();
      expect(syncIdentity.loadDeviceIdentity).not.toHaveBeenCalled();
      expect(syncIdentity.generateDeviceIdentity).not.toHaveBeenCalled();
      expect(deviceId).toBe('persisted-fingerprint');
      expect(useAppStore.getState().currentDeviceId).toBe('persisted-fingerprint');
    });

    it('并发调用只生成一份身份（in-flight Promise 去重）', async () => {
      // 让 loadDeviceIdentity 返回一个可控的 Promise，便于在并发窗口内观察
      let resolveLoad: (v: Awaited<ReturnType<typeof syncIdentity.loadDeviceIdentity>>) => void;
      vi.mocked(syncIdentity.loadDeviceIdentity).mockReturnValue(
        new Promise((res) => {
          resolveLoad = res;
        }) as Promise<Awaited<ReturnType<typeof syncIdentity.loadDeviceIdentity>>>,
      );

      // 并发发起两次调用，两者应共享同一个 in-flight Promise
      const p1 = useAppStore.getState().ensureDeviceIdentity();
      const p2 = useAppStore.getState().ensureDeviceIdentity();
      // 此时 loadDeviceIdentity 只被调用一次（第二次命中 in-flight 缓存）
      expect(syncIdentity.loadDeviceIdentity).toHaveBeenCalledTimes(1);
      expect(syncIdentity.generateDeviceIdentity).not.toHaveBeenCalled();

      // 解放 load，两次 await 应得到同一个 deviceId
      resolveLoad!(null); // 触发 generateDeviceIdentity 分支
      const [id1, id2] = await Promise.all([p1, p2]);
      expect(id1).toBe(id2);
      expect(id1).toBe('mock-device-fingerprint');
      // generate 也只被调用一次——首份私钥不会成孤儿
      expect(syncIdentity.generateDeviceIdentity).toHaveBeenCalledTimes(1);
      expect(useAppStore.getState().currentDeviceId).toBe('mock-device-fingerprint');
    });

    it('in-flight Promise 在失败后清空，后续调用可重试', async () => {
      vi.mocked(syncIdentity.loadDeviceIdentity).mockRejectedValue(new Error('secure store IO'));
      await expect(useAppStore.getState().ensureDeviceIdentity()).rejects.toThrow('secure store IO');
      // 第二次调用应重新进入 load 分支（而非命中残留的 in-flight）
      vi.mocked(syncIdentity.loadDeviceIdentity).mockResolvedValue(null);
      const deviceId = await useAppStore.getState().ensureDeviceIdentity();
      expect(deviceId).toBe('mock-device-fingerprint');
    });
  });

  describe('performSync — 版本向量冲突裁决', () => {
    // conflictResolver 的语义：updatedAt 优先（last-write-wins），仅当时间戳
    // 相等时才用版本向量做因果偏序判定。这与桌面端 conflictResolver 完全一致。
    // 因此以下测试在"时间戳相等"的场景下验证版本向量的作用。

    it('时间戳相等 + local.deviceVersion 因果支配 remote → 保留 local', async () => {
      const ts = new Date('2026-06-10T00:00:00.000Z');
      const local = makeTask({
        id: 'shared',
        title: 'local',
        updatedAt: ts,
        deviceVersion: { devA: 2, devB: 1 }, // 在 devA/devB 上都更新过
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote',
        updatedAt: ts,
        deviceVersion: { devA: 1 }, // 被本地支配
      });
      useAppStore.setState({ tasks: [local] });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      expect(useAppStore.getState().tasks[0].title).toBe('local');
    });

    it('时间戳相等 + remote.deviceVersion 因果支配 local → 取 remote', async () => {
      const ts = new Date('2026-06-10T00:00:00.000Z');
      const local = makeTask({
        id: 'shared',
        title: 'local',
        updatedAt: ts,
        deviceVersion: { devA: 1 }, // 被远端支配
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote',
        updatedAt: ts,
        deviceVersion: { devA: 2, devB: 1 },
      });
      useAppStore.setState({ tasks: [local] });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      expect(useAppStore.getState().tasks[0].title).toBe('remote');
    });

    it('时间戳相等 + 并发编辑 + merge 策略 → 保守保留 local', async () => {
      // devA 只在 local 改，devB 只在 remote 改 → 互不支配（并发）
      const ts = new Date('2026-06-10T00:00:00.000Z');
      const local = makeTask({
        id: 'shared',
        title: 'local',
        updatedAt: ts,
        deviceVersion: { devA: 2 },
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote',
        updatedAt: ts,
        deviceVersion: { devB: 2 },
      });
      useAppStore.setState({ tasks: [local], syncConfig: makeSyncConfig('merge') });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      // merge 并发时保守保留 local，避免覆盖未合并的并发编辑
      expect(useAppStore.getState().tasks[0].title).toBe('local');
    });

    it('时间戳相等 + 并发编辑 + newest 策略 → updatedAt 相等故保留 local', async () => {
      const ts = new Date('2026-06-10T00:00:00.000Z');
      const local = makeTask({
        id: 'shared',
        title: 'local',
        updatedAt: ts,
        deviceVersion: { devA: 2 },
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote',
        updatedAt: ts,
        deviceVersion: { devB: 2 },
      });
      useAppStore.setState({ tasks: [local], syncConfig: makeSyncConfig('newest') });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      // newest 在并发时回退到 updatedAt 比较；时间戳相等 → 保留 local
      expect(useAppStore.getState().tasks[0].title).toBe('local');
    });

    it('时间戳相等 + 并发编辑 + local 策略 → 显式策略优先，保留 local', async () => {
      const ts = new Date('2026-06-10T00:00:00.000Z');
      const local = makeTask({
        id: 'shared',
        title: 'local',
        updatedAt: ts,
        deviceVersion: { devA: 2 },
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote',
        updatedAt: ts,
        deviceVersion: { devB: 2 },
      });
      useAppStore.setState({ tasks: [local], syncConfig: makeSyncConfig('local') });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      expect(useAppStore.getState().tasks[0].title).toBe('local');
    });

    it('时间戳相等 + 并发编辑 + remote 策略 → 显式策略优先，取 remote', async () => {
      const ts = new Date('2026-06-10T00:00:00.000Z');
      const local = makeTask({
        id: 'shared',
        title: 'local',
        updatedAt: ts,
        deviceVersion: { devA: 2 },
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote',
        updatedAt: ts,
        deviceVersion: { devB: 2 },
      });
      useAppStore.setState({ tasks: [local], syncConfig: makeSyncConfig('remote') });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      expect(useAppStore.getState().tasks[0].title).toBe('remote');
    });

    it('时间戳不等时 updatedAt LWW 优先，忽略版本向量（local 更新 → 保留 local）', async () => {
      // local 时间戳更新，但 remote.deviceVersion 因果支配 local。
      // conflictResolver 先比 updatedAt → local 胜，版本向量不参与。
      const local = makeTask({
        id: 'shared',
        title: 'local',
        updatedAt: new Date('2026-12-31T00:00:00.000Z'), // 更新
        deviceVersion: { devA: 1 }, // 被远端支配
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'), // 更旧
        deviceVersion: { devA: 2, devB: 1 }, // 支配本地
      });
      useAppStore.setState({ tasks: [local], syncConfig: makeSyncConfig('merge') });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      expect(useAppStore.getState().tasks[0].title).toBe('local');
    });

    it('时间戳不等时 updatedAt LWW 优先，忽略版本向量（remote 更新 → 取 remote）', async () => {
      const local = makeTask({
        id: 'shared',
        title: 'local',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'), // 更旧
        deviceVersion: { devA: 2, devB: 1 }, // 支配远端
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote',
        updatedAt: new Date('2026-12-31T00:00:00.000Z'), // 更新
        deviceVersion: { devA: 1 }, // 被本地支配
      });
      useAppStore.setState({ tasks: [local], syncConfig: makeSyncConfig('merge') });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      expect(useAppStore.getState().tasks[0].title).toBe('remote');
    });

    it('一侧缺失 deviceVersion → 退化为 updatedAt LWW（不进入版本向量分支）', async () => {
      // 混合场景：旧数据无 deviceVersion，新数据有。无法做向量比较，回退时间戳。
      const local = makeTask({
        id: 'shared',
        title: 'local',
        updatedAt: new Date('2026-06-01T00:00:00.000Z'), // 更旧
        deviceVersion: { devA: 5 },
      });
      const remote = makeTask({
        id: 'shared',
        title: 'remote',
        updatedAt: new Date('2026-12-31T00:00:00.000Z'), // 更新
        // 无 deviceVersion
      });
      useAppStore.setState({ tasks: [local], syncConfig: makeSyncConfig('merge') });
      vi.mocked(api.fetchTasks).mockResolvedValue([remote]);

      await useAppStore.getState().performSync();

      expect(useAppStore.getState().tasks[0].title).toBe('remote');
    });
  });
});
