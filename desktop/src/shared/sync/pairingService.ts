// 移动端配对流程编排 —— 与桌面端 pairingService.ts 协议字节一致，可跨平台直连。
// 三个入口：generatePairingCode（发起方创建码）/ respondToPairing（响应方等待连接并
// 发 SMK）/ claimPairingCodeAndPair（认领方接收 SMK）。全异步（Web Crypto + fetch），
// SMK 走 secureStorage，token 走 AsyncTokenStorage，SyncSession 为回调式非 EventEmitter。

import { RelayClient } from './relayClient';
import { type DeviceIdentity } from './syncIdentity';
import { SyncSession } from './syncSession';
import { RelayTransport, type WebSocketFactory } from './relayTransport';
import {
  encryptSessionMessage,
  decryptSessionMessage,
} from './syncCrypto';
import {
  loadSyncMasterKey,
  saveSyncMasterKey,
} from './syncStorage';
import { bytesToBase64, base64ToBytes } from './bytes';
import type { Bytes } from './bytes';
import {
  secureGet,
  secureSet,
  secureDelete,
} from '../utils/secureStorage';

// WebSocketFactory 透出给上层（useSyncRuntime / 测试）用于注入 mock WS。
export type { WebSocketFactory };

// 公共类型

export interface PairingCodeResult {
  code: string;
  /** 配对码过期时间戳（ms）。relay 默认 5 分钟。 */
  expiresAt: number;
}

/**
 * relay bearer token 异步存储抽象。
 *
 * 桌面端 TokenStorage 是同步的（基于 electron-store / fs）；移动端 secureStorage 是
 * 异步的（Keychain/Keystore 落盘），故这里把接口异步化。
 *
 * 默认实现 `createSecureTokenStorage` 用 secureStorage（推荐，符合 OWASP）。
 * 测试可注入内存 mock。
 */
export interface AsyncTokenStorage {
  get(): Promise<string | undefined>;
  set(value: string): Promise<void>;
  clear(): Promise<void>;
}

export interface PairingResult {
  /** 刚配对成功的对端 deviceId。 */
  peerDeviceId: string;
  /** 对端可读名称，配对完成后写入 pairedDevices。 */
  peerName: string;
  /** 对端公钥 PEM，用于后续握手验证。 */
  peerPublicKeyPem: string;
}

export interface PairingOptions {
  /** WebSocket 工厂，测试注入。生产用全局 WebSocket。 */
  createWebSocket?: WebSocketFactory;
  /** token 存储实现。默认 secureStorage。 */
  tokenStorage?: AsyncTokenStorage;
  /** 配对超时毫秒。默认 120s。 */
  timeoutMs?: number;
  /** 设备名解析器：根据对端 deviceId 派生可读名（如 `Device-abcd`）。 */
  resolvePeerName?: (deviceId: string) => string;
}

const PAIRING_TIMEOUT_MS = 120_000;

const RELAY_TOKEN_SECURE_KEY = 'relay_bearer_token';

// 默认 token 存储（基于 secureStorage）

/**
 * 基于 secureStorage 的 token 存储。
 *
 * 把 relay bearer token 放进 Keychain/Keystore，避免落入 AsyncStorage 明文。
 * token 有 24h TTL 且会随 refresh 自动轮转，落盘风险可控。
 */
export function createSecureTokenStorage(): AsyncTokenStorage {
  return {
    async get() {
      const v = await secureGet(RELAY_TOKEN_SECURE_KEY);
      return v ?? undefined;
    },
    async set(value: string) {
      await secureSet(RELAY_TOKEN_SECURE_KEY, value);
    },
    async clear() {
      await secureDelete(RELAY_TOKEN_SECURE_KEY);
    },
  };
}

// URL 工具

/**
 * 在 WS URL 上追加 pairingCode 参数。
 * 与桌面端 appendPairingCodeToUrl 字节一致：避免 `?` / `&` 重复。
 */
function appendPairingCodeToUrl(wsUrl: string, pairingCode: string): string {
  const separator = wsUrl.includes('?') ? '&' : '?';
  return `${wsUrl}${separator}pairingCode=${encodeURIComponent(pairingCode)}`;
}

/**
 * 在 WS URL 上追加 pairingCode + target 参数。
 * 与桌面端 appendPairingParamsToUrl 字节一致。
 */
function appendPairingParamsToUrl(
  wsUrl: string,
  pairingCode: string,
  targetDeviceId: string,
): string {
  const separator = wsUrl.includes('?') ? '&' : '?';
  return `${wsUrl}${separator}pairingCode=${encodeURIComponent(pairingCode)}&target=${encodeURIComponent(targetDeviceId)}`;
}

/**
 * 把 relay 的 HTTP 根 URL 转成 WebSocket URL。
 *
 * 与桌面端 relayHttpUrlToWsUrl 字节一致：
 *   - https → wss，http → ws
 *   - 若 pathname 为 '/' 则替换为 '/sync'（relay 服务端在 /sync 路径监听 WS）
 *   - 保留 query string 与 hash（桌面端用 new URL().toString() 自然保留）
 *
 * 显式传 pathname 的 URL（如 `https://relay/sync` 或 `https://relay/custom`）保持原样。
 * 这层映射不依赖 registerDevice 返回的 wsUrl，让 UI 层无需先注册即可推导出 WS 地址。
 */
export function relayHttpUrlToWsUrl(httpUrl: string): string {
  if (!httpUrl) return httpUrl;
  // 手写解析避免引入 URL polyfill 依赖（RN 的 URL 在某些版本对 ws: 支持不完整）
  const match = /^(\w+:)\/\/([^/]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/.exec(httpUrl);
  if (!match) return httpUrl;
  const [, scheme, host, pathname, search, hash] = match;
  const wsScheme = scheme === 'https:' ? 'wss:' : scheme === 'http:' ? 'ws:' : scheme;
  const wsPath = !pathname || pathname === '/' ? '/sync' : pathname;
  return `${wsScheme}//${host}${wsPath}${search ?? ''}${hash ?? ''}`;
}

// 1. generatePairingCode（主动发起方：创建配对码）

/**
 * 在 relay 创建一个 8 位配对码。
 *
 * 首次调用时若本机没有 relay bearer token，会先调 /register-device 注册设备并落盘
 * token；后续调用复用 token。token 失效（401）时按 refresh → 再注册的顺序恢复一次。
 *
 * @param relayUrl  relay HTTP 根 URL，如 `https://relay.example.com`
 * @param identity  本机 Ed25519 设备身份
 * @param tokenStorage  bearer token 存储，默认 secureStorage
 */
export async function generatePairingCode(
  relayUrl: string,
  identity: DeviceIdentity,
  tokenStorage: AsyncTokenStorage = createSecureTokenStorage(),
): Promise<PairingCodeResult> {
  const client = new RelayClient(relayUrl);
  let token = await tokenStorage.get();

  async function ensureToken(): Promise<string> {
    if (token) return token;
    const result = await client.registerDevice(identity);
    token = result.token;
    await tokenStorage.set(token);
    return token;
  }

  try {
    return await client.createPairingCode(identity, await ensureToken());
  } catch (err) {
    if (RelayClient.isUnauthorizedError(err) && token) {
      // token 可能已过期：先尝试 refresh，失败则重新注册
      try {
        const refreshed = await client.refreshToken(identity, token);
        token = refreshed;
        await tokenStorage.set(token);
        return await client.createPairingCode(identity, token);
      } catch {
        token = undefined;
        await tokenStorage.clear();
        return await client.createPairingCode(identity, await ensureToken());
      }
    }
    throw err;
  }
}

// 2. respondToPairing（被动响应方：展示码并等待连接，握手后发送 SMK）

/**
 * 配对响应方：本机已生成配对码并展示给对端，建立 WS 监听，对端连接后握手。
 * 握手 ready 后立即用会话 sendKey 加密本机 SMK，发送 SMK_TRANSFER 给对端。
 *
 * 响应方角色：
 *   - WS role = 'responder'（不主动 begin，等对端 HELLO）
 *   - SyncSession.isInitiator = false（按 responder 路径走 OFFER→ANSWER）
 *   - 握手 ready 后是 SMK 的「发送方」——把本机 SMK 发给对端
 *
 * 本机必须已有 SMK（首次配对时应先生成）。无 SMK 时抛错。
 *
 * @param wsUrl  relay WebSocket 根 URL（不含 query）
 * @param token  relay bearer token
 * @param pairingCode  本机生成的 8 位配对码
 * @param identity  本机设备身份
 * @param onPaired  配对成功回调：上层据此把对端写入 pairedDevices 并切换 syncProtocol
 * @param options  可选：超时 / WebSocket 工厂 / 设备名解析器
 */
export function respondToPairing(
  wsUrl: string,
  token: string,
  pairingCode: string,
  identity: DeviceIdentity,
  onPaired: (peer: PairingResult) => void,
  options?: PairingOptions,
): Promise<PairingResult> {
  const timeoutMs = options?.timeoutMs ?? PAIRING_TIMEOUT_MS;
  const resolvePeerName = options?.resolvePeerName ?? defaultResolvePeerName;

  return new Promise<PairingResult>((resolve, reject) => {
    let settled = false;
    let transport: RelayTransport | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    // RelayTransport 通过 onSession 回调把内部 new 出来的 SyncSession 引用回传给
    // 调用方。后续 onReady / onMessage 闭包通过它访问 getSendKey / getPeerIdentity。
    // 重连时 transport 会再调 createSession + onSession，引用自动更新。
    let session: SyncSession | null = null;

    const finish = (result: PairingResult | undefined, error: unknown) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (transport) {
        transport.destroy();
        transport = null;
      }
      if (result !== undefined) {
        onPaired(result);
        resolve(result);
      } else {
        reject(error);
      }
    };

    timeoutHandle = setTimeout(() => {
      finish(undefined, new Error('pairing response timed out'));
    }, timeoutMs);

    transport = new RelayTransport({
      url: appendPairingCodeToUrl(wsUrl, pairingCode),
      token,
      role: 'responder',
      createWebSocket: options?.createWebSocket,
      onSession: (s) => {
        session = s;
      },
      createSession: () =>
        new SyncSession(
          {
            identity,
            isInitiator: false,
            isPairing: true,
            getTrustedPublicKey: () => undefined,
          },
          {
            onSendFrame: (mode, payload) => {
              transport?.sendFrame(mode, payload);
            },
            onReady: () => {
              // 握手就绪：补发 outbox（如果有），并发送 SMK_TRANSFER
              transport?.flushOutbox();
              void sendSmkAndFinalize();
            },
            onMessage: () => {
              // 配对阶段响应方不处理数据消息，仅 SMK_TRANSFER 由发起方接收
            },
            onError: (err) => {
              finish(undefined, err);
            },
            onClose: () => {
              // 配对未完成时连接关闭：触发超时路径
              if (!settled) {
                finish(undefined, new Error('pairing connection closed before completion'));
              }
            },
          },
        ),
    });

    async function sendSmkAndFinalize(): Promise<void> {
      try {
        const smk = await loadSyncMasterKey();
        if (!smk) {
          throw new Error('sync master key not found; generate SMK before responding to pairing');
        }
        if (!session) {
          throw new Error('session missing on ready');
        }
        const sendKey = session.getSendKey();
        if (!sendKey) {
          throw new Error('session sendKey not ready');
        }
        const encrypted = await encryptSessionMessage(smk, sendKey);
        await session.send({ type: 'SMK_TRANSFER', encryptedSmk: bytesToBase64(encrypted) });

        const peer = session.getPeerIdentity();
        if (!peer) {
          throw new Error('peer identity missing after handshake');
        }
        finish({
          peerDeviceId: peer.deviceId,
          peerName: resolvePeerName(peer.deviceId),
          peerPublicKeyPem: peer.publicKey,
        }, undefined);
      } catch (err) {
        finish(undefined, err);
      }
    }
  });
}

// 3. claimPairingCodeAndPair（主动认领方：用对端提供的 code 建立连接并接收 SMK）

/**
 * 配对认领方：用户在对端设备上输入配对码，本机用此 code 调 relay claim 接口
 * 完成认证，建立 WS 连接，握手后接收对端的 SMK_TRANSFER，解密落盘为本机 SMK。
 *
 * 认领方角色：
 *   - WS role = 'initiator'（握手 begin 由 transport 在 WS OPEN 时触发）
 *   - SyncSession.isInitiator = true（按 initiator 路径走 HELLO→OFFER→ANSWER）
 *   - 握手 ready 后是 SMK 的「接收方」——解密 SMK_TRANSFER 落盘
 *
 * 如果本机已有 SMK（已配过其他设备）：保留现有 SMK，但验证对端 SMK 与本地一致
 * （防止对端配对到错误的群组）。不一致时拒绝配对并抛错。
 *
 * @param relayUrl  relay HTTP 根 URL（用于调 claim 接口）
 * @param identity  本机设备身份
 * @param code  对端展示的 8 位配对码
 * @param onPaired  配对成功回调
 * @param options  token 存储等
 */
export async function claimPairingCodeAndPair(
  relayUrl: string,
  identity: DeviceIdentity,
  code: string,
  onPaired: (peer: PairingResult) => void,
  options?: PairingOptions,
): Promise<PairingResult> {
  const client = new RelayClient(relayUrl);
  const tokenStorage = options?.tokenStorage ?? createSecureTokenStorage();
  const timeoutMs = options?.timeoutMs ?? PAIRING_TIMEOUT_MS;
  const resolvePeerName = options?.resolvePeerName ?? defaultResolvePeerName;

  // 1. claim 配对码：relay 校验 code 有效后，返回本机 token + pairedDeviceId + wsUrl
  const claim = await client.claimPairingCode(identity, code);
  const token = claim.token;
  await tokenStorage.set(token);

  const pairedDeviceId = claim.pairedDeviceId;
  if (!pairedDeviceId) {
    throw new Error('claim-pairing-code response missing paired device id');
  }

  // 2. 建立 WS 连接，握手 ready 后等对端的 SMK_TRANSFER
  return new Promise<PairingResult>((resolve, reject) => {
    let settled = false;
    let transport: RelayTransport | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let session: SyncSession | null = null;

    const finish = (result: PairingResult | undefined, error: unknown) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (transport) {
        transport.destroy();
        transport = null;
      }
      if (result !== undefined) {
        onPaired(result);
        resolve(result);
      } else {
        reject(error);
      }
    };

    timeoutHandle = setTimeout(() => {
      finish(undefined, new Error('pairing claim timed out'));
    }, timeoutMs);

    transport = new RelayTransport({
      url: appendPairingParamsToUrl(claim.wsUrl, code, pairedDeviceId),
      token,
      role: 'initiator',
      createWebSocket: options?.createWebSocket,
      peerDeviceId: pairedDeviceId,
      onSession: (s) => {
        session = s;
      },
      createSession: () =>
        new SyncSession(
          {
            identity,
            isInitiator: true,
            isPairing: true,
            getTrustedPublicKey: () => undefined,
          },
          {
            onSendFrame: (mode, payload) => {
              transport?.sendFrame(mode, payload);
            },
            onReady: () => {
              // initiator ready：补发 outbox（如果有），等对端 SMK_TRANSFER
              transport?.flushOutbox();
            },
            onMessage: (msg) => {
              if (msg.type !== 'SMK_TRANSFER') return;
              void receiveSmkAndFinalize(msg.encryptedSmk);
            },
            onError: (err) => {
              finish(undefined, err);
            },
            onClose: () => {
              if (!settled) {
                finish(undefined, new Error('pairing connection closed before SMK received'));
              }
            },
          },
        ),
    });

    async function receiveSmkAndFinalize(encryptedSmkB64: string): Promise<void> {
      try {
        if (!session) {
          throw new Error('session missing on SMK transfer');
        }
        const receiveKey = session.getReceiveKey();
        if (!receiveKey) {
          throw new Error('session receiveKey not ready');
        }
        const encryptedSmk = base64ToBytes(encryptedSmkB64);
        const smk = await decryptSessionMessage(encryptedSmk, receiveKey);
        if (smk.length !== 32) {
          throw new Error(`invalid SMK length: expected 32 bytes, got ${smk.length}`);
        }

        // 若本机已有 SMK，验证一致性；不一致拒绝配对，防止串到错误群组
        const existing = await loadSyncMasterKey();
        if (existing && !bytesEqual(existing, smk)) {
          throw new Error('local SMK already exists and does not match the received SMK; refusing to overwrite');
        }
        if (!existing) {
          await saveSyncMasterKey(smk as Bytes);
        }

        const peer = session.getPeerIdentity();
        if (!peer) {
          throw new Error('peer identity missing after handshake');
        }
        finish({
          peerDeviceId: peer.deviceId,
          peerName: resolvePeerName(peer.deviceId),
          peerPublicKeyPem: peer.publicKey,
        }, undefined);
      } catch (err) {
        finish(undefined, err);
      }
    }
  });
}

// 默认设备名解析器

function defaultResolvePeerName(deviceId: string): string {
  // 取 deviceId 前 4 字符，避免暴露完整指纹；与桌面端命名规则一致
  return `Device-${deviceId.slice(0, 4)}`;
}

// 恒定时间字节比较
//
// SMK 一致性校验需要避免时序侧信道：直接 `a === b` 走逐字节短路比较会泄露
// 前缀匹配长度。恒定时间比较无短路，与 bytes.ts 的 constantTimeEqual 行为一致。
// 这里不引入 bytes.ts 的依赖（避免循环），内联一份。

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
