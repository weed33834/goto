// 字节工具：RN 没有 Node Buffer，同步子系统所有二进制操作基于 Uint8Array。
// base64 不依赖 RN 的 btoa/atob（对多字节 UTF-8 不友好），直接操作字节，
// 保证与 Node 的 Buffer.toString('base64') 输出一致。

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

// 统一基于真实 ArrayBuffer（不用 SharedArrayBuffer），可直接喂给 Web Crypto。
export type Bytes = Uint8Array<ArrayBuffer>;

export function utf8Encode(str: string): Bytes {
  return encoder.encode(str) as Bytes;
}

/** 用 Web Crypto getRandomValues 生成 length 字节随机数。供 syncCrypto/syncSession 复用。 */
export function randomBytes(length: number): Bytes {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues) {
    throw new Error('crypto.getRandomValues 不可用');
  }
  const buf = new Uint8Array(length);
  c.getRandomValues(buf);
  return buf as Bytes;
}

export function utf8Decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function concatBytes(parts: readonly Uint8Array[]): Bytes {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// --- base64 ---

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  const len = bytes.length;
  for (; i + 2 < len; i += 3) {
    const triplet = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64_CHARS[(triplet >> 18) & 0x3f];
    out += B64_CHARS[(triplet >> 12) & 0x3f];
    out += B64_CHARS[(triplet >> 6) & 0x3f];
    out += B64_CHARS[triplet & 0x3f];
  }
  const remaining = len - i;
  if (remaining === 1) {
    out += B64_CHARS[bytes[i] >> 2];
    out += B64_CHARS[(bytes[i] << 4) & 0x3f];
    out += '==';
  } else if (remaining === 2) {
    out += B64_CHARS[bytes[i] >> 2];
    out += B64_CHARS[((bytes[i] << 4) | (bytes[i + 1] >> 4)) & 0x3f];
    out += B64_CHARS[(bytes[i + 1] << 2) & 0x3f];
    out += '=';
  }
  return out;
}

const B64_LOOKUP: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < B64_CHARS.length; i++) map[B64_CHARS[i]] = i;
  return map;
})();

// 注意：输出长度按「完整组 + 残组」累加，不依赖 padding 计算，
// 否则 padding 被正则剥除后长度会算错（历史 bug）。
//
// P1 防御性修复:每个字符查表后显式检查 undefined。
// 理论上 cleaned 已过滤非法字符,B64_LOOKUP[c] 必有值;
// 但如果未来调用方传入未过滤的输入(或正则变更),undefined << 18 会变成 0,
// 静默解码出错误字节而非报错。这里加显式检查,出错时 throw 明确错误。
export function base64ToBytes(b64: string): Bytes {
  const cleaned = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = cleaned.length;
  if (len === 0) return new Uint8Array(0);
  if (len % 4 === 1) {
    throw new Error('Invalid base64: malformed length after stripping padding');
  }
  const fullGroups = Math.floor(len / 4);
  const remaining = len % 4;
  const outLen = fullGroups * 3 + (remaining === 2 ? 1 : remaining === 3 ? 2 : 0);
  const result = new Uint8Array(outLen);
  let si = 0;
  let oi = 0;
  const lookup = (c: string): number => {
    const v = B64_LOOKUP[c];
    if (v === undefined) {
      throw new Error(`Invalid base64 character: ${JSON.stringify(c)}`);
    }
    return v;
  };
  for (let g = 0; g < fullGroups; g++) {
    const triplet = (lookup(cleaned[si]) << 18)
      | (lookup(cleaned[si + 1]) << 12)
      | (lookup(cleaned[si + 2]) << 6)
      | lookup(cleaned[si + 3]);
    result[oi++] = (triplet >> 16) & 0xff;
    result[oi++] = (triplet >> 8) & 0xff;
    result[oi++] = triplet & 0xff;
    si += 4;
  }
  if (remaining === 2) {
    const triplet = (lookup(cleaned[si]) << 18) | (lookup(cleaned[si + 1]) << 12);
    result[oi++] = (triplet >> 16) & 0xff;
  } else if (remaining === 3) {
    const triplet = (lookup(cleaned[si]) << 18)
      | (lookup(cleaned[si + 1]) << 12)
      | (lookup(cleaned[si + 2]) << 6);
    result[oi++] = (triplet >> 16) & 0xff;
    result[oi++] = (triplet >> 8) & 0xff;
  }
  return result;
}

// --- hex ---

const HEX_CHARS = '0123456789abcdef';

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += HEX_CHARS[(bytes[i] >> 4) & 0xf];
    out += HEX_CHARS[bytes[i] & 0xf];
  }
  return out;
}

export function hexToBytes(hex: string): Bytes {
  const clean = hex.length % 2 === 0 ? hex : '0' + hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

// --- PEM ↔ DER ---

export function derToPem(der: Uint8Array, label: string): string {
  const b64 = bytesToBase64(der);
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

export function pemToDer(pem: string): Bytes {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return base64ToBytes(body);
}

export function pemLabel(pem: string): 'PUBLIC KEY' | 'PRIVATE KEY' | null {
  if (/BEGIN PUBLIC KEY/.test(pem)) return 'PUBLIC KEY';
  if (/BEGIN PRIVATE KEY/.test(pem)) return 'PRIVATE KEY';
  return null;
}

// 恒定时间比较：长度不同直接返回 false（长度不是秘密），逐字节异或累积差异。
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
