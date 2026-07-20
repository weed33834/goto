import { describe, it, expect } from 'vitest';
import {
  generateSyncMasterKey,
  encryptSyncRecord,
  decryptSyncRecord,
  generateEcdhKeyPair,
  computeSharedSecret,
  deriveSessionKey,
  deriveSessionKeys,
  encryptSessionMessage,
  decryptSessionMessage,
} from './syncCrypto';
import { utf8Encode, utf8Decode } from './bytes';

// 辅助：Uint8Array → Node Buffer（用于跨实现验证）
function toBuffer(arr: Uint8Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

describe('syncCrypto — 同步主密钥', () => {
  it('生成 32 字节随机密钥', () => {
    const key = generateSyncMasterKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('两次生成结果不同（随机性）', () => {
    const a = generateSyncMasterKey();
    const b = generateSyncMasterKey();
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe('syncCrypto — 记录级 AES-256-GCM 加解密', () => {
  it('round-trip 还原 payload', async () => {
    const smk = generateSyncMasterKey();
    const payload = { id: 'task-1', title: '测试任务', done: false, nested: { a: [1, 2, 3] } };
    const ciphertext = await encryptSyncRecord(payload, smk);
    const decrypted = await decryptSyncRecord(ciphertext, smk);
    expect(decrypted).toEqual(payload);
  });

  it('密文格式 = iv[12] + authTag[16] + ciphertext', async () => {
    const smk = generateSyncMasterKey();
    const payload = { msg: '格式验证' };
    const ciphertext = await encryptSyncRecord(payload, smk);
    // iv 12 + authTag 16 = 28 字节头，之后是密文
    expect(ciphertext.length).toBeGreaterThan(28);
    // 验证头部确实是 12 字节 IV + 16 字节 authTag
    const iv = ciphertext.subarray(0, 12);
    const authTag = ciphertext.subarray(12, 28);
    expect(iv.length).toBe(12);
    expect(authTag.length).toBe(16);
  });

  it('同一 payload 两次加密产生不同密文（随机 IV）', async () => {
    const smk = generateSyncMasterKey();
    const payload = { msg: '随机性' };
    const c1 = await encryptSyncRecord(payload, smk);
    const c2 = await encryptSyncRecord(payload, smk);
    // IV 不同导致整体密文不同
    expect(Array.from(c1)).not.toEqual(Array.from(c2));
  });

  it('篡改密文 → 解密失败', async () => {
    const smk = generateSyncMasterKey();
    const payload = { msg: '防篡改' };
    const ciphertext = await encryptSyncRecord(payload, smk);
    // 篡改最后一个字节
    ciphertext[ciphertext.length - 1] ^= 0xff;
    await expect(decryptSyncRecord(ciphertext, smk)).rejects.toThrow('authentication failed');
  });

  it('错误密钥 → 解密失败', async () => {
    const smk1 = generateSyncMasterKey();
    const smk2 = generateSyncMasterKey();
    const ciphertext = await encryptSyncRecord({ msg: '密钥隔离' }, smk1);
    await expect(decryptSyncRecord(ciphertext, smk2)).rejects.toThrow('authentication failed');
  });

  it('无效 SMK 长度 → 抛错', async () => {
    const badSmk = new Uint8Array(16);
    await expect(encryptSyncRecord({ a: 1 }, badSmk)).rejects.toThrow('Invalid sync master key');
  });

  it('密文过短 → 抛错', async () => {
    const smk = generateSyncMasterKey();
    const tooShort = new Uint8Array(10);
    await expect(decryptSyncRecord(tooShort, smk)).rejects.toThrow('too short');
  });

  // === 与桌面端 Node crypto 互操作验证 ===
  it('移动端加密 → Node crypto 解密（authTag 位置适配）', async () => {
    const smk = generateSyncMasterKey();
    const payload = { id: 'interop', title: '跨平台', values: [1, 2, 3] };
    const ciphertext = await encryptSyncRecord(payload, smk);

    // 用 Node crypto 解密：iv[12] + authTag[16] + encrypted
    const buf = toBuffer(ciphertext);
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = require('crypto').createDecipheriv('aes-256-gcm', toBuffer(smk), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    expect(JSON.parse(plaintext.toString('utf8'))).toEqual(payload);
  });

  it('Node crypto 加密 → 移动端解密（authTag 位置适配）', async () => {
    const smk = generateSyncMasterKey();
    const payload = { id: 'interop-reverse', msg: '反向验证' };
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');

    const crypto = require('crypto');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', toBuffer(smk), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Node 线格式：iv + authTag + encrypted
    const nodeCiphertext = Buffer.concat([iv, authTag, encrypted]);

    const decrypted = await decryptSyncRecord(new Uint8Array(nodeCiphertext), smk);
    expect(decrypted).toEqual(payload);
  });
});

describe('syncCrypto — X25519 ECDH', () => {
  it('双方独立生成密钥对，ECDH 共享密钥一致', async () => {
    const alice = await generateEcdhKeyPair();
    const bob = await generateEcdhKeyPair();
    const ssAlice = await computeSharedSecret(alice.privateKeyPem, bob.publicKeyPem);
    const ssBob = await computeSharedSecret(bob.privateKeyPem, alice.publicKeyPem);
    expect(Array.from(ssAlice)).toEqual(Array.from(ssBob));
    expect(ssAlice.length).toBe(32);
  });

  it('PEM 格式与 Node crypto 兼容', async () => {
    const pair = await generateEcdhKeyPair();
    // 验证 PEM 可被 Node crypto 解析
    const crypto = require('crypto');
    expect(() => crypto.createPublicKey({ key: pair.publicKeyPem, format: 'pem' })).not.toThrow();
    expect(() => crypto.createPrivateKey({ key: pair.privateKeyPem, format: 'pem' })).not.toThrow();
  });

  it('移动端 ECDH 与 Node crypto ECDH 共享密钥一致', async () => {
    const wcPair = await generateEcdhKeyPair();
    const crypto = require('crypto');
    const nodePair = crypto.generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    // WC 私钥 + Node 公钥
    const ssWc = await computeSharedSecret(wcPair.privateKeyPem, nodePair.publicKey);
    const ssNode = crypto.diffieHellman({
      privateKey: crypto.createPrivateKey({ key: nodePair.privateKey, format: 'pem' }),
      publicKey: crypto.createPublicKey({ key: wcPair.publicKeyPem, format: 'pem' }),
    });
    expect(Array.from(ssWc)).toEqual(Array.from(ssNode));
  });
});

describe('syncCrypto — HKDF-SHA256', () => {
  it('与 Node crypto hkdfSync 输出一致', async () => {
    const sharedSecret = new Uint8Array(32);
    for (let i = 0; i < 32; i++) sharedSecret[i] = i;
    const salt = new Uint8Array(16);
    for (let i = 0; i < 16; i++) salt[i] = 100 + i;
    const info = 'taskflow-sync-v1';

    const wcKey = await deriveSessionKey(sharedSecret, salt, info);
    const crypto = require('crypto');
    const nodeKey = Buffer.from(crypto.hkdfSync('sha256', toBuffer(sharedSecret), toBuffer(salt), info, 32));
    expect(Array.from(wcKey)).toEqual(Array.from(nodeKey));
  });

  it('不同 info 派生出不同密钥', async () => {
    const ss = new Uint8Array(32);
    const salt = new Uint8Array(16);
    const k1 = await deriveSessionKey(ss, salt, 'info-a');
    const k2 = await deriveSessionKey(ss, salt, 'info-b');
    expect(Array.from(k1)).not.toEqual(Array.from(k2));
  });
});

describe('syncCrypto — 会话密钥派生', () => {
  it('initiator.sendKey === responder.receiveKey', async () => {
    const ss = new Uint8Array(32);
    const salt = new Uint8Array(16);
    const initiatorKeys = await deriveSessionKeys(ss, salt, 'initiator');
    const responderKeys = await deriveSessionKeys(ss, salt, 'responder');
    expect(Array.from(initiatorKeys.sendKey)).toEqual(Array.from(responderKeys.receiveKey));
    expect(Array.from(initiatorKeys.receiveKey)).toEqual(Array.from(responderKeys.sendKey));
    // sendKey ≠ receiveKey（方向隔离）
    expect(Array.from(initiatorKeys.sendKey)).not.toEqual(Array.from(initiatorKeys.receiveKey));
  });

  it('与桌面端 deriveSessionKeys 语义一致', async () => {
    const ss = new Uint8Array(32);
    for (let i = 0; i < 32; i++) ss[i] = i;
    const salt = new Uint8Array(16);
    for (let i = 0; i < 16; i++) salt[i] = 200 - i;

    const wcKeys = await deriveSessionKeys(ss, salt, 'initiator');
    const crypto = require('crypto');
    const info = 'taskflow-sync-v1';
    const expectedSend = Buffer.from(
      crypto.hkdfSync('sha256', toBuffer(ss), toBuffer(salt), `${info}|initiator->responder`, 32),
    );
    const expectedReceive = Buffer.from(
      crypto.hkdfSync('sha256', toBuffer(ss), toBuffer(salt), `${info}|responder->initiator`, 32),
    );
    expect(Array.from(wcKeys.sendKey)).toEqual(Array.from(expectedSend));
    expect(Array.from(wcKeys.receiveKey)).toEqual(Array.from(expectedReceive));
  });
});

describe('syncCrypto — 会话消息加解密', () => {
  it('round-trip 还原明文', async () => {
    const key = generateSyncMasterKey();
    const plaintext = utf8Encode('这是一条加密的会话消息 🔒');
    const ciphertext = await encryptSessionMessage(plaintext, key);
    const decrypted = await decryptSessionMessage(ciphertext, key);
    expect(utf8Decode(decrypted)).toBe('这是一条加密的会话消息 🔒');
  });

  it('密文格式 = iv[12] + authTag[16] + ciphertext', async () => {
    const key = generateSyncMasterKey();
    const ciphertext = await encryptSessionMessage(utf8Encode('x'), key);
    expect(ciphertext.length).toBe(12 + 16 + 1); // 1 字节明文
  });

  it('篡改 → 解密失败', async () => {
    const key = generateSyncMasterKey();
    const ciphertext = await encryptSessionMessage(utf8Encode('tamper-test'), key);
    ciphertext[30] ^= 0x01;
    await expect(decryptSessionMessage(ciphertext, key)).rejects.toThrow('authentication failed');
  });

  it('移动端加密 → Node crypto 解密', async () => {
    const key = generateSyncMasterKey();
    const plaintext = utf8Encode('cross-platform session');
    const ciphertext = await encryptSessionMessage(plaintext, key);

    const buf = toBuffer(ciphertext);
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const crypto = require('crypto');
    const decipher = crypto.createDecipheriv('aes-256-gcm', toBuffer(key), iv);
    decipher.setAuthTag(authTag);
    const result = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    expect(result.toString('utf8')).toBe('cross-platform session');
  });
});
