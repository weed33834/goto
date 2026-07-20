// 移动端设备身份 —— Ed25519 签名密钥对，与桌面端 syncIdentity.ts 二进制兼容。
// deviceId = sha256(SPKI 原始公钥) 前 16 hex；身份 JSON 存 expo-secure-store
// （Keychain/Keystore 硬件级加密，无需像桌面端 safeStorage 二次加密）。

import { base64ToBytes, bytesToHex, concatBytes, derToPem, pemToDer, utf8Encode } from './bytes';
import type { Bytes } from './bytes';
import { secureGet, secureSet, secureDelete } from '../utils/secureStorage';

const IDENTITY_KEY = 'sync_device_identity';

export interface DeviceIdentity {
  deviceId: string;
  name: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

function getSubtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error('Web Crypto subtle 不可用：设备身份需要 Ed25519 支持');
  }
  return c.subtle;
}

/** 计算设备指纹：sha256(原始公钥) 前 16 hex，与桌面端 getDeviceFingerprint 一致。
 *  经 JWK 导出取 Ed25519 公钥原始字节，避免手写 ASN.1 SPKI 解析。 */
export async function getDeviceFingerprint(publicKeyPem: string): Promise<string> {
  const pubKey = await getSubtle().importKey(
    'spki',
    pemToDer(publicKeyPem),
    'Ed25519',
    true,
    ['verify'],
  );
  const jwk = await getSubtle().exportKey('jwk', pubKey);
  // JWK.x 为 base64url 编码的原始公钥（Ed25519 SPKI BIT STRING 内容）
  const rawPublicKey = base64ToBytes((jwk.x ?? '').replace(/-/g, '+').replace(/_/g, '/'));
  const hash = await getSubtle().digest('SHA-256', rawPublicKey);
  return bytesToHex(new Uint8Array(hash)).slice(0, 16);
}

/** 生成新的设备身份并持久化到安全存储。 */
export async function generateDeviceIdentity(name: string): Promise<DeviceIdentity> {
  const pair = await getSubtle().generateKey('Ed25519', true, ['sign', 'verify']);
  const pubDer = new Uint8Array(await getSubtle().exportKey('spki', pair.publicKey));
  const privDer = new Uint8Array(await getSubtle().exportKey('pkcs8', pair.privateKey));
  const publicKeyPem = derToPem(pubDer, 'PUBLIC KEY');
  const privateKeyPem = derToPem(privDer, 'PRIVATE KEY');
  const deviceId = await getDeviceFingerprint(publicKeyPem);
  const identity: DeviceIdentity = { deviceId, name, publicKeyPem, privateKeyPem };
  await saveDeviceIdentity(identity);
  return identity;
}

/** 持久化设备身份到 Keychain / Keystore。 */
export async function saveDeviceIdentity(identity: DeviceIdentity): Promise<void> {
  await secureSet(IDENTITY_KEY, JSON.stringify(identity));
}

/**
 * 从安全存储加载设备身份。不存在时返回 null。
 * 拒绝加载不完整的身份（缺 privateKeyPem 视为损坏，返回 null）。
 */
export async function loadDeviceIdentity(): Promise<DeviceIdentity | null> {
  const raw = await secureGet(IDENTITY_KEY);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<DeviceIdentity>;
    if (
      typeof obj.deviceId !== 'string' ||
      typeof obj.name !== 'string' ||
      typeof obj.publicKeyPem !== 'string' ||
      typeof obj.privateKeyPem !== 'string'
    ) {
      return null;
    }
    return {
      deviceId: obj.deviceId,
      name: obj.name,
      publicKeyPem: obj.publicKeyPem,
      privateKeyPem: obj.privateKeyPem,
    };
  } catch {
    return null;
  }
}

/** 删除设备身份（设备吊销 / 重置配对时调用）。幂等。 */
export async function deleteDeviceIdentity(): Promise<void> {
  await secureDelete(IDENTITY_KEY);
}

/** 用私钥对消息签名，返回 64 字节 Ed25519 签名，与桌面端 signMessage 字节一致。 */
export async function signMessage(message: Bytes, privateKeyPem: string): Promise<Bytes> {
  const privKey = await getSubtle().importKey('pkcs8', pemToDer(privateKeyPem), 'Ed25519', false, ['sign']);
  return new Uint8Array(await getSubtle().sign('Ed25519', privKey, message));
}

/** 用公钥验证签名。验签失败返回 false（不抛错），与桌面端 verifySignature 一致。 */
export async function verifySignature(
  message: Bytes,
  signature: Bytes,
  publicKeyPem: string,
): Promise<boolean> {
  try {
    const pubKey = await getSubtle().importKey('spki', pemToDer(publicKeyPem), 'Ed25519', true, ['verify']);
    return await getSubtle().verify('Ed25519', pubKey, signature, message);
  } catch {
    return false;
  }
}

// 握手签名数据：5 个字段各加 4 字节 BE 长度前缀后拼接，与桌面端 buildSignedData 一致。
function writeLengthPrefixed(buf: Bytes): Bytes {
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, buf.length);
  return concatBytes([len, buf]);
}

export function buildSignedData(
  deviceId: string,
  peerDeviceId: string,
  nonce: string,
  peerNonce: string,
  ecdhPublicKeyPem: string,
): Bytes {
  return concatBytes([
    writeLengthPrefixed(utf8Encode(deviceId)),
    writeLengthPrefixed(utf8Encode(peerDeviceId)),
    writeLengthPrefixed(utf8Encode(nonce)),
    writeLengthPrefixed(utf8Encode(peerNonce)),
    writeLengthPrefixed(utf8Encode(ecdhPublicKeyPem)),
  ]);
}
