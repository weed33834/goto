import { randomBytes, randomInt } from 'crypto';

export function buildAuthMessage(
  deviceId: string,
  timestamp: number,
  purpose: string
): Buffer {
  return Buffer.from(`${deviceId}:${timestamp}:${purpose}`, 'utf8');
}

export function generatePairingCode(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, '0');
}

export function generateAuthToken(): string {
  return randomBytes(32).toString('base64url');
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
