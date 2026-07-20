// 移动端同步存储 —— SyncRecord 管理 + SMK 持久化 + SyncStore 抽象。
// 桌面端基于 SQLite，移动端用「内存 Map + secureStorage」：SyncRecord 内存索引，
// SMK 存 Keychain/Keystore，配对设备由 syncSlice.pairedDevices 管理。
// SyncStore 接口异步（Web Crypto 加密）；encryptedPayload 为 Bytes，线上转 base64。

import { decryptSyncRecord } from './syncCrypto';
import { bytesToBase64, base64ToBytes, utf8Encode } from './bytes';
import { sha256Hex } from './hashUtils';
import type { Bytes } from './bytes';
import { secureGet, secureSet, secureDelete } from '../utils/secureStorage';
import { browserStorage as AsyncStorage } from '../utils/browserStorage';
import type { PairedDevice } from '../types';

const SMK_KEY = 'sync_master_key';

export interface SyncRecord {
  id: string;
  tableName: string;
  recordId: string;
  version: number;
  encryptedPayload: Bytes;
  updatedAt: number;
  deleted: number;
  deviceVersion: Record<string, number>;
}

export interface SyncRecordManifestItem {
  id: string;
  recordId: string;
  version: number;
  updatedAt: number;
  /** sha256(base64(encryptedPayload))，与桌面端 getSyncRecordManifest 一致。 */
  hash: string;
}

interface SyncDevice {
  deviceId: string;
  publicKey: string;
  name: string | null;
  pairedAt: number;
  lastSeenAt: number | null;
}

// 异步 SyncStore 接口

export interface SyncStore {
  getManifest(tableName?: string): Promise<SyncRecordManifestItem[]>;
  getRecordsByIds(ids: string[]): Promise<SyncRecord[]>;
  getRecordById(id: string): Promise<SyncRecord | null>;
  insertRecord(record: SyncRecord): Promise<void>;
  applyRecord(record: SyncRecord, smk: Bytes): Promise<void>;
  /** 批量落库。未提供时引擎退化为逐条 insertRecord + applyRecord。 */
  applyBatch?(records: SyncRecord[], smk: Bytes): Promise<void>;
  listDevices(): SyncDevice[];
  updateLastSyncAt(timestamp: number): void;
}

/** 同步记录业务回写回调：落库后把解密业务对象写回 zustand store。 */
export type SyncRecordApplier = (records: SyncRecord[], smk: Bytes) => Promise<void>;

// SMK 持久化

/** 加载 SMK。不存在返回 null（首次启动 / 已重置）。 */
export async function loadSyncMasterKey(): Promise<Bytes | null> {
  const raw = await secureGet(SMK_KEY);
  if (!raw) return null;
  try {
    return base64ToBytes(raw);
  } catch {
    return null;
  }
}

/** 持久化 SMK 到 Keychain / Keystore。 */
export async function saveSyncMasterKey(smk: Bytes): Promise<void> {
  await secureSet(SMK_KEY, bytesToBase64(smk));
}

/** 删除 SMK（设备重置时调用）。幂等。 */
export async function deleteSyncMasterKey(): Promise<void> {
  await secureDelete(SMK_KEY);
}

// 配对设备查询（从 pairedDevices 派生 getTrustedPublicKey）

/** 创建 getTrustedPublicKey 查询函数，供 SyncSession 非配对握手校验使用。 */
export function createTrustedKeyLookup(
  pairedDevices: PairedDevice[],
): (deviceId: string) => string | undefined {
  const map = new Map<string, string>();
  for (const d of pairedDevices) {
    map.set(d.deviceId, d.publicKeyPem);
  }
  return (deviceId: string) => map.get(deviceId);
}

// 内存 SyncStore 实现

interface MemorySyncState {
  records: Map<string, SyncRecord>;
  devices: SyncDevice[];
  lastSyncAt: number | null;
}

/**
 * 内存 SyncStore。用于测试和初始运行时。
 * opts.applier：落库后把解密业务对象写回 zustand store。
 */
export function createMemorySyncStore(opts?: { applier?: SyncRecordApplier }): SyncStore {
  const state: MemorySyncState = {
    records: new Map(),
    devices: [],
    lastSyncAt: null,
  };
  const applier = opts?.applier;

  return {
    async getManifest(tableName?: string) {
      const out: SyncRecordManifestItem[] = [];
      for (const r of state.records.values()) {
        if (tableName && r.tableName !== tableName) continue;
        // hash = sha256(base64(encryptedPayload))，与桌面端 manifest 一致
        out.push({
          id: r.id,
          recordId: r.recordId,
          version: r.version,
          updatedAt: r.updatedAt,
          hash: await sha256Hex(utf8Encode(bytesToBase64(r.encryptedPayload))),
        });
      }
      return out;
    },

    async getRecordsByIds(ids: string[]) {
      if (ids.length === 0) return [];
      const out: SyncRecord[] = [];
      for (const id of ids) {
        const r = state.records.get(id);
        if (r) out.push(r);
      }
      return out;
    },

    async getRecordById(id: string) {
      return state.records.get(id) ?? null;
    },

    async insertRecord(record: SyncRecord) {
      state.records.set(record.id, record);
    },

    async applyRecord(record: SyncRecord, smk: Bytes) {
      // 落库 sync_record（密文），校验 SMK 正确性，再回写业务层
      state.records.set(record.id, record);
      await decryptSyncRecord(record.encryptedPayload, smk);
      if (applier) {
        await applier([record], smk);
      }
    },

    async applyBatch(records: SyncRecord[], smk: Bytes) {
      for (const r of records) {
        state.records.set(r.id, r);
        await decryptSyncRecord(r.encryptedPayload, smk);
      }
      if (applier) {
        await applier(records, smk);
      }
    },

    listDevices() {
      return [...state.devices];
    },

    updateLastSyncAt(timestamp: number) {
      state.lastSyncAt = timestamp;
    },
  };
}

// 持久化 SyncStore 实现（基于 AsyncStorage）

/** AsyncStorage 中序列化后的 SyncRecord，encryptedPayload 转 base64 存储。 */
interface SerializedSyncRecord {
  id: string;
  tableName: string;
  recordId: string;
  version: number;
  encryptedPayload: string;
  updatedAt: number;
  deleted: number;
  deviceVersion: Record<string, number>;
}

interface SerializedSyncState {
  records: SerializedSyncRecord[];
  lastSyncAt: number | null;
}

const DEFAULT_PERSISTENT_STORAGE_KEY = 'taskflow_sync_records';

/**
 * 基于 AsyncStorage 的持久化 SyncStore。encryptedPayload 是 SMK 密文，可安全落盘。
 * 启动时懒加载到内存 Map，写入时同步落盘。
 */
export function createPersistentSyncStore(opts?: {
  storageKey?: string;
  applier?: SyncRecordApplier;
}): SyncStore {
  const storageKey = opts?.storageKey ?? DEFAULT_PERSISTENT_STORAGE_KEY;
  const applier = opts?.applier;
  const state: MemorySyncState = {
    records: new Map(),
    devices: [],
    lastSyncAt: null,
  };
  let loaded = false;
  let loadPromise: Promise<void> | null = null;

  /** 懒加载：首次访问时从 AsyncStorage 读取记录到内存 Map。后续访问直接命中内存。 */
  function ensureLoaded(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as SerializedSyncState;
          if (parsed && Array.isArray(parsed.records)) {
            for (const r of parsed.records) {
              state.records.set(r.id, {
                id: r.id,
                tableName: r.tableName,
                recordId: r.recordId,
                version: r.version,
                encryptedPayload: base64ToBytes(r.encryptedPayload),
                updatedAt: r.updatedAt,
                deleted: r.deleted,
                deviceVersion: r.deviceVersion ?? {},
              });
            }
          }
          state.lastSyncAt = parsed?.lastSyncAt ?? null;
        }
      } catch (e) {
        // 数据损坏：记录告警，从空状态开始（不影响后续写入）
        console.warn('syncStorage 加载持久化数据失败，从空状态开始', e);
      }
      loaded = true;
    })();
    return loadPromise;
  }

  /** 把内存 state 序列化后写入 AsyncStorage。 */
  async function persist(): Promise<void> {
    const serialized: SerializedSyncState = {
      records: Array.from(state.records.values()).map((r) => ({
        id: r.id,
        tableName: r.tableName,
        recordId: r.recordId,
        version: r.version,
        encryptedPayload: bytesToBase64(r.encryptedPayload),
        updatedAt: r.updatedAt,
        deleted: r.deleted,
        deviceVersion: r.deviceVersion,
      })),
      lastSyncAt: state.lastSyncAt,
    };
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(serialized));
    } catch (e) {
      // AsyncStorage 写入失败（如磁盘满）：记录告警，内存中数据仍可用
      console.warn('syncStorage 持久化写入失败，本次变更仅在内存中', e);
    }
  }

  return {
    async getManifest(tableName?: string) {
      await ensureLoaded();
      const out: SyncRecordManifestItem[] = [];
      for (const r of state.records.values()) {
        if (tableName && r.tableName !== tableName) continue;
        out.push({
          id: r.id,
          recordId: r.recordId,
          version: r.version,
          updatedAt: r.updatedAt,
          hash: await sha256Hex(utf8Encode(bytesToBase64(r.encryptedPayload))),
        });
      }
      return out;
    },

    async getRecordsByIds(ids: string[]) {
      await ensureLoaded();
      if (ids.length === 0) return [];
      const out: SyncRecord[] = [];
      for (const id of ids) {
        const r = state.records.get(id);
        if (r) out.push(r);
      }
      return out;
    },

    async getRecordById(id: string) {
      await ensureLoaded();
      return state.records.get(id) ?? null;
    },

    async insertRecord(record: SyncRecord) {
      await ensureLoaded();
      state.records.set(record.id, record);
      await persist();
    },

    async applyRecord(record: SyncRecord, smk: Bytes) {
      await ensureLoaded();
      // 先解密成功再写入 store，避免坏 SMK/损坏密文残留后无法清理（H6）
      await decryptSyncRecord(record.encryptedPayload, smk);
      state.records.set(record.id, record);
      if (applier) {
        await applier([record], smk);
      }
      await persist();
    },

    async applyBatch(records: SyncRecord[], smk: Bytes) {
      await ensureLoaded();
      // 先全部解密成功再批量写入，任一解密失败则整批不入库
      for (const r of records) {
        await decryptSyncRecord(r.encryptedPayload, smk);
      }
      for (const r of records) {
        state.records.set(r.id, r);
      }
      if (applier) {
        await applier(records, smk);
      }
      await persist();
    },

    listDevices() {
      return [...state.devices];
    },

    updateLastSyncAt(timestamp: number) {
      state.lastSyncAt = timestamp;
      void persist();
    },
  };
}
