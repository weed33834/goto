/**
 * IndexedDB 持久化层
 *
 * 作为统一 Web 应用中 SQLite + AsyncStorage 的替代品。
 * 设计原则:
 * 1. 每个 object store 对应一个实体表(tasks / vault / projects / ...)
 * 2. 所有数据以 JSON 对象存储,key 为实体的 id 字段
 * 3. 提供 CRUD + bulk 操作的泛型接口
 * 4. 自动处理时间戳(created_at / updated_at)
 */

const DB_NAME = 'taskflow';
const DB_VERSION = 1;

// 所有 object store 名称
export type StoreName =
  | 'tasks'
  | 'vault'
  | 'projects'
  | 'categories'
  | 'tags'
  | 'views'
  | 'goals'
  | 'habits'
  | 'notes'
  | 'templates'
  | 'automation_rules'
  | 'security_settings'
  | 'app_settings';

let dbInstance: IDBDatabase | null = null;

/**
 * 打开(或创建)IndexedDB 数据库。
 * 首次打开时创建所有 object store。
 */
export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      const stores: { name: StoreName; keyPath: string }[] = [
        { name: 'tasks', keyPath: 'id' },
        { name: 'vault', keyPath: 'id' },
        { name: 'projects', keyPath: 'id' },
        { name: 'categories', keyPath: 'id' },
        { name: 'tags', keyPath: 'id' },
        { name: 'views', keyPath: 'id' },
        { name: 'goals', keyPath: 'id' },
        { name: 'habits', keyPath: 'id' },
        { name: 'notes', keyPath: 'id' },
        { name: 'templates', keyPath: 'id' },
        { name: 'automation_rules', keyPath: 'id' },
        { name: 'security_settings', keyPath: 'key' },
        { name: 'app_settings', keyPath: 'key' },
      ];

      for (const { name, keyPath } of stores) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath });
        }
      }
    };
  });
}

/**
 * 获取 object store 的事务包装。
 * 自动处理事务完成/失败,返回 Promise。
 */
async function withStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = fn(store);

    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 在单个事务中操作多个 store。
 */
async function withStores(
  storeNames: StoreName[],
  mode: IDBTransactionMode,
  fn: (stores: Record<StoreName, IDBObjectStore>) => void,
): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = {} as Record<StoreName, IDBObjectStore>;
    for (const name of storeNames) {
      stores[name] = tx.objectStore(name);
    }
    fn(stores);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ===== 泛型 CRUD 操作 =====

/**
 * 获取某个 store 中的所有记录。
 */
export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  return withStore<T[]>(storeName, 'readonly', (store) => store.getAll());
}

/**
 * 按 id 获取单条记录。
 */
export async function getById<T>(storeName: StoreName, id: string): Promise<T | undefined> {
  return withStore<T | undefined>(storeName, 'readonly', (store) => store.get(id));
}

/**
 * 新增一条记录(不覆盖已存在的 key)。
 */
export async function add<T>(storeName: StoreName, value: T): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => store.add(value));
}

/**
 * 新增或覆盖一条记录(upsert)。
 */
export async function put<T>(storeName: StoreName, value: T): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => store.put(value));
}

/**
 * 批量 upsert。
 */
export async function bulkPut<T>(storeName: StoreName, values: T[]): Promise<void> {
  await withStores([storeName], 'readwrite', (stores) => {
    const store = stores[storeName];
    for (const v of values) {
      store.put(v);
    }
  });
}

/**
 * 按 id 删除一条记录。
 */
export async function remove(storeName: StoreName, id: string): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => store.delete(id));
}

/**
 * 清空整个 store。
 */
export async function clearStore(storeName: StoreName): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => store.clear());
}

// ===== KV 存储(用于 security_settings / app_settings) =====

export async function getKV<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  const result = await withStore<{ key: string; value: T } | undefined>(
    storeName,
    'readonly',
    (store) => store.get(key),
  );
  return result?.value;
}

export async function setKV<T>(storeName: StoreName, key: string, value: T): Promise<void> {
  await put(storeName, { key, value });
}

// ===== 密码生成(Web Crypto) =====

/**
 * 使用 Web Crypto API 生成随机密码。
 * 字符集:大小写字母 + 数字 + 符号。
 */
export function generatePassword(length: number): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  const buffer = new Uint8Array(length);
  crypto.getRandomValues(buffer);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[buffer[i] % charset.length];
  }
  return result;
}

/**
 * 生成唯一 ID。
 */
export function generateId(prefix: string = ''): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}-${ts}${rand}` : `${ts}${rand}`;
}
