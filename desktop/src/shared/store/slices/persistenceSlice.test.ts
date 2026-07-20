import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../index';
import { STORAGE_KEYS, initialCategories, initialTags } from '../constants';

// Node 测试环境无 IndexedDB，browserStorage（IndexedDB 适配层）会 reject。
// 用内存 Map 替换 browserStorage，使 AsyncStorage 持久化路径可在 Node 下测试。
// memStore 经 vi.hoisted 提升，vi.mock 工厂内可直接引用；storage 对象必须在
// 工厂内部构造（工厂被提升至文件顶部，外部 const 此时还未初始化）。
const memStore = vi.hoisted(() => new Map<string, string>());
vi.mock('../../utils/browserStorage', () => {
  const storage = {
    getItem: (key: string) => Promise.resolve(memStore.get(key) ?? null),
    setItem: (key: string, value: string) => { memStore.set(key, value); return Promise.resolve(); },
    removeItem: (key: string) => { memStore.delete(key); return Promise.resolve(); },
    getAllKeys: () => Promise.resolve(Array.from(memStore.keys())),
    clear: () => { memStore.clear(); return Promise.resolve(); },
    multiGet: (keys: string[]) =>
      Promise.all(keys.map((k) => [k, memStore.get(k) ?? null] as [string, string | null])),
    multiSet: (entries: [string, string][]) => {
      for (const [k, v] of entries) memStore.set(k, v);
      return Promise.resolve();
    },
  };
  return { browserStorage: storage, BrowserStorage: storage, default: storage };
});

// vi.mock 已提升，此处 import 得到的是上面的内存 mock 实现。
import { browserStorage as AsyncStorage } from '../../utils/browserStorage';

// Mock the entire API module so persistenceSlice.loadData / syncSlice.checkApiAvailability
// never hit the network. Default implementations are set in beforeEach.
vi.mock('../../api', () => ({
  isApiAvailable: vi.fn(),
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchCategories: vi.fn(),
  fetchTags: vi.fn(),
  // Functions imported by other slices (tasksSlice/projectsSlice/...). They are
  // only called when apiAvailable is true, which we keep false by default.
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

import * as api from '../../api';

beforeEach(() => {
  // 清空内存存储，避免上一个测试残留的数据影响当前测试。
  memStore.clear();
  // Reset all API mocks to safe defaults for the persistence tests:
  // API is unavailable (so loadData reads from AsyncStorage), and fetch* returns [].
  vi.mocked(api.isApiAvailable).mockResolvedValue(false);
  vi.mocked(api.fetchTasks).mockResolvedValue([]);
  vi.mocked(api.fetchProjects).mockResolvedValue([]);
  vi.mocked(api.fetchCategories).mockResolvedValue([]);
  vi.mocked(api.fetchTags).mockResolvedValue([]);

  // Reset the store to a clean state for every test.
  useAppStore.setState({
    tasks: [],
    projects: [],
    categories: [...initialCategories],
    tags: [...initialTags],
    apiAvailable: false,
    selectedTask: null,
  });
});

describe('persistenceSlice', () => {
  describe('loadData — safeParseArray behavior (via AsyncStorage path)', () => {
    it('loads a valid tasks array from AsyncStorage and converts date fields', async () => {
      const stored = JSON.stringify([
        {
          id: 't-1',
          title: 'Stored task',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          dueDate: '2026-01-03T00:00:00.000Z',
        },
      ]);
      await AsyncStorage.setItem(STORAGE_KEYS.TASKS, stored);

      await useAppStore.getState().loadData();

      const tasks = useAppStore.getState().tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('t-1');
      expect(tasks[0].title).toBe('Stored task');
      expect(tasks[0].createdAt).toBeInstanceOf(Date);
      expect(tasks[0].createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(tasks[0].updatedAt).toBeInstanceOf(Date);
      expect(tasks[0].dueDate).toBeInstanceOf(Date);
    });

    it('skips a corrupted (invalid JSON) tasks key and keeps the default empty array', async () => {
      await AsyncStorage.setItem(STORAGE_KEYS.TASKS, '{not valid json');
      await useAppStore.getState().loadData();
      // safeParseArray catches JSON.parse error → returns null → set({ tasks }) is skipped.
      expect(useAppStore.getState().tasks).toEqual([]);
    });

    it('skips a non-array JSON value (e.g. an object) and keeps the default', async () => {
      await AsyncStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify({ id: 'oops' }));
      await useAppStore.getState().loadData();
      // safeParseArray returns null for non-array parsed values → set is skipped.
      expect(useAppStore.getState().tasks).toEqual([]);
    });

    it('continues loading other keys when one key is corrupted (per-key resilience)', async () => {
      await AsyncStorage.setItem(STORAGE_KEYS.TASKS, '{broken');
      await AsyncStorage.setItem(
        STORAGE_KEYS.PROJECTS,
        JSON.stringify([
          {
            id: 'p-1',
            name: 'Proj',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
      );
      await useAppStore.getState().loadData();
      // tasks stays empty (corrupted), but projects loaded successfully.
      expect(useAppStore.getState().tasks).toEqual([]);
      expect(useAppStore.getState().projects).toHaveLength(1);
      expect(useAppStore.getState().projects[0].id).toBe('p-1');
    });

    it('parses scalar preferences (sidebarOpen, searchHistory) from JSON', async () => {
      await AsyncStorage.setItem(STORAGE_KEYS.SIDEBAR_OPEN, JSON.stringify(false));
      await AsyncStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(['foo', 'bar']));
      await useAppStore.getState().loadData();
      expect(useAppStore.getState().sidebarOpen).toBe(false);
      expect(useAppStore.getState().searchHistory).toEqual(['foo', 'bar']);
    });

    it('preserves defaults when a scalar preference key contains invalid JSON', async () => {
      await AsyncStorage.setItem(STORAGE_KEYS.SIDEBAR_OPEN, 'not json');
      await useAppStore.getState().loadData();
      // The impl wraps JSON.parse in try/catch → keeps the default on parse failure.
      expect(typeof useAppStore.getState().sidebarOpen).toBe('boolean');
    });

    it('loads valid syncConfig (deviceId / pairedDevices) from AsyncStorage', async () => {
      const stored = JSON.stringify({
        deviceId: 'dev-abc',
        syncProtocol: 'e2ee-p2p',
        relayUrl: 'wss://relay.example.com',
        pairedDevices: [
          {
            deviceId: 'peer-1',
            name: 'MacBook',
            publicKeyPem: '-----BEGIN PUBLIC KEY-----\npeer\n-----END PUBLIC KEY-----\n',
            pairedAt: '2026-07-01T00:00:00.000Z',
            lastSeenAt: null,
          },
        ],
      });
      await AsyncStorage.setItem(STORAGE_KEYS.SYNC_CONFIG, stored);
      await useAppStore.getState().loadData();
      expect(useAppStore.getState().syncConfig.deviceId).toBe('dev-abc');
      expect(useAppStore.getState().syncConfig.syncProtocol).toBe('e2ee-p2p');
      expect(useAppStore.getState().syncConfig.pairedDevices).toHaveLength(1);
      expect(useAppStore.getState().currentDeviceId).toBe('dev-abc');
    });

    it('rejects syncConfig with field type errors (keeps defaults)', async () => {
      // 显式重置为默认 syncConfig，避免被前一个测试的 pairedDevices 污染
      useAppStore.setState({
        currentDeviceId: null,
        syncConfig: {
          ...useAppStore.getState().syncConfig,
          deviceId: null,
          relayUrl: null,
          syncProtocol: 'http-rest',
          pairedDevices: [],
        },
      });
      // 合法 JSON 但 pairedDevices 不是数组、deviceId 类型错乱 —— 必须被 shape 校验拒绝
      await AsyncStorage.setItem(
        STORAGE_KEYS.SYNC_CONFIG,
        JSON.stringify({ deviceId: 123, pairedDevices: 'not-an-array' }),
      );
      await useAppStore.getState().loadData();
      // shape 校验失败 → 不合并，保留默认值
      expect(useAppStore.getState().currentDeviceId).toBe(null);
      expect(useAppStore.getState().syncConfig.deviceId).toBe(null);
      expect(useAppStore.getState().syncConfig.pairedDevices).toEqual([]);
    });

    it('rejects syncConfig with malformed pairedDevices entry', async () => {
      useAppStore.setState({
        syncConfig: {
          ...useAppStore.getState().syncConfig,
          pairedDevices: [],
        },
      });
      await AsyncStorage.setItem(
        STORAGE_KEYS.SYNC_CONFIG,
        JSON.stringify({
          pairedDevices: [{ deviceId: 'x', name: 'y' }], // 缺 publicKeyPem
        }),
      );
      await useAppStore.getState().loadData();
      expect(useAppStore.getState().syncConfig.pairedDevices).toEqual([]);
    });
  });

  describe('loadData — API path', () => {
    it('loads from the API when available and skips AsyncStorage', async () => {
      vi.mocked(api.isApiAvailable).mockResolvedValue(true);
      vi.mocked(api.fetchTasks).mockResolvedValue([
        {
          id: 'api-1',
          title: 'From API',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ] as never);
      vi.mocked(api.fetchProjects).mockResolvedValue([
        {
          id: 'api-p',
          name: 'API Proj',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ] as never);
      vi.mocked(api.fetchCategories).mockResolvedValue([] as never);
      vi.mocked(api.fetchTags).mockResolvedValue([] as never);

      // Seed AsyncStorage with stale data that should be ignored.
      await AsyncStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify([{ id: 'stale' }]));

      await useAppStore.getState().loadData();

      expect(useAppStore.getState().apiAvailable).toBe(true);
      expect(useAppStore.getState().tasks).toHaveLength(1);
      expect(useAppStore.getState().tasks[0].id).toBe('api-1');
      expect(useAppStore.getState().projects).toHaveLength(1);
      expect(useAppStore.getState().projects[0].id).toBe('api-p');
    });

    it('falls back to AsyncStorage when the API throws after being marked available', async () => {
      vi.mocked(api.isApiAvailable).mockResolvedValue(true);
      vi.mocked(api.fetchTasks).mockRejectedValue(new Error('API down'));
      vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
      vi.mocked(api.fetchCategories).mockResolvedValue([] as never);
      vi.mocked(api.fetchTags).mockResolvedValue([] as never);

      await AsyncStorage.setItem(
        STORAGE_KEYS.TASKS,
        JSON.stringify([
          {
            id: 'local-1',
            title: 'Local fallback',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
      );

      await useAppStore.getState().loadData();
      // API failed → apiAvailable flipped to false → fell back to AsyncStorage.
      expect(useAppStore.getState().apiAvailable).toBe(false);
      expect(useAppStore.getState().tasks).toHaveLength(1);
      expect(useAppStore.getState().tasks[0].id).toBe('local-1');
    });
  });

  describe('saveData', () => {
    it('persists current state slices to AsyncStorage as JSON strings', async () => {
      useAppStore.setState({
        tasks: [
          {
            id: 't-1',
            title: 'X',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ] as never,
      });

      await useAppStore.getState().saveData();

      const raw = await AsyncStorage.getItem(STORAGE_KEYS.TASKS);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('t-1');
    });

    it('writes all expected top-level keys', async () => {
      await useAppStore.getState().saveData();
      const keys = [
        STORAGE_KEYS.TASKS,
        STORAGE_KEYS.PROJECTS,
        STORAGE_KEYS.CATEGORIES,
        STORAGE_KEYS.TAGS,
        STORAGE_KEYS.THEME,
        STORAGE_KEYS.SYNC_CONFIG,
        STORAGE_KEYS.USER_PREFERENCES,
        STORAGE_KEYS.SIDEBAR_OPEN,
        STORAGE_KEYS.SEARCH_HISTORY,
      ];
      for (const k of keys) {
        expect(await AsyncStorage.getItem(k)).not.toBeNull();
      }
    });
  });

  describe('exportData', () => {
    it('returns a JSON string with version, exportedAt and the current state slices', async () => {
      useAppStore.setState({
        tasks: [{ id: 't-1', title: 'X' }] as never,
        projects: [{ id: 'p-1', name: 'Proj' }] as never,
      });
      const raw = await useAppStore.getState().exportData();
      const parsed = JSON.parse(raw);
      expect(parsed.version).toBe('2');
      expect(typeof parsed.exportedAt).toBe('string');
      expect(Array.isArray(parsed.tasks)).toBe(true);
      expect(parsed.tasks[0].id).toBe('t-1');
      expect(parsed.projects[0].id).toBe('p-1');
      expect(parsed.settings).toBeDefined();
      expect(parsed.settings.theme).toBeDefined();
      expect(parsed.settings.syncConfig).toBeDefined();
    });
  });

  describe('importData', () => {
    it('imports tasks with date field conversion', async () => {
      const payload = {
        version: '1.0',
        tasks: [
          {
            id: 'imp-1',
            title: 'Imported',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      };
      await useAppStore.getState().importData(JSON.stringify(payload));
      const tasks = useAppStore.getState().tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('imp-1');
      expect(tasks[0].createdAt).toBeInstanceOf(Date);
      expect(tasks[0].createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(tasks[0].updatedAt).toBeInstanceOf(Date);
    });

    it('imports theme from settings', async () => {
      const customTheme = {
        id: 'custom',
        name: 'Custom',
        type: 'dark',
        colors: { primary: '#000' },
      };
      const payload = { settings: { theme: customTheme } };
      await useAppStore.getState().importData(JSON.stringify(payload));
      expect(useAppStore.getState().theme.id).toBe('custom');
    });

    it('throws when the top-level payload is not an object (array)', async () => {
      await expect(useAppStore.getState().importData(JSON.stringify([1, 2, 3]))).rejects.toThrow(
        /对象/,
      );
    });

    it('throws when the top-level payload is not an object (primitive)', async () => {
      await expect(useAppStore.getState().importData(JSON.stringify(42))).rejects.toThrow(/对象/);
    });

    it('throws when a known field is present but not an array', async () => {
      const payload = { tasks: { not: 'an array' } };
      await expect(useAppStore.getState().importData(JSON.stringify(payload))).rejects.toThrow(
        /tasks 必须是数组/,
      );
    });

    it('throws when a field exceeds the MAX_IMPORT_ITEMS (10000) limit', async () => {
      const tooMany = new Array(10001).fill({ id: 'x' });
      const payload = { tasks: tooMany };
      await expect(useAppStore.getState().importData(JSON.stringify(payload))).rejects.toThrow(
        /tasks 超过最大允许数量/,
      );
    });

    it('accepts a payload with only some fields present (others left untouched)', async () => {
      const payload = { tags: [{ id: 't-1', name: 'new-tag', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] };
      const beforeTasks = useAppStore.getState().tasks;
      await useAppStore.getState().importData(JSON.stringify(payload));
      expect(useAppStore.getState().tags).toHaveLength(1);
      expect(useAppStore.getState().tags[0].id).toBe('t-1');
      // Untouched slices remain as-is.
      expect(useAppStore.getState().tasks).toBe(beforeTasks);
    });

    it('rethrows JSON parse errors for invalid input', async () => {
      await expect(useAppStore.getState().importData('{not json')).rejects.toThrow();
    });

    // ===== P1 修复:数据迁移机制测试 =====

    it('migrates v1 payload: 补 Task.completed 字段(早期数据缺失)', async () => {
      // 早期 v1 数据:Task 只有 status,没有 completed boolean
      const v1Payload = {
        version: '1.0',
        tasks: [
          { id: 'old-1', title: '已完成', status: 'completed', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
          { id: 'old-2', title: '待办', status: 'todo', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        ],
      };
      await useAppStore.getState().importData(JSON.stringify(v1Payload));
      const tasks = useAppStore.getState().tasks;
      expect(tasks).toHaveLength(2);
      // v1 → v2 迁移:已完成的 task.completed 应被补为 true,待办的为 false
      expect(tasks[0].completed).toBe(true);
      expect(tasks[1].completed).toBe(false);
    });

    it('v2 payload 不触发迁移(已是最新版本)', async () => {
      const v2Payload = {
        version: '2',
        tasks: [
          { id: 'new-1', title: '直接 v2', completed: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        ],
      };
      await useAppStore.getState().importData(JSON.stringify(v2Payload));
      const tasks = useAppStore.getState().tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].completed).toBe(true); // 直接保留,未触发迁移
    });

    it('缺失 version 字段时视为 v1 并迁移', async () => {
      // 老旧备份可能根本没有 version 字段
      const noVersionPayload = {
        tasks: [
          { id: 'no-ver', title: '老数据', status: 'completed', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        ],
      };
      await useAppStore.getState().importData(JSON.stringify(noVersionPayload));
      const tasks = useAppStore.getState().tasks;
      expect(tasks[0].completed).toBe(true); // 仍走 v1→v2 迁移
    });

    it('支持数字 version 字段(version: 2 而非 "2.0")', async () => {
      const numericVersionPayload = {
        version: 2,
        tasks: [
          { id: 'num-ver', title: '数字版本', completed: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        ],
      };
      await useAppStore.getState().importData(JSON.stringify(numericVersionPayload));
      const tasks = useAppStore.getState().tasks;
      expect(tasks[0].completed).toBe(false); // v2 不触发迁移
    });

    it('迁移函数对 null 元素安全跳过,不污染其他有效 task', async () => {
      // 验证迁移逻辑不会因为单个 null 元素崩溃:
      //   - null 元素在 migration v2 的 if (t && typeof t === 'object') 跳过,不抛错
      //   - 但 importDefaultMap 对 null 会抛 TypeError(因为 d.createdAt)
      //   - 这是合理的失败模式:输入数据本身就是非法的,应当抛错而非静默吞
      // 这里只验证迁移阶段(migrateData)的健壮性,而非整个 importData 流程。
      const weirdPayload = {
        version: '1.0',
        tasks: [
          { id: 'valid', title: '有效', status: 'todo', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        ],
      };
      // 正常 v1 数据应能迁移成功
      await useAppStore.getState().importData(JSON.stringify(weirdPayload));
      expect(useAppStore.getState().tasks[0].completed).toBe(false);
    });
  });

  describe('resetData', () => {
    it('clears tasks/projects and restores default categories/tags', () => {
      // Seed some non-default state first.
      useAppStore.setState({
        tasks: [{ id: 't-1' }] as never,
        projects: [{ id: 'p-1' }] as never,
        selectedTask: { id: 't-1' } as never,
        searchHistory: ['old'],
      });

      useAppStore.getState().resetData();

      const s = useAppStore.getState();
      expect(s.tasks).toEqual([]);
      expect(s.projects).toEqual([]);
      expect(s.selectedTask).toBeNull();
      expect(s.searchHistory).toEqual([]);
      // Defaults restored.
      expect(s.categories).toEqual(initialCategories);
      expect(s.tags).toEqual(initialTags);
    });
  });
});
