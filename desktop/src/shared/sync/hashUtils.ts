// 移动端哈希工具 —— Web Crypto SHA-256，与桌面端 Node crypto.createHash 字节一致。
// 用于 manifest record hash (sha256(base64(encryptedPayload))) 和 batch 落库 hash 校验。

import { bytesToHex } from './bytes';
import type { Bytes } from './bytes';

/** sha256(data) → Bytes。供 syncSession 等复用，避免重复实现 Web Crypto 调用。 */
export async function sha256Bytes(data: Bytes): Promise<Bytes> {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error('Web Crypto subtle 不可用：SHA-256 需要 subtle.digest');
  }
  return new Uint8Array(await c.subtle.digest('SHA-256', data)) as Bytes;
}

/** sha256(data) → 小写 hex。 */
export async function sha256Hex(data: Bytes): Promise<string> {
  return bytesToHex(await sha256Bytes(data));
}
