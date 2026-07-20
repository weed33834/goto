import { generateAuthToken, generatePairingCode } from './auth';

export const MAX_FRAME_SIZE = Number(process.env.MAX_FRAME_SIZE ?? 8 * 1024 * 1024);
const QUEUE_TTL_MS = Number(process.env.QUEUE_TTL_MS ?? 7 * 24 * 60 * 60 * 1000);
const TOKEN_TTL_MS = Number(process.env.TOKEN_TTL_MS ?? 24 * 60 * 60 * 1000);
const CODE_TTL_MS = Number(process.env.CODE_TTL_MS ?? 5 * 60 * 1000);
const MAX_QUEUE_BYTES_PER_PEER = Number(
  process.env.MAX_QUEUE_BYTES_PER_PEER ?? 64 * 1024 * 1024
);
const MAX_QUEUE_FRAMES_PER_PEER = Number(process.env.MAX_QUEUE_FRAMES_PER_PEER ?? 10_000);
const PAIRING_RATE_LIMIT_MS = Number(process.env.PAIRING_RATE_LIMIT_MS ?? 10_000);
const MAX_CODE_ATTEMPTS = Number(process.env.MAX_CODE_ATTEMPTS ?? 5);

// Device 在 store 内无法访问 connections，因此用 lastSeenAt 兜底：
// 超过 DEVICE_TTL_MS 未活跃的 device 会被 cleanup 删除。
const DEVICE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Device {
  deviceId: string;
  publicKey: string;
  registeredAt: number;
  lastSeenAt: number;
}

export interface AuthToken {
  deviceId: string;
  expiresAt: number;
}

export interface PairingCode {
  createdByDeviceId: string;
  expiresAt: number;
  used: boolean;
  attempts: number;
}

export interface QueuedFrame {
  senderDeviceId: string;
  payload: Buffer;
  createdAt: number;
}

export class RelayStore {
  devices = new Map<string, Device>();
  tokens = new Map<string, AuthToken>();
  codes = new Map<string, PairingCode>();
  queues = new Map<string, QueuedFrame[]>();
  // 与 queues 同步维护的每队列字节数缓存，避免 enqueueFrame 每次 O(n) 重算
  queueBytesCache = new Map<string, number>();
  lastPairingRequest = new Map<string, number>();

  registerDevice(deviceId: string, publicKey: string): void {
    const existing = this.devices.get(deviceId);
    const now = Date.now();
    this.devices.set(deviceId, {
      deviceId,
      publicKey,
      registeredAt: existing?.registeredAt ?? now,
      lastSeenAt: now,
    });
  }

  getDevice(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }

  createToken(deviceId: string): string {
    const token = generateAuthToken();
    this.tokens.set(token, {
      deviceId,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });
    return token;
  }

  validateToken(token: string): string | undefined {
    const record = this.tokens.get(token);
    if (!record) return undefined;
    if (record.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return undefined;
    }
    // 刷新 device 活跃时间，用于 cleanup 时判断是否可回收
    const device = this.devices.get(record.deviceId);
    if (device) {
      device.lastSeenAt = Date.now();
    }
    return record.deviceId;
  }

  revokeToken(token: string): void {
    this.tokens.delete(token);
  }

  canCreatePairingCode(deviceId: string): boolean {
    const last = this.lastPairingRequest.get(deviceId) ?? 0;
    if (Date.now() - last < PAIRING_RATE_LIMIT_MS) return false;
    for (const code of this.codes.values()) {
      if (code.createdByDeviceId === deviceId && !code.used && code.expiresAt > Date.now()) {
        return false;
      }
    }
    return true;
  }

  createPairingCode(createdByDeviceId: string): string {
    this.lastPairingRequest.set(createdByDeviceId, Date.now());
    const code = generatePairingCode();
    this.codes.set(code, {
      createdByDeviceId,
      expiresAt: Date.now() + CODE_TTL_MS,
      used: false,
      attempts: 0,
    });
    return code;
  }

  consumePairingCode(code: string, claimantDeviceId: string): string | undefined {
    const record = this.codes.get(code);
    if (!record) return undefined;
    // 防止设备消费自己创建的配对码（self-claim），无意义且可能用于探测
    if (claimantDeviceId === record.createdByDeviceId) return undefined;
    if (record.used || record.expiresAt < Date.now()) {
      this.codes.delete(code);
      return undefined;
    }
    record.attempts += 1;
    if (record.attempts > MAX_CODE_ATTEMPTS) {
      this.codes.delete(code);
      return undefined;
    }
    record.used = true;
    return record.createdByDeviceId;
  }

  /**
   * 验证配对码是否可用于 WebSocket 握手。
   * 检查：存在、未过期、未超过最大尝试次数。
   * 注意：不检查 used 标志——joiner 在 HTTP claim（标记 used=true）后才用同一 code
   * 建立 WebSocket，此时 used 为 true 是正常的。单次消费语义由 consumePairingCode 保证。
   * 每次调用都会增加 attempts 计数，超过 MAX_CODE_ATTEMPTS 后失效，防止穷举攻击。
   */
  validatePairingCodeForWs(code: string): boolean {
    const record = this.codes.get(code);
    if (!record) return false;
    if (record.expiresAt < Date.now()) {
      this.codes.delete(code);
      return false;
    }
    record.attempts += 1;
    if (record.attempts > MAX_CODE_ATTEMPTS) {
      this.codes.delete(code);
      return false;
    }
    return true;
  }

  enqueueFrame(recipientDeviceId: string, senderDeviceId: string, payload: Buffer): void {
    const key = `${recipientDeviceId}:${senderDeviceId}`;
    const queue = this.queues.get(key) ?? [];
    // 用增量维护的字节计数替代每次 O(n) 的 reduce，避免大队列下的 O(n²) 累积开销
    let queueBytes = this.queueBytesCache.get(key) ?? 0;
    while (
      queue.length > 0 &&
      (queue.length >= MAX_QUEUE_FRAMES_PER_PEER ||
        queueBytes + payload.length > MAX_QUEUE_BYTES_PER_PEER)
    ) {
      const dropped = queue.shift()!;
      queueBytes -= dropped.payload.length;
    }
    queue.push({ senderDeviceId, payload, createdAt: Date.now() });
    queueBytes += payload.length;
    this.queues.set(key, queue);
    this.queueBytesCache.set(key, queueBytes);
  }

  dequeueFrames(recipientDeviceId: string, senderDeviceId: string): QueuedFrame[] {
    const key = `${recipientDeviceId}:${senderDeviceId}`;
    const queue = this.queues.get(key);
    if (!queue) return [];
    this.queues.delete(key);
    this.queueBytesCache.delete(key);
    return queue;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [token, record] of this.tokens) {
      if (record.expiresAt < now) this.tokens.delete(token);
    }
    for (const [code, record] of this.codes) {
      if (record.used || record.expiresAt < now) this.codes.delete(code);
    }
    for (const [key, queue] of this.queues) {
      const filtered = queue.filter((f) => now - f.createdAt < QUEUE_TTL_MS);
      if (filtered.length === 0) {
        this.queues.delete(key);
        this.queueBytesCache.delete(key);
      } else {
        this.queues.set(key, filtered);
        this.queueBytesCache.set(
          key,
          filtered.reduce((sum, f) => sum + f.payload.length, 0)
        );
      }
    }
    for (const [deviceId, lastRequest] of this.lastPairingRequest) {
      if (now - lastRequest > CODE_TTL_MS) {
        this.lastPairingRequest.delete(deviceId);
      }
    }
    // 回收长期无活跃的 device（lastSeenAt 兜底，store 无法访问 connections）
    for (const [deviceId, device] of this.devices) {
      if (now - device.lastSeenAt > DEVICE_TTL_MS) {
        this.devices.delete(deviceId);
      }
    }
  }
}
