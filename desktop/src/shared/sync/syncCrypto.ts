// 移动端同步加密层 —— 基于 Web Crypto API，与桌面端 Node crypto 二进制兼容。
//
// 协议：AES-256-GCM（IV 12B / authTag 16B）+ X25519 ECDH + HKDF-SHA256。
// 线格式 iv||authTag||ciphertext 与 Node crypto 一致；Web Crypto 输出
// ciphertext||authTag，需在 encrypt 后 / decrypt 前重排（见 pack/unpack）。

import { concatBytes, utf8Encode, utf8Decode, derToPem, pemToDer, randomBytes } from './bytes';
import type { Bytes } from './bytes';

const GCM_IV_LEN = 12;
const GCM_TAG_LEN = 16;
const SYNC_KEY_LENGTH = 32;
const HKDF_INFO = 'taskflow-sync-v1';

function getCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error('Web Crypto subtle 不可用：同步加密需要 subtle');
  }
  return c;
}

// Web Crypto GCM 输出 ciphertext||authTag（tag 尾部 GCM_TAG_LEN 字节）。
// 线格式 iv||authTag||ciphertext，与桌面端 Node crypto 一致。
function packGcmWire(iv: Bytes, raw: Uint8Array): Bytes {
  const tag = raw.subarray(raw.length - GCM_TAG_LEN);
  const ct = raw.subarray(0, raw.length - GCM_TAG_LEN);
  return concatBytes([iv, tag, ct]);
}

// 反向：从线格式提取 iv 与 Web Crypto 期望的 ciphertext||authTag。
function unpackGcmWire(packed: Bytes): { iv: Bytes; wcInput: Bytes } {
  const iv = packed.subarray(0, GCM_IV_LEN);
  const tag = packed.subarray(GCM_IV_LEN, GCM_IV_LEN + GCM_TAG_LEN);
  const ct = packed.subarray(GCM_IV_LEN + GCM_TAG_LEN);
  return { iv, wcInput: concatBytes([ct, tag]) };
}

export interface SyncRecordPayload {
  [key: string]: unknown;
}

/** 生成 32 字节同步主密钥（SMK），用于 AES-256-GCM 对称加密。 */
export function generateSyncMasterKey(): Bytes {
  return randomBytes(SYNC_KEY_LENGTH);
}

function assertSmk(smk: Bytes): void {
  if (!(smk instanceof Uint8Array) || smk.length !== SYNC_KEY_LENGTH) {
    throw new Error('Invalid sync master key: expected 32-byte Uint8Array');
  }
}

async function importAesGcmKey(rawKey: Bytes, keyUsages: KeyUsage[]): Promise<CryptoKey> {
  return getCrypto().subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, keyUsages);
}

/** 加密一条同步记录。线格式：iv[12] + authTag[16] + ciphertext。 */
export async function encryptSyncRecord(
  payload: SyncRecordPayload,
  smk: Bytes,
): Promise<Bytes> {
  assertSmk(smk);
  const iv = randomBytes(GCM_IV_LEN);
  const key = await importAesGcmKey(smk, ['encrypt']);
  const raw = new Uint8Array(
    await getCrypto().subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8Encode(JSON.stringify(payload))),
  );
  return packGcmWire(iv, raw);
}

/** 解密一条同步记录。输入线格式：iv[12] + authTag[16] + ciphertext。 */
export async function decryptSyncRecord(
  ciphertext: Bytes,
  smk: Bytes,
): Promise<SyncRecordPayload> {
  assertSmk(smk);
  if (ciphertext.length < GCM_IV_LEN + GCM_TAG_LEN + 1) {
    throw new Error('Invalid sync record ciphertext: too short');
  }
  const { iv, wcInput } = unpackGcmWire(ciphertext);
  const key = await importAesGcmKey(smk, ['decrypt']);
  let plaintext: Uint8Array;
  try {
    plaintext = new Uint8Array(await getCrypto().subtle.decrypt({ name: 'AES-GCM', iv }, key, wcInput));
  } catch {
    throw new Error('Invalid sync record ciphertext: authentication failed');
  }
  try {
    return JSON.parse(utf8Decode(plaintext)) as SyncRecordPayload;
  } catch {
    throw new Error('Invalid sync record payload: not valid JSON');
  }
}

/** HKDF-SHA256 单轮派生（extract+expand），与桌面端 hkdfSync 字节一致。 */
export async function deriveSessionKey(
  sharedSecret: Bytes,
  salt: Bytes,
  info: string = HKDF_INFO,
): Promise<Bytes> {
  const subtle = getCrypto().subtle;
  const baseKey = await subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveBits']);
  const derived = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8Encode(info) },
    baseKey,
    SYNC_KEY_LENGTH * 8,
  );
  return new Uint8Array(derived);
}

export interface EcdhKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
}

/** 生成 X25519 ECDH 临时密钥对，PEM 格式与桌面端一致。 */
export async function generateEcdhKeyPair(): Promise<EcdhKeyPair> {
  const pair = (await getCrypto().subtle.generateKey('X25519', true, ['deriveBits'])) as CryptoKeyPair;
  const pubDer = new Uint8Array(await getCrypto().subtle.exportKey('spki', pair.publicKey));
  const privDer = new Uint8Array(await getCrypto().subtle.exportKey('pkcs8', pair.privateKey));
  return {
    publicKeyPem: derToPem(pubDer, 'PUBLIC KEY'),
    privateKeyPem: derToPem(privDer, 'PRIVATE KEY'),
  };
}

/**
 * 计算 ECDH 共享密钥，与桌面端 computeSharedSecret 字节一致。
 * X25519 公钥 importKey 的 keyUsages 必须为空数组（Web Crypto 限制）。
 */
export async function computeSharedSecret(
  privateKeyPem: string,
  publicKeyPem: string,
): Promise<Bytes> {
  const subtle = getCrypto().subtle;
  const privKey = await subtle.importKey('pkcs8', pemToDer(privateKeyPem), 'X25519', false, ['deriveBits']);
  const pubKey = await subtle.importKey('spki', pemToDer(publicKeyPem), 'X25519', true, []);
  return new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: pubKey }, privKey, 256));
}

export interface SessionKeys {
  sendKey: Bytes;
  receiveKey: Bytes;
}

/**
 * 按角色派生 sendKey / receiveKey：
 *   sendKey    = HKDF(ss, salt, `${info}|${role}->${peerRole}`)
 *   receiveKey = HKDF(ss, salt, `${info}|${peerRole}->${role}`)
 * 双方角色相反，各自 sendKey 对应对方 receiveKey，实现单向密钥隔离。
 */
export async function deriveSessionKeys(
  sharedSecret: Bytes,
  salt: Bytes,
  role: 'initiator' | 'responder',
  info: string = HKDF_INFO,
): Promise<SessionKeys> {
  const peer = role === 'initiator' ? 'responder' : 'initiator';
  const sendKey = await deriveSessionKey(sharedSecret, salt, `${info}|${role}->${peer}`);
  const receiveKey = await deriveSessionKey(sharedSecret, salt, `${info}|${peer}->${role}`);
  return { sendKey, receiveKey };
}

/** 加密一条会话消息。线格式：iv[12] + authTag[16] + ciphertext。 */
export async function encryptSessionMessage(plaintext: Bytes, key: Bytes): Promise<Bytes> {
  const iv = randomBytes(GCM_IV_LEN);
  const cryptoKey = await importAesGcmKey(key, ['encrypt']);
  const raw = new Uint8Array(
    await getCrypto().subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintext),
  );
  return packGcmWire(iv, raw);
}

/** 解密一条会话消息。输入线格式：iv[12] + authTag[16] + ciphertext。 */
export async function decryptSessionMessage(ciphertext: Bytes, key: Bytes): Promise<Bytes> {
  if (ciphertext.length < GCM_IV_LEN + GCM_TAG_LEN + 1) {
    throw new Error('Invalid session ciphertext: too short');
  }
  const { iv, wcInput } = unpackGcmWire(ciphertext);
  const cryptoKey = await importAesGcmKey(key, ['decrypt']);
  try {
    return new Uint8Array(await getCrypto().subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, wcInput));
  } catch {
    throw new Error('Invalid session ciphertext: authentication failed');
  }
}
