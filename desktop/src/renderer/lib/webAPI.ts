/**
 * gotoAPI 的 Web 实现
 *
 * 替代 Electron preload 的 IPC 桥。所有方法直接操作 IndexedDB,
 * 保持与原 preload/index.ts 导出的 GotoAPI 接口兼容,
 * 让现有 store 代码无需修改即可工作。
 *
 * 鉴权:Web 端用 Web Crypto API 派生密钥(从密码派生)加密保险库,
 * 替代 SQLCipher。锁屏状态保存在内存中(关闭页面后需要重新输入密码)。
 */

import {
  getKV,
  setKV,
  generatePassword,
  generateId,
  remove as idbRemove,
  clearStore as idbClearStore,
} from './indexeddb';
import type {
  Task,
  VaultItem,
  SecuritySettings,
  SyncState,
  SyncPeerInfo,
  PairedDevice,
} from '../../shared/types';
import { useAppStore } from '../../shared/store';
import { browserStorage } from '../../shared/utils/browserStorage';
import type { AppStore } from '../../shared/store/types';
import { bytesToHex, hexToBytes } from '../../shared/sync/bytes';
import {
  claimPairingCodeAndPair,
  generatePairingCode,
  type PairingResult,
} from '../../shared/sync/pairingService';
import { loadDeviceIdentity } from '../../shared/sync/syncIdentity';
import { argon2id } from 'hash-wasm';

/**
 * 校验 relayUrl 形如 `http(s)://host[:port]`，与 useSyncRuntime 中的校验一致。
 * 仅挡住明显错误的输入(空串、缺协议、缺 host)，不做深度 URL 校验。
 */
function isValidRelayUrl(url: string): boolean {
  if (!url) return false;
  return /^https?:\/\/[^/\s]+(:\d+)?(\/[^\s]*)?$/.test(url);
}

// ===== 类型定义(与 preload 导出的 GotoAPI 对齐) =====

type AppEventChannel = 'app:lock' | 'app:newTask';
type EventCallback = () => void;

interface GotoAPI {
  auth: {
    unlock: (password: string) => Promise<boolean>;
    setupMasterPassword: (password: string) => Promise<boolean>;
    changePassword: (
      oldPassword: string,
      newPassword: string,
    ) => Promise<{ success: boolean; message: string }>;
    factoryReset: () => Promise<{ success: boolean; message: string }>;
    lock: () => Promise<void>;
    isUnlocked: () => Promise<boolean>;
    hasVerifier: () => Promise<boolean>;
  };
  tasks: {
    list: () => Promise<Task[]>;
    create: (task: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> & Pick<Task, 'title'>) => Promise<Task>;
    update: (id: string, updates: Partial<Task>) => Promise<Task>;
    delete: (id: string) => Promise<void>;
  };
  vault: {
    list: () => Promise<VaultItem[]>;
    create: (item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<VaultItem>;
    update: (id: string, updates: Partial<VaultItem>) => Promise<VaultItem>;
    delete: (id: string) => Promise<void>;
    generatePassword: (length: number) => Promise<string>;
  };
  security: {
    getSettings: () => Promise<SecuritySettings>;
    setSettings: (settings: SecuritySettings) => Promise<void>;
    clearClipboard: () => Promise<void>;
  };
  backup: {
    exportBackup: (password: string, defaultFileName?: string) => Promise<{ success: boolean; message: string }>;
    importBackup: (password: string, newPassword?: string) => Promise<{ success: boolean; message: string }>;
    exportJson: (defaultFileName?: string) => Promise<{ success: boolean; message: string }>;
    importJson: (password: string) => Promise<{ success: boolean; message: string }>;
  };
  sync: {
    getState: () => Promise<SyncState>;
    setEnabled: (enabled: boolean) => Promise<void>;
    setRelayUrl: (url: string) => Promise<void>;
    syncNow: () => Promise<void>;
    generatePairingCode: () => Promise<{ code: string; expiresAt: number }>;
    claimPairingCode: (code: string) => Promise<{ success: boolean; message?: string }>;
    removeDevice: (deviceId: string) => Promise<void>;
    onStateChanged: (callback: (state: SyncState) => void) => () => void;
    onPeerStateChanged: (callback: (peers: SyncPeerInfo[]) => void) => () => void;
  };
  app: {
    on: (channel: AppEventChannel, callback: EventCallback) => void;
    off: (channel: AppEventChannel, callback: EventCallback) => void;
  };
}

// ===== 鉴权状态(Web 端:内存中保存解锁状态) =====

let unlocked = false;
let authVerifier: string | null = null;

// 默认安全设置(与 securitySettingsStore 的 DEFAULT_SETTINGS 保持一致;
// 任意一方修改必须同步另一方,否则用户首次进入设置页会看到 store 默认值
// 与 webAPI 默认值打架 — 安全敏感字段以更严格的值为准)
const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  lockMethod: 'password',
  autoLockMinutes: 5,
  clipboardClearSeconds: 30,
  screenshotProtection: true,
  privacyModeEnabled: false,
};

// ===== Web Crypto 鉴权(argon2id,GOTO_PIVOT_PLAN §4.5 / A17 升级) =====
//
// KDF 从 PBKDF2-SHA256 升级为 argon2id(m=64MB, t=3, p=4, hashLength=32)。
// 旧 PBKDF2 verifier 与旧 PBKDF2 备份仍可识别与解密(双算法兼容);
// 新 verifier 与新备份一律使用 argon2id。

// argon2id 参数(GOTO_PIVOT_PLAN §4.5)
const ARGON2ID_MEMORY_KB = 64 * 1024; // 64 MiB,hash-wasm 以 KiB 为单位
const ARGON2ID_TIME_COST = 3;
const ARGON2ID_PARALLELISM = 4;
const ARGON2ID_HASH_LENGTH = 32;

// 旧版 PBKDF2 参数(双算法兼容,只读旧数据时使用)
const AUTH_ITERATIONS_PBKDF2 = 100_000; // 旧 auth verifier
const BACKUP_ITERATIONS_PBKDF2 = 600_000; // 旧加密备份

// 备份头算法标识(头第 5 字节,原 version 字段复用为 algo)
const BACKUP_ALGO_PBKDF2 = 0x01; // 旧版:PBKDF2-SHA256
const BACKUP_ALGO_ARGON2ID = 0x02; // 新版:argon2id

/**
 * Session 内派生密钥缓存。
 * 键:`${algo}:${saltHex}:${password}`,值:派生密钥 ArrayBuffer。
 * 首次派生 argon2id ≈ 800ms(64MB 内存 + t=3),Session 内同参数再次命中 0ms。
 * 仅主线程缓存;Worker 内不缓存(每次独立派生,避免跨线程同步)。
 */
const derivedKeyCache = new Map<string, ArrayBuffer>();

/**
 * hex 编解码统一复用 @shared/sync/bytes(此前 webAPI 内另有一份副本,已删除)。
 * keyBits 为 ArrayBuffer,转 hex 时包一层 Uint8Array。
 */

/**
 * 从密码派生密钥位(256 位 ArrayBuffer)。
 *
 * 默认 argon2id(GOTO_PIVOT_PLAN §4.5);`algorithm='pbkdf2'` 时走旧 PBKDF2 路径,
 * 用于解密旧备份与验证旧 verifier。Session 内同 (algo, salt, password) 命中缓存,
 * 二次调用 0ms(首次 ≈ 800ms)。
 */
export async function deriveKeyBits(
  password: string,
  salt: Uint8Array,
  algorithm: 'argon2id' | 'pbkdf2' = 'argon2id',
  iterations: number = BACKUP_ITERATIONS_PBKDF2,
): Promise<ArrayBuffer> {
  const saltHex = bytesToHex(salt);
  const cacheKey = `${algorithm}:${saltHex}:${password}`;
  const cached = derivedKeyCache.get(cacheKey);
  if (cached) {
    // 调用方(importKey/deriveBits)不修改源 buffer,可直接共享。
    return cached;
  }

  let bits: ArrayBuffer;
  if (algorithm === 'argon2id') {
    const result = await argon2id({
      password,
      salt,
      parallelism: ARGON2ID_PARALLELISM,
      iterations: ARGON2ID_TIME_COST,
      memorySize: ARGON2ID_MEMORY_KB,
      hashLength: ARGON2ID_HASH_LENGTH,
      outputType: 'binary',
    });
    // result 是 Uint8Array(可能是大 buffer 的 view),复制为独立 ArrayBuffer 以缓存。
    bits = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
  } else {
    // PBKDF2(旧版兼容)
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const saltBuffer = salt.buffer.slice(
      salt.byteOffset,
      salt.byteOffset + salt.byteLength,
    ) as ArrayBuffer;
    bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBuffer, iterations, hash: 'SHA-256' },
      keyMaterial,
      256,
    );
  }

  derivedKeyCache.set(cacheKey, bits);
  return bits;
}

/** 清空 Session 派生密钥缓存(锁屏 / 测试时调用)。 */
export function clearDerivedKeyCache(): void {
  derivedKeyCache.clear();
}

/**
 * 创建密码验证器(argon2id)。格式:`2:saltHex:keyHex`。
 * 首位 `2` = argon2id 算法标识(与旧版 `saltHex:keyHex` 区分)。
 */
export async function createVerifier(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyBits = await deriveKeyBits(password, salt, 'argon2id');
  return `2:${bytesToHex(salt)}:${bytesToHex(new Uint8Array(keyBits))}`;
}

/**
 * 验证密码是否匹配验证器。支持双格式:
 *   - 新格式 `2:saltHex:keyHex`:argon2id
 *   - 旧格式 `saltHex:keyHex`:PBKDF2-SHA256 100k(legacy)
 * 验证旧 PBKDF2 verifier 通过后,由调用方(unlock)负责迁移为 argon2id。
 */
export async function verifyPassword(password: string, verifier: string): Promise<boolean> {
  const parts = verifier.split(':');
  let algorithm: 'argon2id' | 'pbkdf2';
  let saltHex: string;
  let expectedKeyHex: string;

  if (parts.length === 3) {
    // 新格式: algo:salt:key
    algorithm = parts[0] === '2' ? 'argon2id' : 'pbkdf2';
    saltHex = parts[1];
    expectedKeyHex = parts[2];
  } else if (parts.length === 2) {
    // 旧格式: salt:key(PBKDF2, 100k 迭代)
    algorithm = 'pbkdf2';
    saltHex = parts[0];
    expectedKeyHex = parts[1];
  } else {
    return false;
  }

  const salt = hexToBytes(saltHex);
  const iterations = AUTH_ITERATIONS_PBKDF2;
  const keyBits = await deriveKeyBits(password, salt, algorithm, iterations);
  return bytesToHex(new Uint8Array(keyBits)) === expectedKeyHex;
}

/** 判断 verifier 是否为旧 PBKDF2 格式(需要迁移到 argon2id)。 */
function isLegacyVerifier(verifier: string): boolean {
  // 新格式以 `2:` 开头;否则视为旧 PBKDF2。
  return !verifier.startsWith('2:');
}

// ===== 加密备份(argon2id + AES-256-GCM,双算法兼容,详见 GOTO_PIVOT_PLAN §4.5) =====
//
// 备份头格式(头第 5 字节为算法标识,原 version 字段复用):
//   PBKDF2 (algo=0x01):
//     magic(4B 'GTFB') || algo(1B=0x01) || salt(16B) || iterations(4B BE) || iv(12B) || ct
//   argon2id (algo=0x02, 新版默认):
//     magic(4B 'GTFB') || algo(1B=0x02) || salt(16B) || iv(12B) || ct
//   - argon2id 参数(m=64MB t=3 p=4)为常量,不写入头(节省 4 字节 + 简化解码)
//   - per-backup 16B 随机 salt + per-backup 12B 随机 IV(禁复用)
//   - 解锁(派生+解密)在 Web Worker 执行,避免主线程阻塞;
//     Worker 创建失败(如 Node 测试环境)时回退主线程。

const BACKUP_MAGIC = [0x47, 0x54, 0x46, 0x42] as const; // 'GTFB' = Goto Backup
const BACKUP_SALT_BYTES = 16;
const BACKUP_IV_BYTES = 12;
// PBKDF2 头多 4 字节 iterations;argon2id 头无 iterations。
const BACKUP_HEADER_PBKDF2_LEN = 4 + 1 + BACKUP_SALT_BYTES + 4 + BACKUP_IV_BYTES; // 37
const BACKUP_HEADER_ARGON2ID_LEN = 4 + 1 + BACKUP_SALT_BYTES + BACKUP_IV_BYTES; // 33

/**
 * 主线程回退:Worker 不可用时直接派生 + 加解密。
 * 走 deriveKeyBits 以复用 Session 缓存(同密码 + 同 salt 二次调用 0ms)。
 */
async function runBackupCryptoMain(
  op: 'encrypt' | 'decrypt',
  password: string,
  salt: Uint8Array,
  iv: Uint8Array,
  algorithm: number,
  iterations: number,
  payload: string | Uint8Array,
): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const ivBuf = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const algo: 'argon2id' | 'pbkdf2' = algorithm === BACKUP_ALGO_ARGON2ID ? 'argon2id' : 'pbkdf2';
  const bits = await deriveKeyBits(password, salt, algo, iterations);
  const key = await crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
  const data = typeof payload === 'string' ? enc.encode(payload) : new Uint8Array(payload);
  if (op === 'encrypt') {
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuf }, key, data);
  }
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, key, data);
}

/**
 * 在 Web Worker 中执行备份加解密。每次操作创建独立 Worker 并 terminate,
 * 避免跨调用状态残留。Worker 创建失败时回退主线程。
 * Worker 内部加解密失败(如密码错误)通过 ok:false 透出,不回退主线程
 * (否则错误密码会触发两次 argon2id 派生)。
 *
 * Worker 文件改为独立模块 Worker(backupCrypto.worker.ts),以便静态 import
 * hash-wasm;原内联 Blob Worker 无法 import ESM 模块。
 */
async function runBackupCrypto(
  op: 'encrypt' | 'decrypt',
  password: string,
  salt: Uint8Array,
  iv: Uint8Array,
  algorithm: number,
  iterations: number,
  payload: string | Uint8Array,
): Promise<ArrayBuffer> {
  if (typeof Worker !== 'undefined') {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL('./backupCrypto.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      // Worker 创建失败(CSP / 非浏览器环境):回退主线程。
      return runBackupCryptoMain(op, password, salt, iv, algorithm, iterations, payload);
    }
    try {
      return await new Promise<ArrayBuffer>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent) => {
          const d = (e.data || {}) as { ok?: boolean; result?: ArrayBuffer; error?: string };
          if (d.ok) resolve(d.result as ArrayBuffer);
          else reject(new Error(d.error || '备份解密失败:密码错误或文件损坏'));
        };
        worker.onerror = () => reject(new Error('备份 Worker 执行失败'));
        worker.postMessage({ op, password, salt, iv, algorithm, iterations, payload });
      });
    } finally {
      worker.terminate();
    }
  }
  return runBackupCryptoMain(op, password, salt, iv, algorithm, iterations, payload);
}

/**
 * 加密明文,返回 argon2id 格式备份二进制:
 *   magic(4B) || algo(1B=0x02) || salt(16B) || iv(12B) || ct
 */
export async function encryptBackup(password: string, plaintext: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(BACKUP_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(BACKUP_IV_BYTES));
  const ct = new Uint8Array(
    await runBackupCrypto('encrypt', password, salt, iv, BACKUP_ALGO_ARGON2ID, 0, plaintext),
  );
  const out = new Uint8Array(BACKUP_HEADER_ARGON2ID_LEN + ct.length);
  out.set(BACKUP_MAGIC, 0);
  out[4] = BACKUP_ALGO_ARGON2ID;
  out.set(salt, 5);
  out.set(iv, 5 + BACKUP_SALT_BYTES);
  out.set(ct, BACKUP_HEADER_ARGON2ID_LEN);
  return out;
}

/**
 * 解密备份二进制,返回明文字符串。密码错误时抛出。
 * 根据头第 5 字节(algo)分发到 PBKDF2 或 argon2id 派生路径(双算法兼容)。
 */
export async function decryptBackup(password: string, bytes: Uint8Array): Promise<string> {
  const algo = bytes[4];
  let offset = 5;
  const salt = bytes.slice(offset, offset + BACKUP_SALT_BYTES);
  offset += BACKUP_SALT_BYTES;
  let iterations = 0;
  if (algo === BACKUP_ALGO_PBKDF2) {
    iterations = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      .getUint32(offset, false);
    offset += 4;
  }
  const iv = bytes.slice(offset, offset + BACKUP_IV_BYTES);
  offset += BACKUP_IV_BYTES;
  const ct = bytes.slice(offset);
  const pt = await runBackupCrypto('decrypt', password, salt, iv, algo, iterations, ct);
  return new TextDecoder().decode(pt);
}

/**
 * 判断二进制是否为本格式加密备份。
 * 头 4 字节为 'GTFB' magic,第 5 字节为已知算法标识(0x01 或 0x02)。
 */
export function isEncryptedBackup(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  for (let i = 0; i < BACKUP_MAGIC.length; i++) {
    if (bytes[i] !== BACKUP_MAGIC[i]) return false;
  }
  return bytes[4] === BACKUP_ALGO_PBKDF2 || bytes[4] === BACKUP_ALGO_ARGON2ID;
}

/**
 * 用旧 PBKDF2 算法加密明文(仅用于生成兼容性测试 fixture,生产路径不调用)。
 * 头格式与旧版完全一致:magic || 0x01 || salt || iterations || iv || ct。
 */
export async function encryptBackupLegacyPbkdf2(
  password: string,
  plaintext: string,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(BACKUP_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(BACKUP_IV_BYTES));
  const ct = new Uint8Array(
    await runBackupCrypto(
      'encrypt',
      password,
      salt,
      iv,
      BACKUP_ALGO_PBKDF2,
      BACKUP_ITERATIONS_PBKDF2,
      plaintext,
    ),
  );
  const out = new Uint8Array(BACKUP_HEADER_PBKDF2_LEN + ct.length);
  out.set(BACKUP_MAGIC, 0);
  out[4] = BACKUP_ALGO_PBKDF2;
  out.set(salt, 5);
  new DataView(out.buffer).setUint32(5 + BACKUP_SALT_BYTES, BACKUP_ITERATIONS_PBKDF2, false);
  out.set(iv, 9 + BACKUP_SALT_BYTES);
  out.set(ct, BACKUP_HEADER_PBKDF2_LEN);
  return out;
}

// ===== 事件系统 =====

const eventListeners: Map<AppEventChannel, Set<EventCallback>> = new Map();

function emitEvent(channel: AppEventChannel) {
  const listeners = eventListeners.get(channel);
  if (listeners) {
    listeners.forEach((cb) => cb());
  }
}

// ===== API 实现 =====

export const webAPI: GotoAPI = {
  auth: {
    unlock: async (password: string) => {
      if (!authVerifier) {
        authVerifier = await getKV<string>('app_settings', 'auth_verifier') || null;
      }
      if (!authVerifier) {
        // 首次运行尚未设置主密码：不允许用任意密码静默解锁，
        // 必须由 setupMasterPassword 显式设置后才能解锁。
        return false;
      }
      const valid = await verifyPassword(password, authVerifier);
      if (valid && isLegacyVerifier(authVerifier)) {
        // A17 迁移:旧 PBKDF2 verifier 验证通过后,升级为 argon2id 并持久化。
        // 失败不阻塞解锁(已验证密码正确),下次 unlock 会再尝试。
        try {
          authVerifier = await createVerifier(password);
          await setKV('app_settings', 'auth_verifier', authVerifier);
        } catch {
          // 迁移失败保留旧 verifier,不影响本次解锁。
        }
      }
      unlocked = valid;
      return valid;
    },
    setupMasterPassword: async (password: string) => {
      // 引导式设置：仅在未设置过 verifier 时创建；密码强度由 UI 校验（非空且 ≥8 位）。
      const existing = await getKV<string>('app_settings', 'auth_verifier');
      if (existing) return false;
      if (!password || password.length < 8) return false;
      authVerifier = await createVerifier(password);
      await setKV('app_settings', 'auth_verifier', authVerifier);
      unlocked = true;
      return true;
    },
    changePassword: async (oldPassword: string, newPassword: string) => {
      // 修改主密码:验证旧密码 → 用新密码生成新 verifier → 覆盖持久化。
      //
      // 注意:本机 IndexedDB 内的任务 / 保险库数据是明文存的,不依赖 master
      // password 解密,所以无需重加密。但**已有备份文件**仍用旧密码加密,
      // 修改主密码后旧备份只能用旧密码解密 — UI 需提示用户。
      if (!authVerifier) {
        authVerifier = (await getKV<string>('app_settings', 'auth_verifier')) || null;
      }
      if (!authVerifier) {
        return { success: false, message: '尚未设置主密码,无需修改' };
      }
      const valid = await verifyPassword(oldPassword, authVerifier);
      if (!valid) {
        return { success: false, message: '当前密码错误' };
      }
      if (!newPassword || newPassword.length < 8) {
        return { success: false, message: '新密码至少需要 8 位' };
      }
      if (oldPassword === newPassword) {
        return { success: false, message: '新密码不能与当前密码相同' };
      }
      try {
        authVerifier = await createVerifier(newPassword);
        await setKV('app_settings', 'auth_verifier', authVerifier);
        // 清空派生密钥缓存,避免旧密码派生的密钥残留可被复用
        clearDerivedKeyCache();
        return { success: true, message: '主密码已更新。注意:此前生成的加密备份仍需使用旧密码恢复。' };
      } catch (e) {
        return {
          success: false,
          message: `更新失败:${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
    factoryReset: async () => {
      // 恢复出厂:清空所有 IndexedDB 持久化数据 + auth_verifier + 安全设置。
      // 调用方应在调用后执行 window.location.reload() 让应用重启到首次启动状态。
      try {
        // 1. 清应用主数据(persistenceSlice 使用的 goto-async-storage DB)
        await browserStorage.clear();
        // 2. 清 auth_verifier + security_settings(存在 goto DB)
        await idbRemove('app_settings', 'auth_verifier');
        await idbClearStore('security_settings');
        // 3. 清内存状态
        authVerifier = null;
        unlocked = false;
        clearDerivedKeyCache();
        return { success: true, message: '已恢复出厂设置,即将重启应用…' };
      } catch (e) {
        return {
          success: false,
          message: `恢复出厂失败:${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
    lock: async () => {
      unlocked = false;
      // 锁屏时清空 Session 派生密钥缓存,避免解锁后残留派生密钥。
      clearDerivedKeyCache();
    },
    isUnlocked: async () => unlocked,
    hasVerifier: async () => {
      if (!authVerifier) {
        authVerifier = await getKV<string>('app_settings', 'auth_verifier') || null;
      }
      return authVerifier !== null;
    },
  },

  tasks: {
    // 统一数据层:任务读写经共享 store（useAppStore）落到同一 IndexedDB
    // （goto-async-storage），与 loadData 的读取源完全一致，杜绝原先
    // renderer 任务直连独立 IndexedDB（goto）导致的"双数据源"静默数据丢失。
    list: async () => {
      return useAppStore.getState().tasks;
    },
    create: async (task) => {
      const now = new Date();
      const newTask: Task = {
        // 默认值:覆盖移动端 Task 类型的所有必填字段
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
        // 输入覆盖默认值
        ...task,
        // 强制设置
        id: generateId('task'),
        createdAt: now,
        updatedAt: now,
      };
      const state = useAppStore.getState();
      useAppStore.setState({ tasks: [...state.tasks, newTask] });
      // setState 之后重新取 state 调 saveData,避免使用 setState 前的陈旧闭包
      // (saveData 内部 get() 也会取最新 state,这里显式重取是为了代码可读性 + 防 future 回归)
      await useAppStore.getState().saveData();
      return newTask;
    },
    update: async (id, updates) => {
      const state = useAppStore.getState();
      const existing = state.tasks.find((t) => t.id === id);
      if (!existing) throw new Error(`Task ${id} not found`);
      const updated: Task = {
        ...existing,
        ...updates,
        id,
        updatedAt: new Date(),
      };
      useAppStore.setState({ tasks: state.tasks.map((t) => (t.id === id ? updated : t)) });
      await useAppStore.getState().saveData();
      return updated;
    },
    delete: async (id) => {
      const state = useAppStore.getState();
      useAppStore.setState({ tasks: state.tasks.filter((t) => t.id !== id) });
      await useAppStore.getState().saveData();
    },
  },

  vault: {
    // 统一数据层:保险库读写经共享 store（useAppStore.vaultItems）落到同一
    // IndexedDB（goto-async-storage），与 loadData 读取源一致。
    list: async () => {
      return useAppStore.getState().vaultItems;
    },
    create: async (item) => {
      const now = new Date();
      const newItem: VaultItem = {
        ...item,
        id: generateId('vault'),
        createdAt: now,
        updatedAt: now,
      };
      const state = useAppStore.getState();
      useAppStore.setState({ vaultItems: [...state.vaultItems, newItem] });
      await useAppStore.getState().saveData();
      return newItem;
    },
    update: async (id, updates) => {
      const state = useAppStore.getState();
      const existing = state.vaultItems.find((v) => v.id === id);
      if (!existing) throw new Error(`Vault item ${id} not found`);
      const updated: VaultItem = {
        ...existing,
        ...updates,
        id,
        updatedAt: new Date(),
      };
      useAppStore.setState({
        vaultItems: state.vaultItems.map((v) => (v.id === id ? updated : v)),
      });
      await useAppStore.getState().saveData();
      return updated;
    },
    delete: async (id) => {
      const state = useAppStore.getState();
      useAppStore.setState({ vaultItems: state.vaultItems.filter((v) => v.id !== id) });
      await useAppStore.getState().saveData();
    },
    generatePassword: async (length: number) => {
      return generatePassword(length);
    },
  },

  security: {
    getSettings: async () => {
      const settings = await getKV<SecuritySettings>('security_settings', 'settings');
      return settings || DEFAULT_SECURITY_SETTINGS;
    },
    setSettings: async (settings: SecuritySettings) => {
      await setKV('security_settings', 'settings', settings);
    },
    clearClipboard: async () => {
      try {
        await navigator.clipboard.writeText('');
      } catch {
        // 非 HTTPS 环境下 clipboard API 不可用,静默忽略
      }
    },
  },

  backup: {
    exportBackup: async (password: string, _defaultFileName?: string) => {
      try {
        if (!password) return { success: false, message: '需要解锁密码以加密备份' };
        const data = await exportAllData();
        const plaintext = JSON.stringify(data, null, 2);
        const encrypted = await encryptBackup(password, plaintext);
        const blob = new Blob([encrypted as BlobPart], { type: 'application/octet-stream' });
        triggerDownload(blob, `goto-backup-${Date.now()}.gbak`);
        return { success: true, message: '已导出加密备份(argon2id m=64MB t=3 p=4 + AES-256-GCM)' };
      } catch (e) {
        return { success: false, message: (e as Error).message };
      }
    },
    importBackup: async (password: string, _newPassword?: string) => {
      // Web 端导入需要文件选择器,这里触发文件选择
      try {
        const file = await pickFile('.gbak,.json');
        if (!file) return { success: false, message: '未选择文件' };
        const bytes = new Uint8Array(await file.arrayBuffer());
        let jsonText: string;
        if (isEncryptedBackup(bytes)) {
          // 加密备份:用密码解密(密码错误会抛出)
          try {
            jsonText = await decryptBackup(password, bytes);
          } catch {
            return { success: false, message: '密码错误或备份已损坏' };
          }
        } else {
          // 兼容旧版明文 JSON 备份
          jsonText = new TextDecoder().decode(bytes);
        }
        await importAllData(JSON.parse(jsonText));
        return { success: true, message: '备份导入成功' };
      } catch (e) {
        return { success: false, message: (e as Error).message };
      }
    },
    exportJson: async (_defaultFileName?: string) => {
      // 明文 JSON 导出(可选项,不加密,用于调试/迁移)
      try {
        const data = await exportAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        triggerDownload(blob, `goto-export-${Date.now()}.json`);
        return { success: true, message: '已导出明文 JSON(未加密,请妥善保管)' };
      } catch (e) {
        return { success: false, message: (e as Error).message };
      }
    },
    importJson: async (_password: string) => {
      // 明文 JSON 导入(不解密,直接解析)
      try {
        const file = await pickFile('.json');
        if (!file) return { success: false, message: '未选择文件' };
        const text = await file.text();
        await importAllData(JSON.parse(text));
        return { success: true, message: 'JSON 导入成功' };
      } catch (e) {
        return { success: false, message: (e as Error).message };
      }
    },
  },

  sync: {
    getState: async () => {
      const state = await getKV<SyncState>('app_settings', 'sync_state');
      return state || {
        enabled: false,
        relayUrl: '',
        devices: [],
        lastSyncAt: null,
      };
    },
    setEnabled: async (enabled: boolean) => {
      const state = await webAPI.sync.getState();
      await setKV('app_settings', 'sync_state', { ...state, enabled });
    },
    setRelayUrl: async (url: string) => {
      const state = await webAPI.sync.getState();
      await setKV('app_settings', 'sync_state', { ...state, relayUrl: url });
    },
    syncNow: async () => {
      await useAppStore.getState().performSync();
    },
    generatePairingCode: async () => {
      const store = useAppStore.getState();
      let relayUrl = store.syncConfig.relayUrl;
      if (!relayUrl) {
        const syncState = await webAPI.sync.getState();
        relayUrl = syncState.relayUrl;
      }
      if (!relayUrl || !isValidRelayUrl(relayUrl)) {
        throw new Error('请先配置有效的 relay 地址(以 http:// 或 https:// 开头)');
      }

      // 确保设备身份已就绪
      let identity = await loadDeviceIdentity();
      if (!identity) {
        await store.ensureDeviceIdentity('Goto Web');
        identity = await loadDeviceIdentity();
      }
      if (!identity) {
        throw new Error('无法加载或生成设备身份');
      }

      return generatePairingCode(relayUrl, identity);
    },
    claimPairingCode: async (code: string) => {
      // 接通真实配对流程(pairingService.claimPairingCodeAndPair):
      //   1) relay claim 接口认证并返回 pairedDeviceId + wsUrl
      //   2) 建立 WS,握手 (Ed25519 + ECDH),接收 SMK_TRANSFER,解密落盘
      // 配对成功后通过 onPaired 回调把对端写入 store.addPairedDevice。
      try {
        if (!code) {
          return { success: false, message: '请输入配对码' };
        }

        // 优先从 syncConfig 取 relayUrl(与 useSyncRuntime 一致),
        // 回退到 IndexedDB 持久化的 sync_state(webAPI.sync.setRelayUrl 写入处)
        const store = useAppStore.getState();
        let relayUrl = store.syncConfig.relayUrl;
        if (!relayUrl) {
          const syncState = await webAPI.sync.getState();
          relayUrl = syncState.relayUrl;
        }
        if (!relayUrl || !isValidRelayUrl(relayUrl)) {
          return {
            success: false,
            message: '请先配置有效的 relay 地址(以 http:// 或 https:// 开头)',
          };
        }

        // 加载或生成设备身份(Ed25519)。首次调用时由 store slice 生成并落盘。
        let identity = await loadDeviceIdentity();
        if (!identity) {
          await store.ensureDeviceIdentity('Goto Web');
          identity = await loadDeviceIdentity();
        }
        if (!identity) {
          return { success: false, message: '设备身份尚未就绪,请稍候重试' };
        }

        // 把 PairingResult 转成 PairedDevice 写入 slice。
        // 与 useSyncRuntime.handlePaired 行为一致(不在 webAPI 内启动 SyncEngine,
        // 由桌面端 useSyncRuntime 在挂载时按 pairedDevices 启动)。
        const onPaired = (peer: PairingResult): void => {
          const now = Date.now();
          const device: PairedDevice = {
            deviceId: peer.peerDeviceId,
            name: peer.peerName,
            publicKeyPem: peer.peerPublicKeyPem,
            pairedAt: new Date(now),
            lastSeenAt: new Date(now),
          };
          useAppStore.getState().addPairedDevice(device);
        };

        await claimPairingCodeAndPair(relayUrl, identity, code, onPaired);
        return { success: true, message: '配对成功' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, message: msg };
      }
    },
    removeDevice: async (deviceId: string) => {
      const state = await webAPI.sync.getState();
      await setKV('app_settings', 'sync_state', {
        ...state,
        devices: state.devices.filter((d) => d.deviceId !== deviceId),
      });
    },
    onStateChanged: (callback) => {
      // 简化:定时轮询状态变化
      const interval = setInterval(async () => {
        const state = await webAPI.sync.getState();
        callback(state);
      }, 5000);
      return () => clearInterval(interval);
    },
    onPeerStateChanged: (_callback: (peers: SyncPeerInfo[]) => void) => {
      // Web 端暂无 peer 状态实时推送,返回空监听器
      return () => {};
    },
  },

  app: {
    on: (channel: AppEventChannel, callback: EventCallback) => {
      if (!eventListeners.has(channel)) {
        eventListeners.set(channel, new Set());
      }
      eventListeners.get(channel)!.add(callback);
    },
    off: (channel: AppEventChannel, callback: EventCallback) => {
      eventListeners.get(channel)?.delete(callback);
    },
  },
};

// ===== 辅助函数 =====

/**
 * 导出所有数据(用于备份)。
 * 统一数据层:直接读取共享 store 的当前内存状态，与 loadData 的持久化源一致。
 */
async function exportAllData(): Promise<Record<string, unknown>> {
  const s = useAppStore.getState();
  return {
    tasks: s.tasks,
    vault: s.vaultItems,
    projects: s.projects,
    categories: s.categories,
    tags: s.tags,
    habits: s.habits,
    templates: s.templates,
    goals: s.goals,
  };
}

/**
 * 导入数据(用于恢复备份)。
 * 将 JSON 对象中的每个实体直接写入共享 store 并持久化到统一的 IndexedDB，
 * 与 loadData 的读取源保持一致。
 */
async function importAllData(data: Record<string, unknown>): Promise<void> {
  const patch: Partial<AppStore> = {};
  if (Array.isArray(data.tasks)) patch.tasks = data.tasks as AppStore['tasks'];
  if (Array.isArray(data.vault)) patch.vaultItems = data.vault as AppStore['vaultItems'];
  if (Array.isArray(data.projects)) patch.projects = data.projects as AppStore['projects'];
  if (Array.isArray(data.categories)) patch.categories = data.categories as AppStore['categories'];
  if (Array.isArray(data.tags)) patch.tags = data.tags as AppStore['tags'];
  if (Array.isArray(data.habits)) patch.habits = data.habits as AppStore['habits'];
  if (Array.isArray(data.templates)) patch.templates = data.templates as AppStore['templates'];
  if (Array.isArray(data.goals)) patch.goals = data.goals as AppStore['goals'];
  useAppStore.setState(patch);
  await useAppStore.getState().saveData();
}

/**
 * 触发浏览器文件下载。
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 弹出文件选择器,返回用户选择的文件。
 */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    // 用户取消时不会触发 onchange,这里给一个超时
    setTimeout(() => resolve(null), 60000);
    input.click();
  });
}

/**
 * 初始化:将 webAPI 注入到 window.gotoAPI。
 * 在应用启动时调用。
 */
export function initWebAPI(): void {
  if (typeof window !== 'undefined') {
    (window as unknown as { gotoAPI: typeof webAPI }).gotoAPI = webAPI;
  }
}

export { emitEvent };
export type { GotoAPI, AppEventChannel, EventCallback };
