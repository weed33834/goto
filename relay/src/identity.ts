import { createHash, createPublicKey, verify } from 'crypto';

/** 计算设备指纹：sha256(原始公钥) 前 16 hex。
 *  经 JWK 导出取 Ed25519 公钥原始字节，避免手写 ASN.1 SPKI 解析。 */
export function getDeviceFingerprint(publicKeyPem: string): string {
  const jwk = createPublicKey(publicKeyPem).export({ format: 'jwk' }) as unknown as {
    x?: string;
  };
  const rawPublicKey = Buffer.from(jwk.x ?? '', 'base64url');
  return createHash('sha256').update(rawPublicKey).digest('hex').slice(0, 16);
}

export function verifyDeviceSignature(
  message: Buffer,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  try {
    return verify(null, message, publicKeyPem, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}
