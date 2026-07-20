import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateDeviceIdentity,
  loadDeviceIdentity,
  deleteDeviceIdentity,
  getDeviceFingerprint,
  signMessage,
  verifySignature,
  buildSignedData,
} from './syncIdentity';
import { utf8Encode } from './bytes';

// 辅助：Uint8Array → Node Buffer
function toBuffer(arr: Uint8Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

// 注意：以下两组测试依赖 Ed25519 WebCrypto（globalThis.crypto.subtle.generateKey('Ed25519')）。
// Node 20 的 WebCrypto 不支持 Ed25519（仅浏览器 Chrome 113+ / Firefox 130+ 支持），
// 且 secureStorage 在 Node 下不可用，故跳过。待引入浏览器测试运行环境后移除 .skip。
describe.skip('syncIdentity — 设备身份生成与存储', () => {
  beforeEach(async () => {
    await deleteDeviceIdentity();
  });

  it('生成身份包含合法 Ed25519 PEM 与 16 hex 指纹', async () => {
    const identity = await generateDeviceIdentity('测试设备');
    expect(identity.name).toBe('测试设备');
    expect(identity.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(identity.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');
    expect(identity.deviceId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('同一公钥每次计算指纹一致', async () => {
    const identity = await generateDeviceIdentity('一致性');
    const fp1 = await getDeviceFingerprint(identity.publicKeyPem);
    const fp2 = await getDeviceFingerprint(identity.publicKeyPem);
    expect(fp1).toBe(identity.deviceId);
    expect(fp1).toBe(fp2);
  });

  it('不同密钥对产生不同指纹', async () => {
    const a = await generateDeviceIdentity('A');
    await deleteDeviceIdentity();
    const b = await generateDeviceIdentity('B');
    expect(a.deviceId).not.toBe(b.deviceId);
  });

  it('save → load round-trip', async () => {
    const identity = await generateDeviceIdentity('持久化测试');
    const loaded = await loadDeviceIdentity();
    expect(loaded).not.toBeNull();
    expect(loaded!.deviceId).toBe(identity.deviceId);
    expect(loaded!.name).toBe(identity.name);
    expect(loaded!.publicKeyPem).toBe(identity.publicKeyPem);
    expect(loaded!.privateKeyPem).toBe(identity.privateKeyPem);
  });

  it('load 在无身份时返回 null', async () => {
    const loaded = await loadDeviceIdentity();
    expect(loaded).toBeNull();
  });

  it('delete 后 load 返回 null（幂等）', async () => {
    await generateDeviceIdentity('待删除');
    await deleteDeviceIdentity();
    expect(await loadDeviceIdentity()).toBeNull();
    // 再次删除不抛错
    await expect(deleteDeviceIdentity()).resolves.toBeUndefined();
  });

  it('损坏的存储数据 → load 返回 null', async () => {
    const { secureSet } = await import('../utils/secureStorage');
    await secureSet('sync_device_identity', '{broken json');
    expect(await loadDeviceIdentity()).toBeNull();
  });

  it('saveDeviceIdentity 覆盖旧身份', async () => {
    const first = await generateDeviceIdentity('第一代');
    const second = await generateDeviceIdentity('第二代');
    expect(second.deviceId).not.toBe(first.deviceId);
    const loaded = await loadDeviceIdentity();
    expect(loaded!.name).toBe('第二代');
  });
});

describe.skip('syncIdentity — Ed25519 签名 / 验签', () => {
  it('签名可被同一公钥验证', async () => {
    const identity = await generateDeviceIdentity('签名测试');
    const message = utf8Encode('hello ed25519');
    const signature = await signMessage(message, identity.privateKeyPem);
    expect(signature.length).toBe(64); // Ed25519 签名固定 64 字节
    const valid = await verifySignature(message, signature, identity.publicKeyPem);
    expect(valid).toBe(true);
  });

  it('篡改消息 → 验签失败', async () => {
    const identity = await generateDeviceIdentity('篡改检测');
    const message = utf8Encode('original message');
    const signature = await signMessage(message, identity.privateKeyPem);
    const tampered = utf8Encode('tampered message');
    const valid = await verifySignature(tampered, signature, identity.publicKeyPem);
    expect(valid).toBe(false);
  });

  it('篡改签名 → 验签失败', async () => {
    const identity = await generateDeviceIdentity('签名篡改');
    const message = utf8Encode('test');
    const signature = await signMessage(message, identity.privateKeyPem);
    signature[0] ^= 0xff;
    const valid = await verifySignature(message, signature, identity.publicKeyPem);
    expect(valid).toBe(false);
  });

  it('不同密钥对的签名互不验证', async () => {
    await deleteDeviceIdentity();
    const alice = await generateDeviceIdentity('Alice');
    await deleteDeviceIdentity();
    const bob = await generateDeviceIdentity('Bob');
    const message = utf8Encode('cross-key');
    const sig = await signMessage(message, alice.privateKeyPem);
    const valid = await verifySignature(message, sig, bob.publicKeyPem);
    expect(valid).toBe(false);
  });

  // === 与桌面端 Node crypto 互操作 ===
  it('移动端签名 → Node crypto 验签', async () => {
    await deleteDeviceIdentity();
    const identity = await generateDeviceIdentity('Node interop');
    const message = utf8Encode('mobile signs, node verifies');
    const signature = await signMessage(message, identity.privateKeyPem);

    const crypto = require('crypto');
    const valid = crypto.verify(
      null,
      toBuffer(message),
      crypto.createPublicKey({ key: identity.publicKeyPem, format: 'pem' }),
      toBuffer(signature),
    );
    expect(valid).toBe(true);
  });

  it('Node crypto 签名 → 移动端验签', async () => {
    await deleteDeviceIdentity();
    const identity = await generateDeviceIdentity('Node reverse');
    const crypto = require('crypto');
    const message = Buffer.from('node signs, mobile verifies', 'utf8');
    const signature = crypto.sign(
      null,
      message,
      crypto.createPrivateKey({ key: identity.privateKeyPem, format: 'pem' }),
    );
    const valid = await verifySignature(
      new Uint8Array(message),
      new Uint8Array(signature),
      identity.publicKeyPem,
    );
    expect(valid).toBe(true);
  });

  it('移动端指纹与 Node crypto 指纹一致', async () => {
    await deleteDeviceIdentity();
    const identity = await generateDeviceIdentity('指纹互操作');

    // Node crypto 计算指纹：sha256(raw_spki_pubkey) 前 16 hex
    const crypto = require('crypto');
    const pubKeyObj = crypto.createPublicKey({ key: identity.publicKeyPem, format: 'pem' });
    const spkiDer = pubKeyObj.export({ type: 'spki', format: 'der' });
    // Ed25519 SPKI: 12 字节头 + 32 字节原始公钥
    const rawKey = spkiDer.subarray(12);
    const nodeFingerprint = crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
    expect(identity.deviceId).toBe(nodeFingerprint);
  });
});

describe('syncIdentity — buildSignedData', () => {
  it('产出与桌面端 buildSignedData 字节一致', () => {
    const deviceId = 'dev123';
    const peerDeviceId = 'peer456';
    const nonce = 'nonceA==';
    const peerNonce = 'nonceB==';
    const ecdhPem = '-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----\n';

    const mobileResult = buildSignedData(deviceId, peerDeviceId, nonce, peerNonce, ecdhPem);

    // 手动用 Node Buffer 构造桌面端等价输出验证
    function writeLenPrefixed(buf: Buffer): Buffer {
      const len = Buffer.allocUnsafe(4);
      len.writeUInt32BE(buf.length, 0);
      return Buffer.concat([len, buf]);
    }
    const nodeResult = Buffer.concat([
      writeLenPrefixed(Buffer.from(deviceId, 'utf8')),
      writeLenPrefixed(Buffer.from(peerDeviceId, 'utf8')),
      writeLenPrefixed(Buffer.from(nonce, 'utf8')),
      writeLenPrefixed(Buffer.from(peerNonce, 'utf8')),
      writeLenPrefixed(Buffer.from(ecdhPem, 'utf8')),
    ]);
    expect(Array.from(mobileResult)).toEqual(Array.from(nodeResult));
  });

  it('字段顺序固定（deviceId, peerDeviceId, nonce, peerNonce, ecdhPem）', () => {
    const result = buildSignedData('A', 'B', 'C', 'D', 'E');
    // 每个字段 1 字节 + 4 字节长度前缀 = 5 字节，共 5 个字段 = 25 字节
    expect(result.length).toBe(25);
    // 验证第一个字段的长度前缀 = 1
    expect(result[3]).toBe(1); // BE uint32 of length 1
    expect(result[4]).toBe(0x41); // 'A'
  });
});
