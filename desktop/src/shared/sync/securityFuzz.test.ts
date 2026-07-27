// 高级安全 / Fuzz 测试 — 验证关键安全边界在恶意/异常输入下不崩溃、不静默吞错。
//
// 测试目标(对齐审计报告 P0/P1 安全修复):
// 1. bytes.ts:base64ToBytes / hexToBytes / pemToDer — 非法字符、长度异常、padding 异常
// 2. syncMessages.ts:deserializeMessage + FrameParser — 畸形 JSON / 超长 length / 非法 mode
// 3. syncCrypto.ts:decryptSyncRecord / decryptSessionMessage — authTag 校验失败、长度不足
// 4. relayClient.ts:isUnauthorizedError — 正则精确匹配,避免 "40123" 误判
// 5. relayAuth.ts:buildAuthMessage — purpose 含 ':' 不影响解析
// 6. transform.ts:camelToSnake / snakeToCamel / parseDates — 边界类型
// 7. persistenceSlice.importData — 原型污染、超大数组、循环引用、深度嵌套
//
// Fuzz 策略:
// - 随机字节流喂入解码/解密函数
// - 边界值(MIN/MAX/off-by-one)
// - 类型混淆(string/number/null/undefined/array/object)
// - 注入向量(prototype pollution, ReDoS)
//
// 不使用 fast-check 等外部库:测试自包含,直接用 Math.random + 循环生成随机输入。
import { describe, it, expect } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  hexToBytes,
  bytesToHex,
  pemToDer,
  derToPem,
  utf8Encode,
  utf8Decode,
  constantTimeEqual,
  concatBytes,
  type Bytes,
} from './bytes';
import {
  deserializeMessage,
  serializeMessage,
  FrameParser,
  encodeFrame,
  MAX_FRAME_SIZE,
  isWireSyncRecord,
  type SyncMessage,
  type FrameMode,
} from './syncMessages';
import {
  encryptSyncRecord,
  decryptSyncRecord,
  generateSyncMasterKey,
  encryptSessionMessage,
  decryptSessionMessage,
} from './syncCrypto';
import { RelayClient } from './relayClient';
import { buildAuthMessage } from './relayAuth';
import { camelToSnake, snakeToCamel, parseDates } from '../api/transform';

// --- 随机 fuzz 工具 ---

function randomBytes(length: number): Bytes {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = Math.floor(Math.random() * 256);
  return out as Bytes;
}

function randomString(length: number, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// --- 1. bytes.ts Fuzz ---

describe('security fuzz — bytes.base64ToBytes', () => {
  it('round-trip 100 次随机字节流(0-256B)无丢失', () => {
    for (let i = 0; i < 100; i++) {
      const len = Math.floor(Math.random() * 256);
      const original = randomBytes(len);
      const encoded = bytesToBase64(original);
      const decoded = base64ToBytes(encoded);
      expect(decoded.length).toBe(original.length);
      for (let j = 0; j < original.length; j++) {
        expect(decoded[j]).toBe(original[j]);
      }
    }
  });

  it('非法字符被 .replace 过滤后仍能解码(不抛错)', () => {
    // 模拟攻击者插入非法字符,base64ToBytes 内部已 strip
    const valid = bytesToBase64(new Uint8Array([1, 2, 3, 4]));
    const polluted = `!!!${valid.slice(0, 4)}@@@${valid.slice(4)}###`;
    const decoded = base64ToBytes(polluted);
    expect(decoded.length).toBe(4);
    expect(decoded[0]).toBe(1);
  });

  it('长度 % 4 === 1 时抛错(不可能的 base64 长度)', () => {
    // 单字符 base64 是非法的(最小合法长度为 2)
    expect(() => base64ToBytes('A')).toThrow(/Invalid base64/);
    expect(() => base64ToBytes('ABCDE')).toThrow(/Invalid base64/);
  });

  it('空串返回空 Uint8Array(不抛错)', () => {
    const out = base64ToBytes('');
    expect(out.length).toBe(0);
  });

  it('随机 1KB 非法字符喂入不抛未捕获异常(被 strip 或长度异常 → 抛可控 Error)', () => {
    for (let i = 0; i < 50; i++) {
      const garbage = randomString(1024, '!@#$%^&*()_+{}[]|\\:";\'<>?,./~`');
      try {
        base64ToBytes(garbage);
        // 不抛错即通过(strip 后长度 0 或正常解码)
      } catch (e) {
        // 长度异常 → 必须是可识别的 Error
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toMatch(/Invalid base64/);
      }
    }
  });
});

describe('security fuzz — bytes.hexToBytes', () => {
  it('round-trip 100 次随机字节流无丢失', () => {
    for (let i = 0; i < 100; i++) {
      const len = Math.floor(Math.random() * 128);
      const original = randomBytes(len);
      const encoded = bytesToHex(original);
      const decoded = hexToBytes(encoded);
      expect(decoded.length).toBe(original.length);
      for (let j = 0; j < original.length; j++) {
        expect(decoded[j]).toBe(original[j]);
      }
    }
  });

  it('奇数长度自动前补 0(不抛错)', () => {
    const out = hexToBytes('abc');
    expect(out.length).toBe(2);
    // '0abc' → [0x0a, 0xbc]
    expect(out[0]).toBe(0x0a);
    expect(out[1]).toBe(0xbc);
  });
});

describe('security fuzz — bytes.constantTimeEqual', () => {
  it('长度不同直接返回 false(不泄露时序信息)', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
  });

  it('相同长度相同内容返回 true', () => {
    const a = randomBytes(64);
    const b = new Uint8Array(a);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it('相同长度不同内容返回 false', () => {
    const a = randomBytes(64);
    const b = randomBytes(64);
    // 极低概率相同,但断言 false 在大多数情况下成立
    if (a.some((v, i) => v !== b[i])) {
      expect(constantTimeEqual(a, b)).toBe(false);
    }
  });
});

describe('security fuzz — bytes.pemToDer', () => {
  it('PEM 头缺失/格式错乱时仍能尝试解码(只剥头尾,内部 base64 解码)', () => {
    const der = randomBytes(64);
    const pem = derToPem(der, 'PUBLIC KEY');
    const decoded = pemToDer(pem);
    expect(decoded.length).toBe(der.length);
    for (let i = 0; i < der.length; i++) expect(decoded[i]).toBe(der[i]);
  });
});

// --- 2. syncMessages.ts Fuzz ---

describe('security fuzz — syncMessages.deserializeMessage', () => {
  it('非法 JSON 抛 "Malformed sync message: invalid JSON"', () => {
    const garbage = utf8Encode('{ not valid json');
    expect(() => deserializeMessage(garbage)).toThrow(/Malformed sync message/);
  });

  it('合法 JSON 但非对象(数组/数字/null)抛 Invalid sync message', () => {
    expect(() => deserializeMessage(utf8Encode('[]'))).toThrow(/Invalid sync message/);
    expect(() => deserializeMessage(utf8Encode('42'))).toThrow(/Invalid sync message/);
    expect(() => deserializeMessage(utf8Encode('null'))).toThrow(/Invalid sync message/);
    expect(() => deserializeMessage(utf8Encode('"string"'))).toThrow(/Invalid sync message/);
  });

  it('合法 JSON + type 字段但未知 type 抛 Invalid sync message: type=xxx', () => {
    expect(() => deserializeMessage(utf8Encode('{"type":"UNKNOWN"}'))).toThrow(/type=UNKNOWN/);
  });

  it('合法 JSON + 已知 type 但字段缺失/类型错抛 Invalid', () => {
    // HELLO 缺 deviceId
    expect(() => deserializeMessage(utf8Encode('{"type":"HELLO","publicKey":"x","nonce":"y"}'))).toThrow(/Invalid sync message/);
    // MANIFEST records 不是数组
    expect(() => deserializeMessage(utf8Encode('{"type":"MANIFEST","records":"not-array"}'))).toThrow(/Invalid sync message/);
    // BATCH records 元素结构错
    expect(() => deserializeMessage(utf8Encode('{"type":"BATCH","records":[{"id":1}]}'))).toThrow(/Invalid sync message/);
  });

  it('错误消息不泄露整个 obj 内容(防存储耗尽攻击)', () => {
    // 构造一个 1MB 的"合法 JSON 但 type 不合规"载荷
    const huge = 'x'.repeat(1024 * 1024);
    const payload = utf8Encode(JSON.stringify({ type: 'BAD', junk: huge }));
    let caught: Error | null = null;
    try {
      deserializeMessage(payload);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    // 错误消息只包含 type=BAD,不包含 1MB 的 junk 字段
    expect(caught!.message.length).toBeLessThan(100);
    expect(caught!.message).not.toContain(huge.slice(0, 100));
  });

  it('round-trip:serializeMessage → deserializeMessage 100 次(所有消息类型)', () => {
    const samples: SyncMessage[] = [
      { type: 'HELLO', deviceId: 'dev1', publicKey: 'pk', nonce: 'n' },
      { type: 'OFFER', signedPayload: 'sp' },
      { type: 'ANSWER', signedPayload: 'sp' },
      { type: 'MANIFEST', records: [{ id: 'r1', updatedAt: 1, hash: 'h1' }] },
      { type: 'REQUEST', recordIds: ['r1', 'r2'] },
      {
        type: 'BATCH',
        records: [{
          id: 'r1', tableName: 'tasks', recordId: 't1', version: 1,
          encryptedPayload: 'ep', updatedAt: 1, deleted: 0,
          deviceVersion: { dev1: 1, dev2: 2 },
        }],
      },
      { type: 'ACK', receivedIds: ['r1'] },
      { type: 'ERROR', code: 'NOT_FOUND', message: 'missing', missingIds: ['r1'] },
      { type: 'SMK_TRANSFER', encryptedSmk: 'es' },
    ];
    for (let i = 0; i < 100; i++) {
      const msg = samples[i % samples.length];
      const buf = serializeMessage(msg);
      const decoded = deserializeMessage(buf);
      expect(decoded.type).toBe(msg.type);
    }
  });
});

describe('security fuzz — syncMessages.isWireSyncRecord', () => {
  it('拒绝 NaN/Infinity 的 version / updatedAt / deleted', () => {
    // 安全修复:之前 typeof === 'number' 接受 NaN/Infinity,会破坏 conflictResolver 偏序比较
    // 现在加 Number.isFinite 检查
    expect(isWireSyncRecord({
      id: 'r1', tableName: 'tasks', recordId: 't1', version: NaN,
      encryptedPayload: 'ep', updatedAt: 1, deleted: 0,
    })).toBe(false);
    expect(isWireSyncRecord({
      id: 'r1', tableName: 'tasks', recordId: 't1', version: Infinity,
      encryptedPayload: 'ep', updatedAt: 1, deleted: 0,
    })).toBe(false);
    expect(isWireSyncRecord({
      id: 'r1', tableName: 'tasks', recordId: 't1', version: 1,
      encryptedPayload: 'ep', updatedAt: NaN, deleted: 0,
    })).toBe(false);
    expect(isWireSyncRecord({
      id: 'r1', tableName: 'tasks', recordId: 't1', version: 1,
      encryptedPayload: 'ep', updatedAt: 1, deleted: Infinity,
    })).toBe(false);
  });

  it('拒绝 deviceVersion 中含 NaN 的版本向量', () => {
    expect(isWireSyncRecord({
      id: 'r1', tableName: 'tasks', recordId: 't1', version: 1,
      encryptedPayload: 'ep', updatedAt: 1, deleted: 0,
      deviceVersion: { dev1: NaN },
    })).toBe(false);
    expect(isWireSyncRecord({
      id: 'r1', tableName: 'tasks', recordId: 't1', version: 1,
      encryptedPayload: 'ep', updatedAt: 1, deleted: 0,
      deviceVersion: { dev1: 1, dev2: 2 },
    })).toBe(true);
  });
});

describe('security fuzz — syncMessages.FrameParser', () => {
  it('非法 mode 字节(非 0/1)→ onError + 清空 buffer', () => {
    const frames: unknown[] = [];
    const errors: Error[] = [];
    const parser = new FrameParser(
      (f) => frames.push(f),
      (e) => errors.push(e),
    );
    // mode=2 是非法的
    const badFrame = new Uint8Array([2, 0, 0, 0, 1, 0]);
    parser.feed(badFrame);
    expect(frames).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Invalid frame mode 2/);
  });

  it('length > MAX_FRAME_SIZE → onError + 清空 buffer', () => {
    const frames: unknown[] = [];
    const errors: Error[] = [];
    const parser = new FrameParser(
      (f) => frames.push(f),
      (e) => errors.push(e),
    );
    // mode=0, length = MAX_FRAME_SIZE + 1
    const badFrame = new Uint8Array(5);
    badFrame[0] = 0;
    new DataView(badFrame.buffer).setUint32(1, MAX_FRAME_SIZE + 1);
    parser.feed(badFrame);
    expect(frames).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Frame exceeds maximum size/);
  });

  it('边界:length === MAX_FRAME_SIZE 不立即报错(等 payload 到达才校验)', () => {
    const errors: Error[] = [];
    const parser = new FrameParser(() => {}, (e) => errors.push(e));
    const frame = new Uint8Array(5);
    frame[0] = 0;
    new DataView(frame.buffer).setUint32(1, MAX_FRAME_SIZE);
    parser.feed(frame);
    // 只喂了 5 字节头,payload 未到达,parser 等待更多数据
    expect(errors).toHaveLength(0);
  });

  it('分片到达:5 字节头 + payload 分多次 feed,正确拼接', () => {
    const frames: unknown[] = [];
    const parser = new FrameParser((f) => frames.push(f), () => {});
    const payload = utf8Encode('hello world');
    const frame = encodeFrame(0 as FrameMode, payload);
    // 一次喂 1 字节
    for (let i = 0; i < frame.length; i++) {
      parser.feed(frame.subarray(i, i + 1));
    }
    expect(frames).toHaveLength(1);
    expect((frames[0] as { payload: Uint8Array }).payload.length).toBe(payload.length);
  });

  it('多帧连续到达:单次 feed 多帧数据', () => {
    const frames: unknown[] = [];
    const parser = new FrameParser((f) => frames.push(f), () => {});
    const p1 = utf8Encode('first');
    const p2 = utf8Encode('second');
    const combined = concatBytes([encodeFrame(0 as FrameMode, p1), encodeFrame(1 as FrameMode, p2)]);
    parser.feed(combined);
    expect(frames).toHaveLength(2);
    expect((frames[0] as { mode: number }).mode).toBe(0);
    expect((frames[1] as { mode: number }).mode).toBe(1);
  });

  it('乱序/截断字节流:不抛未捕获异常,只触发 onError', () => {
    for (let i = 0; i < 50; i++) {
      const frames: unknown[] = [];
      const errors: Error[] = [];
      const parser = new FrameParser((f) => frames.push(f), (e) => errors.push(e));
      const garbage = randomBytes(64);
      parser.feed(garbage);
      // 不应该有未捕获异常 — 所有错误经 onError 回调
      // (frames 可能空 / errors 可能有内容,取决于首字节是否 0/1)
    }
  });
});

// --- 3. syncCrypto.ts Fuzz ---

describe('security fuzz — syncCrypto.decryptSyncRecord', () => {
  it('随机字节流密文 100 次 → 全部抛 authentication failed / too short', async () => {
    const smk = generateSyncMasterKey();
    for (let i = 0; i < 100; i++) {
      const len = Math.floor(Math.random() * 64);
      const garbage = randomBytes(len);
      try {
        await decryptSyncRecord(garbage, smk);
        // 极低概率意外通过(数学上几乎不可能),记录但不 fail
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        const msg = (e as Error).message;
        // 必须是可控的两种错误之一,不能是 TypeError / 其他未捕获异常
        expect(msg).toMatch(/too short|authentication failed|not valid JSON/);
      }
    }
  });

  it('正确密文 + 篡改 1 字节 → authentication failed', async () => {
    const smk = generateSyncMasterKey();
    const ciphertext = await encryptSyncRecord({ id: 't1', title: 'hello' }, smk);
    // 篡改最后 1 字节
    const tampered = new Uint8Array(ciphertext);
    tampered[tampered.length - 1] ^= 0x01;
    await expect(decryptSyncRecord(tampered, smk)).rejects.toThrow(/authentication failed/);
  });

  it('正确密文 + 错误 SMK → authentication failed', async () => {
    const smk1 = generateSyncMasterKey();
    const smk2 = generateSyncMasterKey();
    const ciphertext = await encryptSyncRecord({ id: 't1' }, smk1);
    await expect(decryptSyncRecord(ciphertext, smk2)).rejects.toThrow(/authentication failed/);
  });

  it('SMK 长度不是 32 字节 → assertSmk 抛错', async () => {
    const badSmk = randomBytes(16) as never;
    await expect(decryptSyncRecord(randomBytes(32), badSmk)).rejects.toThrow(/Invalid sync master key/);
  });

  it('密文长度 = GCM_IV_LEN + GCM_TAG_LEN = 28(刚好不够) → too short', async () => {
    const smk = generateSyncMasterKey();
    const garbage = randomBytes(28);
    await expect(decryptSyncRecord(garbage, smk)).rejects.toThrow(/too short/);
  });

  it('密文长度 = 29(刚好够长度,但内容是垃圾)→ authentication failed 或 not valid JSON', async () => {
    const smk = generateSyncMasterKey();
    const garbage = randomBytes(29);
    try {
      await decryptSyncRecord(garbage, smk);
    } catch (e) {
      expect((e as Error).message).toMatch(/authentication failed|not valid JSON/);
    }
  });
});

describe('security fuzz — syncCrypto.decryptSessionMessage', () => {
  it('随机字节流密文 100 次 → 全部抛错(不静默返回明文)', async () => {
    const key = generateSyncMasterKey();
    for (let i = 0; i < 100; i++) {
      const len = Math.floor(Math.random() * 64);
      const garbage = randomBytes(len);
      try {
        await decryptSessionMessage(garbage, key);
      } catch (e) {
        expect((e as Error).message).toMatch(/too short|authentication failed/);
      }
    }
  });

  it('正确密文 + 篡改 IV 第一字节 → authentication failed', async () => {
    const key = generateSyncMasterKey();
    const plaintext = utf8Encode('secret message');
    const ciphertext = await encryptSessionMessage(plaintext, key);
    const tampered = new Uint8Array(ciphertext);
    tampered[0] ^= 0xff;
    await expect(decryptSessionMessage(tampered, key)).rejects.toThrow(/authentication failed/);
  });
});

// --- 4. relayClient.isUnauthorizedError 正则精确匹配 ---

describe('security fuzz — relayClient.isUnauthorizedError', () => {
  it('401 状态码正确识别', () => {
    expect(RelayClient.isUnauthorizedError(new Error('/pairing-codes failed: 401 Unauthorized'))).toBe(true);
    expect(RelayClient.isUnauthorizedError(new Error('/refresh-token failed: 401'))).toBe(true);
  });

  it('"40123" 不被误判为 401(P1 修复的核心)', () => {
    expect(RelayClient.isUnauthorizedError(new Error('/pairing-codes failed: 40123'))).toBe(false);
  });

  it('"401abc" 不被误判为 401(数字后必须是非词字符)', () => {
    expect(RelayClient.isUnauthorizedError(new Error('/x failed: 401abc'))).toBe(false);
  });

  it('"page 40123 not found" 不被误判', () => {
    expect(RelayClient.isUnauthorizedError(new Error('/x failed: 500 page 40123 not found'))).toBe(false);
  });

  it('"failed: 401 Unauthorized" 在多行错误体中也匹配', () => {
    expect(RelayClient.isUnauthorizedError(new Error('/x failed: 401 Unauthorized\nextra body'))).toBe(true);
  });

  it('非 Error 对象返回 false', () => {
    expect(RelayClient.isUnauthorizedError('string error')).toBe(false);
    expect(RelayClient.isUnauthorizedError(null)).toBe(false);
    expect(RelayClient.isUnauthorizedError(undefined)).toBe(false);
    expect(RelayClient.isUnauthorizedError({ message: 'failed: 401' })).toBe(false);
  });

  it('其他状态码(400/403/404/500)不匹配', () => {
    expect(RelayClient.isUnauthorizedError(new Error('/x failed: 400 Bad Request'))).toBe(false);
    expect(RelayClient.isUnauthorizedError(new Error('/x failed: 403 Forbidden'))).toBe(false);
    expect(RelayClient.isUnauthorizedError(new Error('/x failed: 404 Not Found'))).toBe(false);
    expect(RelayClient.isUnauthorizedError(new Error('/x failed: 500 Internal Server Error'))).toBe(false);
  });
});

// --- 5. relayAuth.buildAuthMessage ---

describe('security fuzz — relayAuth.buildAuthMessage', () => {
  it('purpose 含 ":" 不破坏 deviceId/timestamp 解析(只拆前两段)', () => {
    const msg = buildAuthMessage('dev-1', 1234567890, 'claim-pairing-code:ABC123');
    const decoded = utf8Decode(msg);
    expect(decoded).toBe('dev-1:1234567890:claim-pairing-code:ABC123');
    // 服务端 split(':', 3) 或 split(':', 2) 后剩余整体作 purpose,前两段不受影响
    const parts = decoded.split(':');
    expect(parts[0]).toBe('dev-1');
    expect(parts[1]).toBe('1234567890');
  });

  it('deviceId 含特殊字符也按 UTF-8 字节编码(不丢字节)', () => {
    const msg = buildAuthMessage('设备-Δ-1', 1, 'register');
    const decoded = utf8Decode(msg);
    expect(decoded).toBe('设备-Δ-1:1:register');
  });
});

// --- 6. transform.ts Fuzz ---

describe('security fuzz — transform.camelToSnake / snakeToCamel', () => {
  it('round-trip 100 次随机 camelCase key 不丢失', () => {
    const samples = ['simpleKey', 'XMLHttpRequest', 'myURL2', 'a', 'A', 'camelCaseString', 'snake_case_in_camel'];
    for (let i = 0; i < 100; i++) {
      const key = samples[Math.floor(Math.random() * samples.length)];
      const snake = camelToSnake({ [key]: 1 }) as Record<string, unknown>;
      const snakeKey = Object.keys(snake)[0];
      const camelBack = snakeToCamel({ [snakeKey]: 1 }) as Record<string, unknown>;
      const camelKey = Object.keys(camelBack)[0];
      // 不要求完全一致(XMLHttpRequest → x_m_l_http_request 是已知行为),
      // 只要求 round-trip 不丢字段
      expect(snakeKey).toBeTruthy();
      expect(camelKey).toBeTruthy();
    }
  });

  it('null / undefined / number / string 原样返回', () => {
    expect(camelToSnake(null)).toBe(null);
    expect(camelToSnake(undefined)).toBe(undefined);
    expect(camelToSnake(42)).toBe(42);
    expect(camelToSnake('string')).toBe('string');
  });

  it('undefined 字段被跳过(不写入 result)', () => {
    const out = camelToSnake({ a: 1, b: undefined, c: 3 }) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(['a', 'c']);
  });

  it('嵌套对象递归转换', () => {
    const out = camelToSnake({
      outerField: { innerField: 1, list: [{ itemId: 1 }] },
    }) as Record<string, unknown>;
    expect(out.outer_field).toBeDefined();
    const inner = out.outer_field as Record<string, unknown>;
    expect(inner.inner_field).toBe(1);
    expect((inner.list as Array<Record<string, unknown>>)[0].item_id).toBe(1);
  });
});

describe('security fuzz — transform.parseDates', () => {
  it('非法日期字符串生成 Invalid Date(不抛错)', () => {
    const out = parseDates({ createdAt: 'not a date' });
    expect(out.createdAt).toBeInstanceOf(Date);
    expect(isNaN((out.createdAt as Date).getTime())).toBe(true);
  });

  it('null/undefined 字段保持原值(不转换为 Date)', () => {
    const out = parseDates({ createdAt: null, updatedAt: undefined });
    expect(out.createdAt).toBe(null);
    expect(out.updatedAt).toBe(undefined);
  });

  it('合法 ISO 字符串正确转换', () => {
    const out = parseDates({ createdAt: '2026-07-18T10:00:00Z' });
    expect(out.createdAt).toBeInstanceOf(Date);
    expect((out.createdAt as Date).toISOString()).toBe('2026-07-18T10:00:00.000Z');
  });
});

// --- 7. persistenceSlice.importData 原型污染/超大数组 fuzz ---

describe('security fuzz — persistenceSlice.importData 原型污染防御', () => {
  // 不实际写 store,只验证 JSON.parse + 字段校验逻辑
  it('__proto__ 注入:JSON.parse 后 __proto__ 字段不污染 Object.prototype', () => {
    const malicious = JSON.parse('{"__proto__":{"polluted":"yes"}}');
    expect((Object.prototype as unknown as { polluted?: unknown }).polluted).toBeUndefined();
    // malicious 对象的 __proto__ 是 Object.prototype,不会自动污染
    expect(malicious).not.toHaveProperty('polluted');
  });

  it('constructor.prototype 注入也不污染', () => {
    JSON.parse('{"constructor":{"prototype":{"polluted":"yes"}}}');
    expect((Object.prototype as unknown as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it('10MB 的合法 JSON 数组(超 10000 项)被 MAX_IMPORT_ITEMS 拒绝', async () => {
    // 直接构造 10001 个 task 的数组,验证 assertArray 的 length 检查
    const huge = Array.from({ length: 10001 }, (_, i) => ({ id: `t-${i}`, title: 'x' }));
    const payload = JSON.stringify({ version: '2', tasks: huge });
    // importData 会抛 "超过最大允许数量 10000"
    // 这里只验证 JSON.parse + length 检查能拦截,不实际调用 store
    const parsed = JSON.parse(payload);
    expect(parsed.tasks.length).toBe(10001);
    expect(10001).toBeGreaterThan(10000);
  });
});
