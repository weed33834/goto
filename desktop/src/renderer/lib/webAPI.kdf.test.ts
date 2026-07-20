/**
 * A17 argon2id 升级测试 (GOTO_PIVOT_PLAN §4.5 / §0.3.1 #8)
 *
 * 覆盖:
 *   - argon2id 派生(32 字节 / 确定性 / salt 隔离)
 *   - PBKDF2 legacy 派生路径(双算法兼容)+ Node crypto 互操作
 *   - auth verifier(argon2id 新格式 + 旧 PBKDF2 verifier 兼容)
 *   - 备份加解密(argon2id round-trip + 错误密码 + 头格式)
 *   - 双算法兼容(旧 PBKDF2 备份可被新代码解密)
 *   - isEncryptedBackup 双算法识别
 *   - Session 派生缓存(同引用 = 命中 / clearDerivedKeyCache = 失效)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  deriveKeyBits,
  createVerifier,
  verifyPassword,
  encryptBackup,
  decryptBackup,
  isEncryptedBackup,
  encryptBackupLegacyPbkdf2,
  clearDerivedKeyCache,
} from './webAPI';

// ===== 辅助 =====

function arrayBufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ===== 共享 fixture(beforeAll 一次性派生,后续测试命中 Session 缓存) =====
// 集中创建昂贵的 argon2id 派生结果,避免每个 it 重复 ~800ms 派生。

const PASSWORD = 'A17-test-p@ssword';
const WRONG_PASSWORD = 'wrong-p@ssword';
const PLAINTEXT = JSON.stringify({
  tasks: [{ id: 't1', title: '测试任务', done: false }],
  vault: [{ id: 'v1', name: '账号', username: 'alice' }],
});

let argon2idVerifier: string;
let argon2idBackup: Uint8Array;
let legacyPbkdf2Backup: Uint8Array;
let legacyVerifier: string;

beforeAll(async () => {
  clearDerivedKeyCache();
  argon2idVerifier = await createVerifier(PASSWORD);
  argon2idBackup = await encryptBackup(PASSWORD, PLAINTEXT);
  legacyPbkdf2Backup = await encryptBackupLegacyPbkdf2(PASSWORD, PLAINTEXT);

  // 构造一个旧格式 PBKDF2 verifier(saltHex:keyHex,无 algo 前缀)
  const salt = new Uint8Array(16);
  for (let i = 0; i < 16; i++) salt[i] = 0x5a + i;
  const bits = await deriveKeyBits('legacy-pw', salt, 'pbkdf2', 100_000);
  legacyVerifier = `${arrayBufferToHex(salt.buffer)}:${arrayBufferToHex(bits)}`;
});

// ===== argon2id 派生 =====

describe('A17 argon2id — deriveKeyBits', () => {
  it('argon2id 输出 32 字节', async () => {
    const salt = new Uint8Array(16).fill(0xab);
    const bits = await deriveKeyBits('derive-test', salt, 'argon2id');
    expect(bits.byteLength).toBe(32);
  });

  it('argon2id 同 (password, salt) 确定性输出', async () => {
    const salt = new Uint8Array(16).fill(0x01);
    const a = await deriveKeyBits('deterministic-pw', salt, 'argon2id');
    const b = await deriveKeyBits('deterministic-pw', salt, 'argon2id');
    expect(arrayBufferToHex(b)).toBe(arrayBufferToHex(a));
  });

  it('argon2id 不同 salt 派生不同密钥', async () => {
    const salt1 = new Uint8Array(16).fill(0x01);
    const salt2 = new Uint8Array(16).fill(0x02);
    const a = await deriveKeyBits('salt-isolation-pw', salt1, 'argon2id');
    const b = await deriveKeyBits('salt-isolation-pw', salt2, 'argon2id');
    expect(arrayBufferToHex(a)).not.toBe(arrayBufferToHex(b));
  });

  it('PBKDF2(legacy)输出 32 字节', async () => {
    const salt = new Uint8Array(16).fill(0xcd);
    const bits = await deriveKeyBits('pbkdf2-test', salt, 'pbkdf2', 1000);
    expect(bits.byteLength).toBe(32);
  });

  it('PBKDF2 与 Node crypto.pbkdf2Sync 互操作', async () => {
    const salt = new Uint8Array(16).fill(0x33);
    const bits = await deriveKeyBits('interop-pw', salt, 'pbkdf2', 1000);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto');
    const expected = nodeCrypto.pbkdf2Sync(
      'interop-pw',
      Buffer.from(salt),
      1000,
      32,
      'sha256',
    );
    expect(Buffer.from(bits).equals(expected)).toBe(true);
  });
});

// ===== auth verifier =====

describe('A17 argon2id — auth verifier', () => {
  it('createVerifier 生成 `2:saltHex:keyHex` 格式', () => {
    expect(argon2idVerifier.startsWith('2:')).toBe(true);
    const parts = argon2idVerifier.split(':');
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe('2');
    expect(parts[1].length).toBe(32); // 16 字节 salt = 32 hex
    expect(parts[2].length).toBe(64); // 32 字节 key = 64 hex
  });

  it('verifyPassword 正确密码通过(argon2id)', async () => {
    expect(await verifyPassword(PASSWORD, argon2idVerifier)).toBe(true);
  });

  it('verifyPassword 错误密码拒绝(argon2id)', async () => {
    expect(await verifyPassword(WRONG_PASSWORD, argon2idVerifier)).toBe(false);
  });

  it('verifyPassword 兼容旧 PBKDF2 verifier(无 algo 前缀,2 段格式)', async () => {
    // 旧格式应为 `saltHex:keyHex`(2 段,无 algo 前缀)
    expect(legacyVerifier.split(':').length).toBe(2);
    expect(await verifyPassword('legacy-pw', legacyVerifier)).toBe(true);
    expect(await verifyPassword('wrong-legacy', legacyVerifier)).toBe(false);
  });

  it('verifyPassword 拒绝畸形 verifier', async () => {
    expect(await verifyPassword(PASSWORD, 'malformed')).toBe(false);
    expect(await verifyPassword(PASSWORD, '')).toBe(false);
    expect(await verifyPassword(PASSWORD, 'a:b:c:d')).toBe(false);
  });
});

// ===== 备份加解密(argon2id) =====

describe('A17 argon2id — 备份加解密', () => {
  it('argon2id 备份 round-trip 还原明文', async () => {
    const decrypted = await decryptBackup(PASSWORD, argon2idBackup);
    expect(decrypted).toBe(PLAINTEXT);
  });

  it('argon2id 备份错误密码抛出', async () => {
    await expect(decryptBackup(WRONG_PASSWORD, argon2idBackup)).rejects.toThrow();
  });

  it('argon2id 备份头 algo=0x02(第 5 字节)', () => {
    expect(argon2idBackup[0]).toBe(0x47); // 'G'
    expect(argon2idBackup[1]).toBe(0x54); // 'T'
    expect(argon2idBackup[2]).toBe(0x46); // 'F'
    expect(argon2idBackup[3]).toBe(0x42); // 'B'
    expect(argon2idBackup[4]).toBe(0x02); // argon2id
  });

  it('argon2id 头长度 = 33(magic4 + algo1 + salt16 + iv12)', () => {
    const ctLen = argon2idBackup.length - 33;
    const plainLen = new TextEncoder().encode(PLAINTEXT).length;
    // ct = 明文 + 16 字节 GCM auth tag
    expect(ctLen).toBe(plainLen + 16);
  });
});

// ===== 双算法兼容(旧 PBKDF2 备份可被新代码解密) =====

describe('A17 argon2id — 双算法兼容', () => {
  it('旧 PBKDF2 备份(algo=0x01)能被新代码解密', async () => {
    expect(legacyPbkdf2Backup[4]).toBe(0x01);
    const decrypted = await decryptBackup(PASSWORD, legacyPbkdf2Backup);
    expect(decrypted).toBe(PLAINTEXT);
  });

  it('旧 PBKDF2 备份错误密码抛出', async () => {
    await expect(decryptBackup(WRONG_PASSWORD, legacyPbkdf2Backup)).rejects.toThrow();
  });

  it('旧 PBKDF2 头含 iterations(4B BE = 600000),新 argon2id 头无 iterations', () => {
    // 旧备份头长度 = 37,新备份头长度 = 33
    expect(legacyPbkdf2Backup.length - argon2idBackup.length).toBe(4);
    // 旧备份 iterations 字节(offset 5+16=21,4B BE)
    const iterations = new DataView(
      legacyPbkdf2Backup.buffer,
      legacyPbkdf2Backup.byteOffset,
      legacyPbkdf2Backup.byteLength,
    ).getUint32(21, false);
    expect(iterations).toBe(600_000);
  });

  it('新 argon2id 与旧 PBKDF2 头第 5 字节区分算法', () => {
    expect(argon2idBackup[4]).toBe(0x02);
    expect(legacyPbkdf2Backup[4]).toBe(0x01);
  });
});

// ===== isEncryptedBackup =====

describe('A17 argon2id — isEncryptedBackup', () => {
  it('识别 argon2id 备份', () => {
    expect(isEncryptedBackup(argon2idBackup)).toBe(true);
  });

  it('识别旧 PBKDF2 备份', () => {
    expect(isEncryptedBackup(legacyPbkdf2Backup)).toBe(true);
  });

  it('拒绝随机字节', () => {
    const random = new Uint8Array(100);
    crypto.getRandomValues(random);
    expect(isEncryptedBackup(random)).toBe(false);
  });

  it('拒绝 magic 正确但 algo 未知的字节', () => {
    const fake = new Uint8Array(40);
    fake[0] = 0x47;
    fake[1] = 0x54;
    fake[2] = 0x46;
    fake[3] = 0x42;
    fake[4] = 0x99; // 未知算法
    expect(isEncryptedBackup(fake)).toBe(false);
  });

  it('拒绝过短输入(< 5 字节)', () => {
    expect(isEncryptedBackup(new Uint8Array(4))).toBe(false);
    expect(isEncryptedBackup(new Uint8Array(0))).toBe(false);
  });
});

// ===== Session 派生缓存 =====

describe('A17 argon2id — Session 派生缓存', () => {
  it('同 (password, salt, algo) 二次调用命中缓存(返回同引用)', async () => {
    clearDerivedKeyCache();
    const salt = new Uint8Array(16).fill(0xee);
    const first = await deriveKeyBits('cache-hit-test', salt, 'argon2id');
    const second = await deriveKeyBits('cache-hit-test', salt, 'argon2id');
    // 命中缓存:返回同一 ArrayBuffer 引用
    expect(second).toBe(first);
  });

  it('clearDerivedKeyCache 后重新派生(新引用,内容相同)', async () => {
    clearDerivedKeyCache();
    const salt = new Uint8Array(16).fill(0xff);
    const first = await deriveKeyBits('clear-cache-test', salt, 'argon2id');
    clearDerivedKeyCache();
    const second = await deriveKeyBits('clear-cache-test', salt, 'argon2id');
    expect(arrayBufferToHex(second)).toBe(arrayBufferToHex(first));
    expect(second).not.toBe(first);
  });

  it('不同 salt 不命中缓存(新引用 + 不同内容)', async () => {
    clearDerivedKeyCache();
    const salt1 = new Uint8Array(16).fill(0x11);
    const salt2 = new Uint8Array(16).fill(0x22);
    const a = await deriveKeyBits('diff-salt-test', salt1, 'argon2id');
    const b = await deriveKeyBits('diff-salt-test', salt2, 'argon2id');
    expect(a).not.toBe(b);
    expect(arrayBufferToHex(a)).not.toBe(arrayBufferToHex(b));
  });

  it('不同算法同 password+salt 不命中(argon2id vs pbkdf2)', async () => {
    clearDerivedKeyCache();
    const salt = new Uint8Array(16).fill(0x44);
    const argon = await deriveKeyBits('cross-algo-test', salt, 'argon2id');
    const pbkdf = await deriveKeyBits('cross-algo-test', salt, 'pbkdf2', 1000);
    expect(argon).not.toBe(pbkdf);
    expect(arrayBufferToHex(argon)).not.toBe(arrayBufferToHex(pbkdf));
  });
});
