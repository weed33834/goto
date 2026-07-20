import { describe, it, expect } from 'vitest';
import {
  serializeMessage,
  deserializeMessage,
  encodeFrame,
  FrameParser,
  isSyncMessage,
  isHelloMessage,
  isManifestMessage,
  isBatchMessage,
  isWireSyncRecord,
  MAX_FRAME_SIZE,
  type SyncMessage,
  type HelloMessage,
  type WireSyncRecord,
  type FrameMode,
} from './syncMessages';
import { utf8Encode } from './bytes';

// === 消息序列化 / 反序列化 ===

describe('syncMessages — 序列化 round-trip', () => {
  const messages: { name: string; msg: SyncMessage }[] = [
    {
      name: 'HELLO',
      msg: { type: 'HELLO', deviceId: 'abc123', publicKey: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n', nonce: 'base64nonce==' },
    },
    {
      name: 'OFFER',
      msg: { type: 'OFFER', signedPayload: 'base64payload==' },
    },
    {
      name: 'ANSWER',
      msg: { type: 'ANSWER', signedPayload: 'base64answer==' },
    },
    {
      name: 'MANIFEST',
      msg: {
        type: 'MANIFEST',
        records: [
          { id: 'rec-1', updatedAt: 1000, hash: 'sha256hex' },
          { id: 'rec-2', updatedAt: 2000, hash: 'abcdef' },
        ],
      },
    },
    {
      name: 'REQUEST',
      msg: { type: 'REQUEST', recordIds: ['rec-1', 'rec-2', 'rec-3'] },
    },
    {
      name: 'BATCH',
      msg: {
        type: 'BATCH',
        records: [
          {
            id: 'rec-1',
            tableName: 'tasks',
            recordId: 'task-1',
            version: 3,
            encryptedPayload: 'base64enc==',
            updatedAt: 1000,
            deleted: 0,
            deviceVersion: { devA: 2, devB: 1 },
          },
        ],
      },
    },
    {
      name: 'ACK',
      msg: { type: 'ACK', receivedIds: ['rec-1', 'rec-2'] },
    },
    {
      name: 'ERROR',
      msg: { type: 'ERROR', code: 'REQUEST_TOO_LARGE', message: 'Too many IDs' },
    },
    {
      name: 'SMK_TRANSFER',
      msg: { type: 'SMK_TRANSFER', encryptedSmk: 'base64smk==' },
    },
  ];

  for (const { name, msg } of messages) {
    it(`${name} round-trips through serialize/deserialize`, () => {
      const bytes = serializeMessage(msg);
      const restored = deserializeMessage(bytes);
      expect(restored).toEqual(msg);
    });
  }

  it('序列化字节与 Node Buffer.from(JSON.stringify) 一致', () => {
    const msg: HelloMessage = { type: 'HELLO', deviceId: '设备1', publicKey: 'pk', nonce: 'n' };
    const bytes = serializeMessage(msg);
    const nodeBytes = Buffer.from(JSON.stringify(msg), 'utf8');
    expect(Array.from(bytes)).toEqual(Array.from(nodeBytes));
  });
});

describe('syncMessages — 反序列化错误处理', () => {
  it('非法 JSON → 抛错', () => {
    expect(() => deserializeMessage(utf8Encode('{invalid json'))).toThrow('invalid JSON');
  });

  it('有效 JSON 但非同步消息 → 抛错', () => {
    expect(() => deserializeMessage(utf8Encode(JSON.stringify({ type: 'UNKNOWN', foo: 1 })))).toThrow(
      'Invalid sync message',
    );
  });

  it('HELLO 缺少字段 → 抛错', () => {
    expect(() =>
      deserializeMessage(utf8Encode(JSON.stringify({ type: 'HELLO', deviceId: 'x' }))),
    ).toThrow('Invalid sync message');
  });

  it('BATCH 中 record 缺少字段 → 抛错', () => {
    const badBatch = { type: 'BATCH', records: [{ id: 'r1', tableName: 'tasks' }] };
    expect(() => deserializeMessage(utf8Encode(JSON.stringify(badBatch)))).toThrow(
      'Invalid sync message',
    );
  });
});

// === 类型守卫 ===

describe('syncMessages — 类型守卫', () => {
  it('isHelloMessage 校验字段', () => {
    expect(isHelloMessage({ type: 'HELLO', deviceId: 'x', publicKey: 'pk', nonce: 'n' })).toBe(true);
    expect(isHelloMessage({ type: 'HELLO', deviceId: 'x' })).toBe(false);
    expect(isHelloMessage(null)).toBe(false);
  });

  it('isManifestMessage 校验 records 数组', () => {
    expect(
      isManifestMessage({ type: 'MANIFEST', records: [{ id: 'r', updatedAt: 1, hash: 'h' }] }),
    ).toBe(true);
    expect(isManifestMessage({ type: 'MANIFEST', records: [{ id: 'r' }] })).toBe(false);
    expect(isManifestMessage({ type: 'MANIFEST', records: 'not-array' })).toBe(false);
  });

  it('isWireSyncRecord 校验 deviceVersion 版本向量', () => {
    const valid: WireSyncRecord = {
      id: 'r1',
      tableName: 'tasks',
      recordId: 't1',
      version: 1,
      encryptedPayload: 'enc',
      updatedAt: 1,
      deleted: 0,
      deviceVersion: { A: 1 },
    };
    expect(isWireSyncRecord(valid)).toBe(true);
    expect(isWireSyncRecord({ ...valid, deviceVersion: { A: 'not-number' } })).toBe(false);
    expect(isWireSyncRecord({ ...valid, deviceVersion: [1, 2] })).toBe(false);
    // NaN / Infinity 必须被拒绝：conflictResolver 用 `<=` 比较，NaN 全 false 会误判 concurrent
    expect(isWireSyncRecord({ ...valid, deviceVersion: { A: NaN } })).toBe(false);
    expect(isWireSyncRecord({ ...valid, deviceVersion: { A: Infinity } })).toBe(false);
    expect(isWireSyncRecord({ ...valid, deviceVersion: { A: -Infinity } })).toBe(false);
  });

  it('isBatchMessage 逐条校验 records', () => {
    const valid: WireSyncRecord = {
      id: 'r1', tableName: 'tasks', recordId: 't1', version: 1,
      encryptedPayload: 'enc', updatedAt: 1, deleted: 0,
    };
    expect(isBatchMessage({ type: 'BATCH', records: [valid] })).toBe(true);
    expect(isBatchMessage({ type: 'BATCH', records: [valid, { bad: true }] })).toBe(false);
  });

  it('isSyncMessage 对未知 type 返回 false', () => {
    expect(isSyncMessage({ type: 'PONG', data: 1 })).toBe(false);
    expect(isSyncMessage('string')).toBe(false);
    expect(isSyncMessage(null)).toBe(false);
  });
});

// === 帧协议 ===

describe('syncMessages — 帧编码 / 解析', () => {
  it('encodeFrame 产出 mode[1] + length[4 BE] + payload', () => {
    const payload = utf8Encode('hello frame');
    const frame = encodeFrame(1, payload);
    expect(frame[0]).toBe(1); // mode
    // 4 字节 BE 长度
    const length = (frame[1] << 24) | (frame[2] << 16) | (frame[3] << 8) | frame[4];
    expect(length).toBe(payload.length);
    expect(Array.from(frame.subarray(5))).toEqual(Array.from(payload));
  });

  it('FrameParser 解析单帧', () => {
    const payload = utf8Encode('single frame');
    const frame = encodeFrame(0, payload);
    const frames: { mode: FrameMode; payload: Uint8Array }[] = [];
    const parser = new FrameParser(
      (f) => frames.push(f),
      () => {},
    );
    parser.feed(frame);
    expect(frames).toHaveLength(1);
    expect(frames[0].mode).toBe(0);
    expect(Array.from(frames[0].payload)).toEqual(Array.from(payload));
  });

  it('FrameParser 解析多帧（一次喂入）', () => {
    const p1 = utf8Encode('first');
    const p2 = utf8Encode('second');
    const combined = new Uint8Array([...encodeFrame(0, p1), ...encodeFrame(1, p2)]);
    const frames: { mode: FrameMode; payload: Uint8Array }[] = [];
    const parser = new FrameParser((f) => frames.push(f), () => {});
    parser.feed(combined);
    expect(frames).toHaveLength(2);
    expect(frames[0].mode).toBe(0);
    expect(Array.from(frames[0].payload)).toEqual(Array.from(p1));
    expect(frames[1].mode).toBe(1);
    expect(Array.from(frames[1].payload)).toEqual(Array.from(p2));
  });

  it('FrameParser 增量喂入（分片到达）', () => {
    const payload = utf8Encode('fragmented');
    const frame = encodeFrame(1, payload);
    const frames: { mode: FrameMode; payload: Uint8Array }[] = [];
    const parser = new FrameParser((f) => frames.push(f), () => {});

    // 先喂 3 字节（不足 header）
    parser.feed(frame.subarray(0, 3));
    expect(frames).toHaveLength(0);
    // 再喂到 header 完整但 payload 不全
    parser.feed(frame.subarray(3, 6));
    expect(frames).toHaveLength(0);
    // 喂入剩余
    parser.feed(frame.subarray(6));
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0].payload)).toEqual(Array.from(payload));
  });

  it('FrameParser 拒绝非法 mode', () => {
    const errors: Error[] = [];
    const parser = new FrameParser(() => {}, (e) => errors.push(e));
    const bad = new Uint8Array([5, 0, 0, 0, 1, 0]); // mode=5 非法
    parser.feed(bad);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Invalid frame mode');
  });

  it('FrameParser 拒绝超大帧', () => {
    const errors: Error[] = [];
    const parser = new FrameParser(() => {}, (e) => errors.push(e));
    // 构造一个声称长度 = MAX_FRAME_SIZE + 1 的帧头
    const huge = new Uint8Array(6);
    huge[0] = 0; // mode
    const bigLen = MAX_FRAME_SIZE + 1;
    huge[1] = (bigLen >>> 24) & 0xff;
    huge[2] = (bigLen >>> 16) & 0xff;
    huge[3] = (bigLen >>> 8) & 0xff;
    huge[4] = bigLen & 0xff;
    parser.feed(huge);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('maximum size');
  });

  it('FrameParser 跨平台兼容：与桌面端 Node Buffer 帧格式一致', () => {
    // 桌面端 encodeFrame: Buffer.allocUnsafe(5 + payload.length), writeUInt32BE
    const payload = utf8Encode('interop frame');
    const mobileFrame = encodeFrame(1, payload);

    // 用 Node Buffer 重新解析
    const buf = Buffer.from(mobileFrame);
    const mode = buf[0];
    const length = buf.readUInt32BE(1);
    const nodePayload = buf.subarray(5, 5 + length);
    expect(mode).toBe(1);
    expect(length).toBe(payload.length);
    expect(Array.from(nodePayload)).toEqual(Array.from(payload));
  });
});
