import { describe, it, expect } from 'vitest';
import {
  utf8Encode,
  utf8Decode,
  concatBytes,
  bytesToBase64,
  base64ToBytes,
  bytesToHex,
  hexToBytes,
  derToPem,
  pemToDer,
  pemLabel,
  constantTimeEqual,
} from './bytes';

describe('bytes — UTF-8', () => {
  it('round-trips ASCII', () => {
    const s = 'hello world';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
  });

  it('round-trips multi-byte CJK', () => {
    const s = '同步加密任务流程';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
  });

  it('round-trips emoji', () => {
    const s = '🔒🚀✅';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
  });
});

describe('bytes — concat', () => {
  it('concatenates multiple Uint8Arrays', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3]);
    const c = new Uint8Array([4, 5, 6]);
    expect(Array.from(concatBytes([a, b, c]))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('handles empty array', () => {
    expect(concatBytes([]).length).toBe(0);
  });

  it('handles empty parts', () => {
    expect(Array.from(concatBytes([new Uint8Array([]), new Uint8Array([7])]))).toEqual([7]);
  });
});

describe('bytes — base64', () => {
  it('encodes and decodes empty', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToBytes('').length).toBe(0);
  });

  it('encodes and decodes 1 byte', () => {
    const b = new Uint8Array([255]);
    const encoded = bytesToBase64(b);
    expect(encoded).toBe('/w==');
    expect(Array.from(base64ToBytes(encoded))).toEqual([255]);
  });

  it('encodes and decodes 2 bytes', () => {
    const b = new Uint8Array([1, 2]);
    const encoded = bytesToBase64(b);
    expect(encoded).toBe('AQI=');
    expect(Array.from(base64ToBytes(encoded))).toEqual([1, 2]);
  });

  it('encodes and decodes 3 bytes (no padding)', () => {
    const b = new Uint8Array([1, 2, 3]);
    const encoded = bytesToBase64(b);
    expect(encoded).toBe('AQID');
    expect(Array.from(base64ToBytes(encoded))).toEqual([1, 2, 3]);
  });

  it('round-trips random 256 bytes', () => {
    const b = new Uint8Array(256);
    for (let i = 0; i < 256; i++) b[i] = i;
    const encoded = bytesToBase64(b);
    expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(b));
  });

  it('matches Node Buffer base64 output', () => {
    // 验证与 Node 的 Buffer.toString('base64') 完全一致
    const b = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    const nodeB64 = Buffer.from(b).toString('base64');
    expect(bytesToBase64(b)).toBe(nodeB64);
  });

  it('decodes base64 with whitespace/newlines (PEM body)', () => {
    const b = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = bytesToBase64(b);
    const withNewlines = encoded.match(/.{1,2}/g)!.join('\n');
    expect(Array.from(base64ToBytes(withNewlines))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('bytes — hex', () => {
  it('encodes lowercase', () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff');
  });

  it('round-trips', () => {
    const b = new Uint8Array([0, 1, 128, 255, 171, 205]);
    expect(Array.from(hexToBytes(bytesToHex(b)))).toEqual(Array.from(b));
  });
});

describe('bytes — PEM ↔ DER', () => {
  it('round-trips a public key PEM', () => {
    const der = new Uint8Array(44);
    for (let i = 0; i < 44; i++) der[i] = i + 1;
    const pem = derToPem(der, 'PUBLIC KEY');
    expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(pem).toContain('-----END PUBLIC KEY-----');
    expect(Array.from(pemToDer(pem))).toEqual(Array.from(der));
  });

  it('round-trips a private key PEM', () => {
    const der = new Uint8Array(48);
    for (let i = 0; i < 48; i++) der[i] = 200 - i;
    const pem = derToPem(der, 'PRIVATE KEY');
    expect(pemLabel(pem)).toBe('PRIVATE KEY');
    expect(Array.from(pemToDer(pem))).toEqual(Array.from(der));
  });

  it('pemLabel returns null for non-PEM', () => {
    expect(pemLabel('not a pem')).toBeNull();
  });
});

describe('bytes — constantTimeEqual', () => {
  it('returns true for identical bytes', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it('returns false for different bytes', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it('returns true for empty arrays', () => {
    expect(constantTimeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});
