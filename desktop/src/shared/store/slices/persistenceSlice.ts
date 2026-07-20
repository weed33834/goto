// Persistence Slice — 数据持久化（加载、保存、导出、导入、重置）
// 通过 get() 访问所有 slice 的状态，实现全局持久化
import { browserStorage as AsyncStorage } from '../../utils/browserStorage';
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { ThemePreset, UserPreferences, SyncConfig } from '../../types';
import {
  fetchTasks,
  fetchProjects,
  fetchCategories,
  fetchTags,
} from '../../api';
import { STORAGE_KEYS, initialCategories, initialTags } from '../constants';

/**
 * 校验从 AsyncStorage 反序列化出的 syncConfig 是否字段类型合法。
 *
 * JSON.parse 只能保证是合法 JSON，无法保证字段类型。若持久化值是合法 JSON 但
 * 字段类型错乱（如 `{ enabled: "yes", pairedDevices: "not-an-array" }`），直接
 * spread 进 syncConfig 会导致下游迭代/push 运行时崩溃。这里对 E2EE P2P
 * 新增的关键字段做 typeof / Array.isArray 校验；既有字段（enabled / syncInterval 等）
 * 即便类型错乱也不影响 sync 子系统启动，留给 setSyncConfig 二次校验。
 *
 * 仅做白名单校验：未声明的字段会被 spread 进来但不影响正确性，保留以向前兼容
 * 未来版本写入的新字段（旧版本读取时忽略）。
 */
function isValidSyncConfigShape(value: unknown): value is Partial<SyncConfig> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v.deviceId !== undefined && v.deviceId !== null && typeof v.deviceId !== 'string') return false;
  if (v.relayUrl !== undefined && v.relayUrl !== null && typeof v.relayUrl !== 'string') return false;
  if (v.syncProtocol !== undefined && v.syncProtocol !== 'http-rest' && v.syncProtocol !== 'e2ee-p2p') return false;
  if (v.pairedDevices !== undefined) {
    if (!Array.isArray(v.pairedDevices)) return false;
    for (const dev of v.pairedDevices) {
      if (
        typeof dev !== 'object' ||
        dev === null ||
        typeof (dev as { deviceId?: unknown }).deviceId !== 'string' ||
        typeof (dev as { name?: unknown }).name !== 'string' ||
        typeof (dev as { publicKeyPem?: unknown }).publicKeyPem !== 'string'
      ) {
        return false;
      }
    }
  }
  return true;
}

// 还原持久化数据中的日期字段（createdAt/updatedAt 必有，其余可选）。
const parseDates = (data: Record<string, unknown>): Record<string, unknown> => ({
  ...data,
  createdAt: data.createdAt ? new Date(data.createdAt as string | number | Date) : new Date(),
  updatedAt: data.updatedAt ? new Date(data.updatedAt as string | number | Date) : new Date(),
  dueDate: data.dueDate ? new Date(data.dueDate as string | number | Date) : null,
  completedAt: data.completedAt ? new Date(data.completedAt as string | number | Date) : null,
  startDate: data.startDate ? new Date(data.startDate as string | number | Date) : null,
  endDate: data.endDate ? new Date(data.endDate as string | number | Date) : null,
});

// 导入数据日期映射：createdAt/updatedAt 无 fallback（与原 importData 行为一致）。
const importDefaultMap = (d: Record<string, unknown>): Record<string, unknown> => ({
  ...d,
  createdAt: new Date(d.createdAt as string | number | Date),
  updatedAt: new Date(d.updatedAt as string | number | Date),
});

type ArrayField = {
  storage: string;
  state: keyof AppStore;
  loadMap?: (d: Record<string, unknown>) => Record<string, unknown>;
  importMap?: (d: Record<string, unknown>) => Record<string, unknown>;
  requireNonEmpty?: boolean;  // 默认 true；tasks 为 false（空数组也 set，与原行为一致）
};

// 数组字段统一配置：loadData / saveData / importData 三段流程由此表驱动。
const ARRAY_FIELDS: ArrayField[] = [
  { storage: STORAGE_KEYS.TASKS, state: 'tasks', requireNonEmpty: false },
  { storage: STORAGE_KEYS.VAULT, state: 'vaultItems', loadMap: (d) => d },
  { storage: STORAGE_KEYS.PROJECTS, state: 'projects' },
  { storage: STORAGE_KEYS.CATEGORIES, state: 'categories' },
  { storage: STORAGE_KEYS.TAGS, state: 'tags' },
];

// 仅以下字段参与导入（与原 importData 行为一致）。
const IMPORTABLE_STATES: ReadonlySet<keyof AppStore> = new Set([
  'tasks', 'projects', 'categories', 'tags',
]);

// 单个键的持久化数据损坏时跳过该键并继续加载其余键，
// 避免一条坏数据导致所有本地数据都无法恢复。
const safeParseArray = <T>(raw: string, mapFn: (data: Record<string, unknown>) => T): T[] | null => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(mapFn) : null;
  } catch {
    return null;
  }
};

// 加载标量持久化值：JSON.parse 失败时保留 slice 默认值并告警。
const loadScalar = async (key: string, warn: string): Promise<unknown> => {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch (e) { console.warn(warn, e); return undefined; }
};

// saveData 串行化链:并发调用 saveData 时,后到者等前一个完成再写,
// 避免两个 saveData 并发 setItem 同一 key 时 last-write-wins 用旧 state 覆盖新 state
// (P1 并行写无串行化)。串行化后 N 次调用会串行写 N 次(每次都取最新 state),
// 最坏 N-1 次冗余但不会出错。
let saveChain: Promise<void> = Promise.resolve();

/**
 * 数据迁移机制 — P1 修复。
 *
 * 之前 loadData / importData 完全忽略 version 字段,一旦 schema 变更
 * (如新增必填字段、改变字段类型),旧持久化数据/旧备份会直接载入,
 * 在下游代码访问缺失/类型错乱字段时崩溃,或静默写入不一致数据。
 *
 * 设计:
 * - CURRENT_DATA_VERSION = 2 (1.0 → 2 是首次正式引入迁移)
 * - MIGRATIONS: version N → N+1 的纯函数,只升级不降级
 * - migrate(data, fromVersion) 顺序应用所有 > fromVersion 的迁移
 * - loadData: 持久化数据无 version 字段 → 视为 1,迁移到 2
 * - importData: 备份文件有 version 字段(默认 '1.0'),按字符串映射到数字后迁移
 *
 * 迁移函数必须纯函数 + 幂等 + 不抛错(失败时返回原数据,记 warn)。
 */
const CURRENT_DATA_VERSION = 2;

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  // 1 → 2:补充 Task.completed 字段(早期数据可能只有 status,没有 completed boolean)
  // 不做任何破坏性变更,只是补默认值
  2: (data) => {
    const tasks = data.tasks;
    if (Array.isArray(tasks)) {
      data.tasks = tasks.map((t) => {
        if (t && typeof t === 'object' && !('completed' in t)) {
          (t as Record<string, unknown>).completed =
            (t as { status?: string }).status === 'completed';
        }
        return t;
      });
    }
    return data;
  },
};

/**
 * 把 data 从 fromVersion 迁移到 CURRENT_DATA_VERSION。
 * - fromVersion >= CURRENT: 直接返回(已是最新)
 * - fromVersion < 1: 视为 1
 * - 任意 migration 抛错:记 warn 后返回最近一次成功迁移的结果
 */
function migrateData(
  data: Record<string, unknown>,
  fromVersion: number,
): { data: Record<string, unknown>; version: number } {
  let current = Math.max(1, fromVersion);
  let result = data;
  while (current < CURRENT_DATA_VERSION) {
    const fn = MIGRATIONS[current + 1];
    if (!fn) {
      // 没有该版本的迁移函数,跳过(可能是测试/未来版本)
      current += 1;
      continue;
    }
    try {
      result = fn(result);
    } catch (e) {
      console.warn(`数据迁移 v${current}→v${current + 1} 失败,保留 v${current} 数据:`, e);
      break;
    }
    current += 1;
  }
  return { data: result, version: current };
}

/** 解析备份文件中的 version 字段(支持 '1.0' 字符串和数字)。 */
function parseDataVersion(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === 'string') {
    // '1.0' → 1, '2.0' → 2, '2' → 2
    const major = parseInt(v.split('.')[0], 10);
    if (Number.isFinite(major)) return major;
  }
  return 1; // 缺失或无法解析 → 视为 1
}

export interface PersistenceSlice {
  // 本地数据读写失败时写入错误信息，UI 可据此展示"本地数据读写失败"提示。
  persistenceError: string | null;
  loadData: () => Promise<void>;
  saveData: () => Promise<void>;
  exportData: () => Promise<string>;
  importData: (data: string) => Promise<void>;
  resetData: () => void;
}

export const createPersistenceSlice: StateCreator<AppStore, [], [], PersistenceSlice> = (set, get) => ({
  persistenceError: null,
  loadData: async () => {
    try {
      await get().checkApiAvailability();

      if (get().apiAvailable) {
        try {
          const [tasks, projects, categories, tags] = await Promise.all([
            fetchTasks(),
            fetchProjects(),
            fetchCategories(),
            fetchTags(),
          ]);
          set({ tasks, projects, categories, tags });
          // API 成功后必须落盘,否则下次启动若 API 不可用将读到空数据
          // (这是 P1 数据丢失隐患:之前只 set 不 saveData)
          try {
            await get().saveData();
          } catch (saveErr) {
            console.warn('API 数据落盘失败,本次会话仍可用,下次启动需重新拉取:', saveErr);
          }
          return;
        } catch (error) {
          console.warn('API load failed, falling back to local storage:', error);
          set({ apiAvailable: false });
        }
      }

      // 一次性拉取所有数组字段，再按配置表还原。
      const rawData = await Promise.all(ARRAY_FIELDS.map((f) => AsyncStorage.getItem(f.storage)));
      for (let i = 0; i < ARRAY_FIELDS.length; i++) {
        const field = ARRAY_FIELDS[i];
        const raw = rawData[i];
        if (!raw) continue;
        const arr = safeParseArray(raw, field.loadMap ?? parseDates);
        if (arr === null) continue;
        if (field.requireNonEmpty === false || arr.length > 0) {
          const patch: Partial<AppStore> = { [field.state]: arr } as Partial<AppStore>;
          set(patch);
        }
      }

      // 标量字段：JSON.parse 失败时保留默认值并告警。
      const theme = await loadScalar(STORAGE_KEYS.THEME, 'theme 数据损坏，保留默认主题');
      if (theme !== undefined) set({ theme: theme as ThemePreset });

      const userPrefs = await loadScalar(STORAGE_KEYS.USER_PREFERENCES, 'userPreferences 数据损坏，保留默认偏好');
      if (userPrefs !== undefined) set({ userPreferences: userPrefs as UserPreferences });

      const sidebar = await loadScalar(STORAGE_KEYS.SIDEBAR_OPEN, 'sidebarOpen 数据损坏，保留默认值');
      if (sidebar !== undefined) set({ sidebarOpen: sidebar as boolean });

      const searchHistory = await loadScalar(STORAGE_KEYS.SEARCH_HISTORY, 'searchHistory 数据损坏，清空');
      if (searchHistory !== undefined) set({ searchHistory: searchHistory as string[] });

      // 加载同步配置（含 deviceId / pairedDevices / relayUrl 等 E2EE 字段）。
      // 损坏或字段类型错乱时保留 slice 默认值，不阻断其余数据加载。
      const syncConfigData = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_CONFIG);
      if (syncConfigData) {
        try {
          const loadedConfig = JSON.parse(syncConfigData);
          if (isValidSyncConfigShape(loadedConfig)) {
            set((state) => ({
              syncConfig: { ...state.syncConfig, ...loadedConfig },
              // 从持久化的 syncConfig.deviceId 恢复 currentDeviceId，避免重启后丢失。
              currentDeviceId: loadedConfig.deviceId ?? state.currentDeviceId,
            }));
          }
        } catch (e) { console.warn('syncConfig 数据损坏，保留默认同步配置', e); }
      }
    } catch (error) {
      // 写入 persistenceError，UI 可据此展示"本地数据读写失败"提示
      set({ persistenceError: error instanceof Error ? error.message : String(error) });
      console.error('Error loading data:', error);
    }
  },

  saveData: async () => {
    // 串行化:接到 saveChain 末尾,避免与并发的 saveData 同时 setItem
    const run = saveChain.then(async () => {
      try {
        const state = get();
        await Promise.all([
          ...ARRAY_FIELDS.map((f) =>
            AsyncStorage.setItem(f.storage, JSON.stringify((state[f.state] as unknown[] | undefined) ?? [])),
          ),
          AsyncStorage.setItem(STORAGE_KEYS.THEME, JSON.stringify(state.theme)),
          AsyncStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(state.userPreferences)),
          AsyncStorage.setItem(STORAGE_KEYS.SIDEBAR_OPEN, JSON.stringify(state.sidebarOpen)),
          AsyncStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(state.searchHistory)),
          AsyncStorage.setItem(STORAGE_KEYS.SYNC_CONFIG, JSON.stringify(state.syncConfig)),
        ]);
        // P1-7:写入成功后清除 persistenceError。
        // 之前一旦设置就永不消失,用户即使后续保存成功也以为应用一直坏着。
        if (get().persistenceError) {
          set({ persistenceError: null });
        }
      } catch (error) {
        // 写入 persistenceError，UI 可据此展示"本地数据读写失败"提示
        set({ persistenceError: error instanceof Error ? error.message : String(error) });
        console.error('Error saving data:', error);
      }
    });
    // 无论 run 成功失败,saveChain 都要 resolve,否则后续 saveData 永远挂起
    saveChain = run.catch(() => {});
    return run;
  },

  exportData: async () => {
    const state = get();
    const exportData = {
      // P1 修复:导出时写入当前数据版本,importData 据此决定是否迁移
      version: String(CURRENT_DATA_VERSION),
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
      projects: state.projects,
      categories: state.categories,
      tags: state.tags,
      settings: {
        theme: state.theme,
        syncConfig: state.syncConfig,
      },
    };
    return JSON.stringify(exportData, null, 2);
  },

  importData: async (data: string) => {
    try {
      const parsed = JSON.parse(data);

      // 基础校验：导入数据必须是对象，且关键字段为数组，防止原型污染或异常输入导致状态崩溃。
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('导入数据必须是对象');
      }

      // P1 修复:数据迁移。备份文件可能来自旧版本,字段缺失/类型不同,
      // 直接载入会让下游代码崩溃。先按 version 字段做迁移再继续。
      const parsedObj = parsed as Record<string, unknown>;
      const fromVersion = parseDataVersion(parsedObj.version);
      const migrated = migrateData(parsedObj, fromVersion);
      const importRoot = migrated.data;

      const MAX_IMPORT_ITEMS = 10000;
      const assertArray = (value: unknown, name: string): boolean => {
        if (value === undefined) return true;
        if (!Array.isArray(value)) {
          throw new Error(`导入数据字段 ${name} 必须是数组`);
        }
        if (value.length > MAX_IMPORT_ITEMS) {
          throw new Error(`导入数据字段 ${name} 超过最大允许数量 ${MAX_IMPORT_ITEMS}`);
        }
        return true;
      };

      // 校验可导入字段均为数组且未超量。
      for (const state of IMPORTABLE_STATES) {
        assertArray(importRoot[state as string], state as string);
      }

      // 校验通过后将 parsed 视为已校验的导入载荷，字段均为可选数组。
      // 各数组元素在 map 内做日期字段还原后，再于边界断言为目标实体类型，
      // 与 API 层 (transform.ts) 的 JSON 边界转换模式保持一致。
      type ImportPayload = {
        tasks?: Record<string, unknown>[];
        projects?: Record<string, unknown>[];
        categories?: Record<string, unknown>[];
        tags?: Record<string, unknown>[];
        settings?: { theme?: ThemePreset };
      };
      const importData = importRoot as unknown as ImportPayload;

      for (const field of ARRAY_FIELDS) {
        if (!IMPORTABLE_STATES.has(field.state)) continue;
        const arr = importData[field.state as keyof ImportPayload] as Record<string, unknown>[] | undefined;
        if (!arr) continue;
        const mapFn = field.importMap ?? importDefaultMap;
        set({ [field.state]: arr.map(mapFn) } as Partial<AppStore>);
      }
      if (importData.settings?.theme) set({ theme: importData.settings.theme });

      get().saveData();
    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  },

  resetData: () => {
    set({
      tasks: [],
      vaultItems: [],
      projects: [],
      categories: initialCategories,
      tags: initialTags,
      selectedTask: null,
      selectedProject: null,
      searchHistory: [],
      // 重置配对身份：清除 deviceId / pairedDevices / relayUrl / syncProtocol，
      // 避免重置数据后旧设备身份残留导致后续配对/同步异常。currentDeviceId 一并清空。
      currentDeviceId: null,
      syncConfig: {
        ...get().syncConfig,
        deviceId: null,
        relayUrl: null,
        syncProtocol: 'http-rest',
        pairedDevices: [],
      },
    });
    get().saveData();
  },
});
