// Sync Slice — 同步与备份配置状态。
// 双协议：HTTP REST（performSync，向后兼容）+ E2EE P2P（配对编排）。
// 设备身份管理（ensureDeviceIdentity）+ 版本向量冲突解决（resolveTaskConflict）。
// syncProtocol 区分 'http-rest' / 'e2ee-p2p'。配对由 UI 层调 pairingService，
// slice 仅操作 state 不持有 transport/session 等不可序列化运行时对象。
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { SyncConfig, Task, PairedDevice, SyncProtocol } from '../../types';
import { isApiAvailable } from '../../api';
import {
  fetchTasks,
  fetchProjects,
  fetchCategories,
  fetchTags,
  createTask as apiCreateTask,
  updateTask as apiUpdateTask,
} from '../../api';
import { resolveConflict, type ConflictResult } from '../../sync/conflictResolver';
import {
  generateDeviceIdentity,
  loadDeviceIdentity,
} from '../../sync/syncIdentity';
import {
  loadSyncMasterKey,
  saveSyncMasterKey,
  deleteSyncMasterKey,
} from '../../sync/syncStorage';
import { generateSyncMasterKey } from '../../sync/syncCrypto';

/**
 * ensureDeviceIdentity 的 in-flight Promise 缓存。
 *
 * 该函数会触发 secure-store 读写与可能的 Ed25519 密钥对生成，属异步重操作。
 * App 初始化与同步触发器可能并发调用，若不缓存则两次调用会各自走 load→generate
 * 分支，第二份 set() 覆盖第一份，首份私钥成为孤儿（永远落不到 secure store）。
 * 用模块级变量缓存进行中的 Promise，并发调用复用同一份结果；resolve/reject 后清空。
 * 不放进 store state 是为了避免被持久化 / 序列化。
 */
let ensureDeviceIdentityInFlight: Promise<string> | null = null;

/**
 * ensureSyncMasterKey 的 in-flight Promise 缓存。语义同 ensureDeviceIdentity。
 * 多设备配对并发触发时复用同一份生成/加载结果，避免重复生成 SMK 覆盖已有密钥。
 */
let ensureSmkInFlight: Promise<Uint8Array> | null = null;

/**
 * E2EE 配对运行时状态。配对是异步流程（涉及 WS 长连接 + 握手），slice 仅持有状态
 * 标记与结果，不持有 transport / session 引用——这些由调用方（hooks / 组件）持有，
 * 在配对完成或取消时销毁。这样 slice 保持可序列化、可在纯 Node 测试。
 */
export type PairingRole = 'initiator' | 'responder';

export interface PairingState {
  /** 是否有配对正在进行。 */
  active: boolean;
  /** 当前角色。initiator = 输入码认领，responder = 展示码等待。 */
  role: PairingRole | null;
  /** responder 角色下展示给对端的 8 位码；initiator 角色下为 null。 */
  code: string | null;
  /** 配对码过期时间戳（ms）。relay 默认 5 分钟。 */
  codeExpiresAt: number | null;
  /** 配对过程错误信息（用户可读）。null 表示无错误。 */
  error: string | null;
}

export interface E2EESyncState {
  /** 同步状态机：idle / connecting / syncing / success / error。 */
  status: 'idle' | 'connecting' | 'syncing' | 'success' | 'error';
  /** 最近一次同步错误（用户可读）。null 表示无错误。 */
  error: string | null;
  /** 最近一次成功同步时间戳（ms）。null 表示从未同步。 */
  lastSyncAt: number | null;
  /** 当前活跃对端 deviceId（同步进行中的对端）。null 表示无活跃对端。 */
  activePeerDeviceId: string | null;
}

export interface SyncSlice {
  syncConfig: SyncConfig;
  lastSyncAt: Date | null;
  isSyncing: boolean;
  apiAvailable: boolean;
  /** 本机设备指纹（Ed25519 公钥前 16 hex）。未生成身份前为 null。 */
  currentDeviceId: string | null;
  /** 配对运行时状态。active=false 时其它字段无意义。 */
  pairing: PairingState;
  /** E2EE 同步状态机。仅 syncProtocol === 'e2ee-p2p' 时有意义。 */
  e2eeSync: E2EESyncState;
  /** SMK 是否已就绪。App 启动时异步检查后填充。 */
  smkReady: boolean;

  setSyncConfig: (config: SyncConfig) => void;
  performSync: () => Promise<void>;
  setLastSyncAt: (date: Date) => void;
  checkApiAvailability: () => Promise<void>;
  /**
   * 确保本机已有设备身份：优先从安全存储加载，不存在则生成新的 Ed25519 密钥对。
   * 生成 / 加载后把 deviceId 写入 syncConfig.deviceId 并持久化。
   * 返回当前设备指纹。
   */
  ensureDeviceIdentity: (name?: string) => Promise<string>;

  /**
   * 设置 relay URL。配对前必须配置。同步写入 syncConfig.relayUrl 并持久化。
   */
  setRelayUrl: (url: string) => void;

  /**
   * 确保本机已有 SMK：优先从安全存储加载，不存在则生成 32 字节随机 SMK 并持久化。
   * 首次配对（responder 角色）前必须调用。返回 SMK 字节（调用方不应持久化它，
   * 仅在配对时使用）。
   */
  ensureSyncMasterKey: () => Promise<Uint8Array>;

  /**
   * 标记配对开始。UI 调用此方法更新状态后，再异步调用 pairingService.generatePairingCode
   * 或 claimPairingCodeAndPair 完成实际配对流程。
   */
  startPairing: (role: PairingRole) => void;

  /**
   * 标记配对码已生成（responder 角色专用）。pairingService.generatePairingCode 返回后调用。
   */
  setPairingCode: (code: string, expiresAt: number) => void;

  /**
   * 标记配对错误。pairingService 调用失败时设置。
   */
  setPairingError: (error: string | null) => void;

  /**
   * 取消配对。UI 关闭配对对话框时调用。仅清空状态，不主动销毁 transport
   * （transport 由调用方持有并销毁）。
   */
  cancelPairing: () => void;

  /**
   * 配对成功：把对端写入 pairedDevices 并切换 syncProtocol 到 'e2ee-p2p'。
   * 由 pairingService 的 onPaired 回调触发。同时刷新 smkReady。
   */
  addPairedDevice: (device: PairedDevice) => void;

  /**
   * 移除已配对设备：从 pairedDevices 删除。若删除后无已配对设备，重置 syncProtocol
   * 回 'http-rest' 并删除 SMK（避免下次配对时 SMK 不一致）。
   */
  removePairedDevice: (deviceId: string) => Promise<void>;

  /**
   * 更新 E2EE 同步状态机。同步运行时（hooks）在状态变化时调用。
   */
  setE2EESyncStatus: (
    status: E2EESyncState['status'],
    error?: string | null,
    activePeerDeviceId?: string | null,
  ) => void;

  /**
   * 重置 E2EE 同步：清空 pairedDevices、删除 SMK、syncProtocol 切回 'http-rest'。
   * 设备重置 / 全部退出配对时调用。
   */
  resetE2EESync: () => Promise<void>;
}

/**
 * 版本向量感知的任务冲突裁决。
 *
 * conflictResolver 的判定顺序与桌面端一致：先比 updatedAt（last-write-wins），
 * 仅当时间戳相等时才用版本向量做因果偏序判定。因此版本向量的作用是细化
 * "同一毫秒并发写入"这一 LWW 无法区分的场景，而非取代时间戳。
 *
 * 当 local 和 remote 都携带 deviceVersion 时，把判定委托给 conflictResolver：
 *   - 返回 'local' / 'remote' → 直接采纳
 *   - 返回 'concurrent'（并发编辑）→ 按 strategy 映射
 * 当任一侧缺失 deviceVersion（HTTP REST 模式或旧数据）时，跳过向量分支，
 * 退化为纯 updatedAt last-write-wins，保证既有行为不变。
 *
 * @param strategy 用户配置的冲突策略（merge / local / remote / newest / ask）
 * @returns 'local' | 'remote' —— 'concurrent' 按 strategy 映射：
 *   - 'local' / 'ask' / 'merge' → 保留 local（保守，避免覆盖未合并的并发编辑）
 *   - 'remote' → 取 remote
 *   - 'newest' → 取 updatedAt 较新方（相等则保留 local）
 */
function resolveTaskConflict(
  local: Task,
  remote: Task,
  strategy: SyncConfig['conflictStrategy'],
): 'local' | 'remote' {
  // 显式策略优先（与既有行为一致）
  if (strategy === 'local') return 'local';
  if (strategy === 'remote') return 'remote';

  const localUpdated = new Date(local.updatedAt).getTime();
  const remoteUpdated = new Date(remote.updatedAt).getTime();

  // 版本向量可用时做因果判定
  if (local.deviceVersion && remote.deviceVersion) {
    const result: ConflictResult = resolveConflict(
      {
        id: local.id,
        updatedAt: localUpdated,
        version: local.version,
        deviceVersion: local.deviceVersion,
      },
      {
        id: remote.id,
        updatedAt: remoteUpdated,
        version: remote.version,
        deviceVersion: remote.deviceVersion,
      },
    );
    if (result === 'local') return 'local';
    if (result === 'remote') return 'remote';
    // 'concurrent'：并发编辑，按 strategy 映射
    if (strategy === 'newest') {
      return remoteUpdated > localUpdated ? 'remote' : 'local';
    }
    // 'merge' / 'ask' 并发时保守保留 local
    return 'local';
  }

  // 无版本向量：退化为 updatedAt last-write-wins（既有逻辑）
  if (strategy === 'newest') {
    return remoteUpdated > localUpdated ? 'remote' : 'local';
  }
  // 'merge' 默认：remote 更新才覆盖
  return remoteUpdated > localUpdated ? 'remote' : 'local';
}

const INITIAL_PAIRING: PairingState = {
  active: false,
  role: null,
  code: null,
  codeExpiresAt: null,
  error: null,
};

const INITIAL_E2EE_SYNC: E2EESyncState = {
  status: 'idle',
  error: null,
  lastSyncAt: null,
  activePeerDeviceId: null,
};

export const createSyncSlice: StateCreator<AppStore, [], [], SyncSlice> = (set, get) => ({
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
    // 默认 HTTP REST；完成 E2EE 配对后可切换 e2ee-p2p
    syncProtocol: 'http-rest',
    deviceId: null,
    relayUrl: null,
    pairedDevices: [],
  },
  lastSyncAt: null,
  isSyncing: false,
  apiAvailable: false,
  currentDeviceId: null,
  pairing: { ...INITIAL_PAIRING },
  e2eeSync: { ...INITIAL_E2EE_SYNC },
  smkReady: false,

  setSyncConfig: (config) => {
    set({ syncConfig: config });
    get().saveData();
  },

  ensureDeviceIdentity: async (name?: string) => {
    // 优先复用已加载到 store 中的 deviceId
    const existing = get().currentDeviceId ?? get().syncConfig.deviceId;
    if (existing) {
      // 持久化恢复路径：syncConfig.deviceId 已落盘但内存里的 currentDeviceId
      // 还没回填，这里补上，避免后续读取一直命中 null 分支。
      if (get().currentDeviceId !== existing) {
        set({ currentDeviceId: existing });
      }
      return existing;
    }

    // 并发去重：若已有 in-flight 的身份加载/生成，复用同一 Promise，
    // 避免并发调用各自生成一份 Ed25519 身份导致首份私钥成孤儿。
    if (ensureDeviceIdentityInFlight) {
      return ensureDeviceIdentityInFlight;
    }

    const task = (async () => {
      try {
        // 尝试从安全存储加载已有身份
        const loaded = await loadDeviceIdentity();
        let deviceId: string;
        if (loaded) {
          deviceId = loaded.deviceId;
        } else {
          // 首次启动：生成新身份。name 默认取平台信息（6b 可由 UI 传入用户自定义名称）
          const identity = await generateDeviceIdentity(name ?? 'Goto Mobile');
          deviceId = identity.deviceId;
        }

        const config = get().syncConfig;
        set({
          currentDeviceId: deviceId,
          syncConfig: { ...config, deviceId },
        });
        get().saveData();
        return deviceId;
      } finally {
        // 无论成功失败都清空 in-flight 标记，后续调用可重新尝试
        ensureDeviceIdentityInFlight = null;
      }
    })();

    ensureDeviceIdentityInFlight = task;
    return task;
  },

  performSync: async () => {
    if (get().isSyncing) return;
    set({ isSyncing: true });
    try {
      const available = await isApiAvailable();
      if (!available) {
        set({ isSyncing: false, apiAvailable: false });
        return;
      }
      set({ apiAvailable: true });

      // 拉取远端数据：fetch 失败时直接抛出（由外层 catch 处理），
      // 不降级为空集——否则网络抖动会让所有本地任务被误判为"远端缺失"而全量回推。
      const [remoteTasks, remoteProjects, remoteCategories, remoteTags] = await Promise.all([
        fetchTasks(),
        fetchProjects(),
        fetchCategories(),
        fetchTags(),
      ]);

      const localTasks = get().tasks;
      const conflictStrategy = get().syncConfig.conflictStrategy;
      // 上次成功同步时间：用于区分"本地新增（需推送）"与"远端已删除（需本地清理）"。
      // lastSyncAt 为 null 表示从未同步过，此时不应根据远端缺失来删除本地数据。
      const lastSyncAt = get().lastSyncAt;
      const lastSyncMs = lastSyncAt instanceof Date ? lastSyncAt.getTime() : null;

      // 合并任务：优先用版本向量裁决，无向量时退化为 updatedAt last-write-wins
      const taskMap = new Map<string, typeof localTasks[number]>();
      for (const t of localTasks) taskMap.set(t.id, t);
      for (const remote of remoteTasks) {
        const local = taskMap.get(remote.id);
        if (!local) {
          // 远端新增，拉取到本地
          taskMap.set(remote.id, remote);
        } else {
          const winner = resolveTaskConflict(local, remote, conflictStrategy);
          if (winner === 'remote') {
            taskMap.set(remote.id, remote);
          }
          // 'local'：保留本地，不覆盖
        }
      }

      // 推送本地独有的新任务到远端
      const remoteTaskIds = new Set(remoteTasks.map((t) => t.id));
      const pushPromises: Promise<unknown>[] = [];
      // 收集推送失败的 taskId，同步结束后上报到状态供 UI 展示重试（H4）
      const failedPushIds: string[] = [];
      // 远端已删除的任务 id：本地在上次同步后未修改（updatedAt <= lastSyncAt），
      // 但远端已不存在 → 视为远端删除，从本地移除且不推回远端（避免"删除复活"）。
      const remoteDeletedTaskIds = new Set<string>();
      for (const local of localTasks) {
        if (!remoteTaskIds.has(local.id)) {
          // 远端没有此任务：可能是本地新增（需推送），也可能是远端已删除（需本地清理）。
          if (lastSyncMs !== null && new Date(local.updatedAt).getTime() <= lastSyncMs) {
            // 本地任务在上次同步后未修改，远端却缺失 → 远端已删除
            remoteDeletedTaskIds.add(local.id);
            continue; // 不推回远端
          }
          pushPromises.push(
            apiCreateTask(local).catch((e) => {
              // 收集失败推送，同步结束后统一上报，避免静默丢失（H4）
              failedPushIds.push(local.id);
              console.warn('Sync: push task failed:', e);
            }),
          );
        } else {
          // 推送本地更新的任务
          const remote = remoteTasks.find((r) => r.id === local.id);
          if (remote && new Date(local.updatedAt) > new Date(remote.updatedAt)) {
            pushPromises.push(
              apiUpdateTask(local.id, local).catch((e) => {
                failedPushIds.push(local.id);
                console.warn('Sync: update task failed:', e);
              }),
            );
          }
        }
      }
      // 从合并结果中移除远端已删除的任务，避免本地保留后被下次同步推回远端
      for (const id of remoteDeletedTaskIds) {
        taskMap.delete(id);
      }

      // projects/categories/tags：远端非空时整体替换（远端删除的条目自然被剔除）；
      // 远端为空时，若已同步过（lastSyncMs !== null），清理本地在上次同步后未修改的条目
      // （视为远端已删除），避免已删除条目在本地残留。
      const filterRemoteDeleted = <T extends { id: string; updatedAt: Date }>(
        localList: T[],
        remoteIds: Set<string>,
      ): T[] => {
        if (lastSyncMs === null) return localList;
        return localList.filter((local) => {
          if (remoteIds.has(local.id)) return true;
          // 远端缺失：本地在上次同步后未修改 → 视为远端已删除
          return new Date(local.updatedAt).getTime() > lastSyncMs;
        });
      };

      const remoteProjectIds = new Set(remoteProjects.map((p) => p.id));
      const remoteCategoryIds = new Set(remoteCategories.map((c) => c.id));
      const remoteTagIds = new Set(remoteTags.map((t) => t.id));

      const mergedProjects =
        remoteProjects.length > 0 ? remoteProjects : filterRemoteDeleted(get().projects, remoteProjectIds);
      const mergedCategories =
        remoteCategories.length > 0
          ? remoteCategories
          : filterRemoteDeleted(get().categories, remoteCategoryIds);
      const mergedTags =
        remoteTags.length > 0 ? remoteTags : filterRemoteDeleted(get().tags, remoteTagIds);

      // 更新本地状态
      set({
        tasks: Array.from(taskMap.values()),
        projects: mergedProjects,
        categories: mergedCategories,
        tags: mergedTags,
      });

      // 等待推送完成（不阻塞错误）
      await Promise.allSettled(pushPromises);

      // 若有推送失败，标记 syncStatus 为 'error' 并记录失败数，便于 UI 提示重试（H4）
      // P0 数据丢失修复:推送失败时**不更新 lastSyncAt**。
      // 否则下次同步时,这些失败的任务会被 lastSyncMs 误判为"上次同步后未修改",
      // 又因为远端没有它们(推送失败),会被当作"远端已删除"清理掉 → 数据丢失。
      // 只有全部推送成功才更新 lastSyncAt。
      const config = get().syncConfig;
      if (failedPushIds.length > 0) {
        console.warn(`Sync: ${failedPushIds.length} 条任务推送失败`, failedPushIds);
        set({
          isSyncing: false,
          syncConfig: { ...config, syncStatus: 'error' },
        });
      } else {
        set({
          lastSyncAt: new Date(),
          isSyncing: false,
          syncConfig: { ...config, syncStatus: 'success' },
        });
      }
      get().saveData();
    } catch (error) {
      // 同步失败：记录 error 到 syncConfig.syncStatus，便于 UI 展示
      const config = get().syncConfig;
      set({
        isSyncing: false,
        syncConfig: { ...config, syncStatus: 'error' },
      });
      console.error('Sync failed:', error);
      throw error;
    }
  },

  setLastSyncAt: (date) => set({ lastSyncAt: date }),

  checkApiAvailability: async () => {
    const available = await isApiAvailable();
    set({ apiAvailable: available });
  },

  setRelayUrl: (url) => {
    const config = get().syncConfig;
    set({ syncConfig: { ...config, relayUrl: url } });
    get().saveData();
  },

  ensureSyncMasterKey: async () => {
    // 复用已有 SMK
    const existing = await loadSyncMasterKey();
    if (existing) {
      set({ smkReady: true });
      return existing;
    }

    // 并发去重：避免并发调用各自 generate 一份 SMK
    if (ensureSmkInFlight) {
      return ensureSmkInFlight;
    }

    const task = (async () => {
      try {
        // 二次检查：可能在等待 in-flight 期间已被另一调用方写入
        const again = await loadSyncMasterKey();
        if (again) {
          set({ smkReady: true });
          return again;
        }
        const smk = generateSyncMasterKey();
        await saveSyncMasterKey(smk);
        set({ smkReady: true });
        return smk;
      } finally {
        ensureSmkInFlight = null;
      }
    })();

    ensureSmkInFlight = task;
    return task;
  },

  startPairing: (role) => {
    set({
      pairing: {
        active: true,
        role,
        code: null,
        codeExpiresAt: null,
        error: null,
      },
    });
  },

  setPairingCode: (code, expiresAt) => {
    const p = get().pairing;
    if (!p.active || p.role !== 'responder') {
      // 仅 responder 角色应展示码；initiator 收到码也不应存到 state
      return;
    }
    set({ pairing: { ...p, code, codeExpiresAt: expiresAt } });
  },

  setPairingError: (error) => {
    const p = get().pairing;
    set({ pairing: { ...p, error } });
  },

  cancelPairing: () => {
    set({ pairing: { ...INITIAL_PAIRING } });
  },

  addPairedDevice: (device) => {
    const config = get().syncConfig;
    const existing = config.pairedDevices ?? [];
    // 去重：同 deviceId 覆盖（更新 publicKey / pairedAt / lastSeenAt）
    const filtered = existing.filter((d) => d.deviceId !== device.deviceId);
    const nextPaired = [...filtered, device];
    const nextProtocol: SyncProtocol = 'e2ee-p2p';
    set({
      syncConfig: {
        ...config,
        pairedDevices: nextPaired,
        syncProtocol: nextProtocol,
      },
      pairing: { ...INITIAL_PAIRING },
    });
    get().saveData();
  },

  removePairedDevice: async (deviceId) => {
    const config = get().syncConfig;
    const existing = config.pairedDevices ?? [];
    const nextPaired = existing.filter((d) => d.deviceId !== deviceId);
    const nextProtocol: SyncProtocol = nextPaired.length === 0 ? 'http-rest' : 'e2ee-p2p';

    set({
      syncConfig: {
        ...config,
        pairedDevices: nextPaired,
        syncProtocol: nextProtocol,
      },
    });
    get().saveData();

    // 删除最后一个配对设备时，重置 SMK。下次重新配对会生成新 SMK，
    // 防止旧 SMK 残留导致新群组配对失败（claimPairingCodeAndPair 会拒绝 SMK 不一致）。
    if (nextPaired.length === 0) {
      await deleteSyncMasterKey();
      set({ smkReady: false });
    }
  },

  setE2EESyncStatus: (status, error = null, activePeerDeviceId = null) => {
    const prev = get().e2eeSync;
    const next: E2EESyncState = {
      status,
      error,
      // success 状态保留上次的 lastSyncAt；其它状态不主动更新
      lastSyncAt: status === 'success' ? Date.now() : prev.lastSyncAt,
      activePeerDeviceId: activePeerDeviceId ?? prev.activePeerDeviceId,
    };
    // idle / error 状态清空 activePeerDeviceId
    if (status === 'idle' || status === 'error') {
      next.activePeerDeviceId = null;
    }
    set({ e2eeSync: next });
  },

  resetE2EESync: async () => {
    const config = get().syncConfig;
    set({
      syncConfig: {
        ...config,
        pairedDevices: [],
        syncProtocol: 'http-rest',
      },
      pairing: { ...INITIAL_PAIRING },
      e2eeSync: { ...INITIAL_E2EE_SYNC },
      smkReady: false,
    });
    get().saveData();
    await deleteSyncMasterKey();
  },
});
