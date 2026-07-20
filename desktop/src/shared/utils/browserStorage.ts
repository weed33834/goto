// 浏览器端 AsyncStorage 适配器。
// 用 IndexedDB 实现 React Native AsyncStorage 的字符串 KV 接口,
// 供原移动端 persistenceSlice / syncStorage 等模块在 Web 端复用。
//
// 数据库: 'taskflow-async-storage',单个 object store 'kv',keyPath 为 'key'。
// 每条记录结构: { key: string, value: string }

const DB_NAME = 'taskflow-async-storage';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

// 缓存已初始化的 DB 连接,确保 openDB 只执行一次。
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    // 非浏览器环境或 IndexedDB 不可用时拒绝,调用方应自行降级。
    const indexedDB =
      (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!indexedDB) {
      reject(new Error('IndexedDB 不可用:当前环境不支持浏览器存储'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // 仅在首次创建或版本升级时建表
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('打开 IndexedDB 失败'));
  });
  return dbPromise;
}

/** 在指定事务的 kv store 上执行单个请求的辅助函数。 */
function runRequest<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

interface KVRecord {
  key: string;
  value: string;
}

/** 与 React Native AsyncStorage 接口一致的浏览器存储实现。 */
export const browserStorage = {
  /** 读取一个键的字符串值,不存在时返回 null。 */
  getItem(key: string): Promise<string | null> {
    return runRequest<KVRecord | undefined>('readonly', (store) =>
      store.get(key),
    ).then((record) => (record ? record.value : null));
  },

  /** 写入一个键值对(字符串)。 */
  setItem(key: string, value: string): Promise<void> {
    return runRequest<IDBValidKey>('readwrite', (store) =>
      store.put({ key, value } as KVRecord),
    ).then(() => undefined);
  },

  /** 删除一个键,键不存在时静默返回(幂等)。 */
  removeItem(key: string): Promise<void> {
    return runRequest<undefined>('readwrite', (store) =>
      store.delete(key),
    ).then(() => undefined);
  },

  /** 返回所有键名数组。 */
  getAllKeys(): Promise<string[]> {
    return runRequest<IDBValidKey[]>('readonly', (store) =>
      store.getAllKeys(),
    ).then((keys) => keys.map((k) => String(k)));
  },

  /** 清空所有键值对。 */
  clear(): Promise<void> {
    return runRequest<undefined>('readwrite', (store) =>
      store.clear(),
    ).then(() => undefined);
  },

  /** 批量读取多个键,返回 [key, value|null] 元组数组(顺序与入参一致)。 */
  multiGet(keys: string[]): Promise<[string, string | null][]> {
    return Promise.all(keys.map((key) => this.getItem(key).then((v) => [key, v] as [string, string | null])));
  },

  /** 批量写入多个键值对。 */
  multiSet(entries: [string, string][]): Promise<void> {
    return openDB().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          for (const [key, value] of entries) {
            store.put({ key, value } as KVRecord);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        }),
    );
  },
};

// 具名导出(大驼峰别名)
export const BrowserStorage = browserStorage;

// 默认导出,符合 AsyncStorage 默认导入用法
export default browserStorage;
