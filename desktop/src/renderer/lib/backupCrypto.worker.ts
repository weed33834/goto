/**
 * 备份加解密 Web Worker(模块 Worker)。
 *
 * 替代原内联 Blob Worker:hash-wasm 是 ESM 模块,无法在 classic Blob Worker 中
 * 通过静态 import 加载,因此改为独立模块 Worker 文件,由 Vite 按
 * `new Worker(new URL('./backupCrypto.worker.ts', import.meta.url), { type: 'module' })`
 * 模式打包(GOTO_PIVOT_PLAN §4.5 / A17 argon2id 升级)。
 *
 * Worker 内完成 KDF 派生 + AES-256-GCM 加解密,避免主线程阻塞。
 * 支持双算法:
 *   - algorithm = 0x01: PBKDF2-SHA256(旧版备份兼容)
 *   - algorithm = 0x02: argon2id(新版默认,m=64MB t=3 p=4)
 *
 * Worker 内不使用 Session 缓存:每次独立派生,避免跨调用状态残留,
 * 也避免主线程与 Worker 之间共享缓存带来的同步复杂度。
 */

import { argon2id } from 'hash-wasm';

// argon2id 参数(与 webAPI.ts 保持一致,GOTO_PIVOT_PLAN §4.5)
const ARGON2ID_MEMORY_KB = 64 * 1024; // 64 MiB,hash-wasm 以 KiB 为单位
const ARGON2ID_TIME_COST = 3;
const ARGON2ID_PARALLELISM = 4;
const ARGON2ID_HASH_LENGTH = 32;

const BACKUP_ALGO_ARGON2ID = 0x02;

interface BackupWorkerRequest {
  op: 'encrypt' | 'decrypt';
  password: string;
  salt: Uint8Array;
  iv: Uint8Array;
  algorithm: number;
  iterations: number;
  payload: string | Uint8Array;
}

interface BackupWorkerResponse {
  ok: boolean;
  result?: ArrayBuffer;
  error?: string;
}

// self 在 Worker 上下文是 DedicatedWorkerGlobalScope,但 tsconfig 仅启用 DOM lib,
// 因此用最小类型断言隔离,避免引入 WebWorker lib 依赖。
const workerCtx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (msg: BackupWorkerResponse, transfer?: Transferable[]) => void;
};

/**
 * Uint8Array → 独立 ArrayBuffer 副本。
 * crypto.subtle.* 在 TS 5.9 下要求 BufferSource = ArrayBufferView<ArrayBuffer> | ArrayBuffer,
 * hash-wasm / postMessage 传入的 Uint8Array 类型为 ArrayBufferLike(可能含 SharedArrayBuffer),
 * 这里切片 + 断言为 ArrayBuffer 以满足类型(运行时均为 ArrayBuffer,断言安全)。
 */
function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

workerCtx.onmessage = async (e: MessageEvent) => {
  const { op, password, salt, iv, algorithm, iterations, payload } = e.data as BackupWorkerRequest;
  const enc = new TextEncoder();
  try {
    let bits: ArrayBuffer;
    if (algorithm === BACKUP_ALGO_ARGON2ID) {
      // hash-wasm 接受 Uint8Array 作为 salt,内部按原始字节处理。
      const result = await argon2id({
        password,
        salt,
        parallelism: ARGON2ID_PARALLELISM,
        iterations: ARGON2ID_TIME_COST,
        memorySize: ARGON2ID_MEMORY_KB,
        hashLength: ARGON2ID_HASH_LENGTH,
        outputType: 'binary',
      });
      bits = toArrayBuffer(result);
    } else {
      // PBKDF2(旧版备份兼容)
      const km = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveBits'],
      );
      bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
        km,
        256,
      );
    }
    const key = await crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ]);
    const ivBuf = toArrayBuffer(iv);

    if (op === 'encrypt') {
      // payload 为 string 时 UTF-8 编码;为 Uint8Array 时复制为独立 ArrayBuffer。
      const ptBuf =
        typeof payload === 'string'
          ? enc.encode(payload).buffer as ArrayBuffer
          : toArrayBuffer(payload);
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuf }, key, ptBuf);
      workerCtx.postMessage({ ok: true, result: ct }, [ct]);
    } else {
      const ctBuf = toArrayBuffer(payload as Uint8Array);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, key, ctBuf);
      workerCtx.postMessage({ ok: true, result: pt }, [pt]);
    }
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : err != null ? String(err) : 'unknown error';
    workerCtx.postMessage({
      ok: false,
      error: errorMsg,
    });
  }
};
