/**
 * Web 端安全存储封装。
 *
 * 用 Web Crypto API(AES-GCM)+ IndexedDB 实现敏感数据存储:认证 token、
 * 设备身份私钥(Ed25519)、同步主密钥(SMK)等。
 *
 * 加密方案:首次运行时生成一个随机的 AES-GCM 256 位主密钥,以 raw 字节的
 * base64 形式持久化到 IndexedDB 'app_settings' store 的 'secure_master_key'
 * 键下。每条数据用随机 12 字节 IV 加密,密文与 IV 拼接后转 base64 存储。
 *
 * 除认证相关的 getStoredAuth/setStoredAuth/clearStoredAuth 之外,还暴露一组
 * 通用 KV 接口(secureGet/secureSet/secureDelete),供同步子系统按命名空间
 * 存取密钥材料。所有键统一加 `goto_` 前缀,便于识别与清理。
 */

import { bytesToBase64, base64ToBytes, concatBytes } from '../sync/bytes';

const DB_NAME = 'goto-secure-storage';
const DB_VERSION = 1;
const SECURE_KV_STORE = 'secure_kv';
const SETTINGS_STORE = 'app_settings';
const MASTER_KEY_IDB_KEY = 'secure_master_key';
const IV_LENGTH = 12;

const TOKEN_KEY = 'goto_secure_token';
const USER_KEY = 'goto_secure_user';
const KEY_PREFIX = 'goto_';

// ===== IndexedDB 连接管理 =====

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const indexedDB = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!indexedDB) {
      reject(new Error('IndexedDB 不可用:Web 端安全存储需要浏览器环境'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SECURE_KV_STORE)) {
        db.createObjectStore(SECURE_KV_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('打开安全存储 IndexedDB 失败'));
  });
  return dbPromise;
}

interface KVRecord {
  key: string;
  value: string;
}

/** 在指定 store 上执行单个请求。 */
function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ===== 主密钥管理 =====

let masterKeyPromise: Promise<CryptoKey> | null = null;

function getSubtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error('Web Crypto subtle 不可用:安全存储需要 AES-GCM 支持');
  }
  return c.subtle;
}

/**
 * 加载或生成 AES-GCM 主密钥。
 * 首次运行时 IDB 中不存在主密钥,自动生成 256 位密钥并持久化。
 * CryptoKey 无法直接序列化,因此 exportKey 为 raw 字节后转 base64 存储;
 * 加载时 base64 → bytes → importKey 还原。
 */
function getMasterKey(): Promise<CryptoKey> {
  if (masterKeyPromise) return masterKeyPromise;
  masterKeyPromise = (async () => {
    const subtle = getSubtle();
    // 尝试从 IndexedDB 加载已持久化的主密钥
    const record = await runRequest<KVRecord | undefined>(
      SETTINGS_STORE,
      'readonly',
      (store) => store.get(MASTER_KEY_IDB_KEY),
    );
    if (record?.value) {
      try {
        const rawKey = base64ToBytes(record.value);
        return await subtle.importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, true, [
          'encrypt',
          'decrypt',
        ]);
      } catch {
        // 损坏的主密钥:重新生成,旧密文将无法解密(降级处理)
      }
    }
    // 主密钥不存在:生成新的 256 位 AES-GCM 密钥并持久化
    const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
    const rawKey = new Uint8Array(await subtle.exportKey('raw', key));
    await runRequest<IDBValidKey>(SETTINGS_STORE, 'readwrite', (store) =>
      store.put({ key: MASTER_KEY_IDB_KEY, value: bytesToBase64(rawKey) } as KVRecord),
    );
    return key;
  })();
  return masterKeyPromise;
}

// ===== 加密 / 解密 =====

/**
 * 加密字符串:用主密钥 + 随机 12 字节 IV 做 AES-GCM 加密,
 * 输出 base64(iv || ciphertext)。
 *
 * P0 安全修复:把 storage key 作为 AAD(Additional Authenticated Data)绑定到密文。
 * 这样攻击者无法把 key A 的密文"剪贴"到 key B 的位置 — AES-GCM 解密时 AAD 不匹配
 * 会认证失败,密文被拒绝。AAD 不增加存储成本,只是把 key 名称参与认证标签计算。
 */
async function encryptValue(plaintext: string, aad: string): Promise<string> {
  const subtle = getSubtle();
  const key = await getMasterKey();
  const iv = (globalThis as { crypto?: Crypto }).crypto!.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const aadBytes = new TextEncoder().encode(aad);
  const cipherBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadBytes },
    key,
    encoded,
  );
  // 密文与 IV 拼接后转 base64 存储
  return bytesToBase64(concatBytes([iv, new Uint8Array(cipherBuf)]));
}

/**
 * 解密 base64(iv || ciphertext):拆出前 12 字节 IV,余下为密文,
 * 用主密钥做 AES-GCM 解密还原字符串。AAD 必须与加密时一致,否则认证失败。
 */
async function decryptValue(stored: string, aad: string): Promise<string> {
  const subtle = getSubtle();
  const key = await getMasterKey();
  const combined = base64ToBytes(stored);
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const aadBytes = new TextEncoder().encode(aad);
  const plainBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aadBytes },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plainBuf);
}

// ===== 底层 KV 接口 =====

async function getItem(key: string): Promise<string | null> {
  const record = await runRequest<KVRecord | undefined>(SECURE_KV_STORE, 'readonly', (store) =>
    store.get(key),
  );
  if (!record?.value) return null;
  try {
    // 把 key 作为 AAD 传入:若密文是从其他 key 剪贴过来的,AAD 不匹配会认证失败
    return await decryptValue(record.value, key);
  } catch {
    // 解密失败(主密钥更换 / 数据损坏 / AAD 不匹配):视为不存在
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  const encrypted = await encryptValue(value, key);
  await runRequest<IDBValidKey>(SECURE_KV_STORE, 'readwrite', (store) =>
    store.put({ key, value: encrypted } as KVRecord),
  );
}

async function removeItem(key: string): Promise<void> {
  await runRequest<undefined>(SECURE_KV_STORE, 'readwrite', (store) => store.delete(key));
}

// ===== 认证 token 接口(供 api/client.ts 使用)=====

export interface StoredAuth {
  user: unknown;
  token: string;
}

export async function getStoredAuth(): Promise<StoredAuth | null> {
  const token = await getItem(TOKEN_KEY);
  if (!token) return null;

  const userData = await getItem(USER_KEY);
  if (!userData) return null;

  try {
    return { user: JSON.parse(userData), token };
  } catch {
    return null;
  }
}

export async function setStoredAuth(user: unknown, token: string): Promise<void> {
  await Promise.all([
    setItem(USER_KEY, JSON.stringify(user)),
    setItem(TOKEN_KEY, token),
  ]);
}

export async function clearStoredAuth(): Promise<void> {
  await Promise.all([removeItem(USER_KEY), removeItem(TOKEN_KEY)]);
}

// ===== 通用安全 KV 接口(供同步子系统使用)=====
// 调用方传入的逻辑 key 不含前缀;本层统一拼上 KEY_PREFIX 后再落盘,
// 确保所有 Goto 安全项可被一眼识别。

function namespacedKey(key: string): string {
  if (key.startsWith(KEY_PREFIX)) return key;
  return `${KEY_PREFIX}${key}`;
}

/**
 * 读取一个安全存储项。返回字符串原值(通常为 base64 或 JSON),不存在时返回 null。
 */
export async function secureGet(key: string): Promise<string | null> {
  return getItem(namespacedKey(key));
}

/**
 * 写入一个安全存储项。value 应为字符串(base64 / JSON),二进制材料请先转 base64。
 */
export async function secureSet(key: string, value: string): Promise<void> {
  await setItem(namespacedKey(key), value);
}

/**
 * 删除一个安全存储项。键不存在时静默返回(幂等)。
 */
export async function secureDelete(key: string): Promise<void> {
  await removeItem(namespacedKey(key));
}
