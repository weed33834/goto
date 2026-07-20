// 移动端 relay HTTP 客户端 —— 与桌面端 relayClient.ts、relay 服务端 routes.ts 契约对齐。
// 四端点：POST /register-device（无认证）/ /pairing-codes（Bearer）/ /claim-pairing-code
// （code 自证）/ /refresh-token（Bearer，旧 token 立即吊销）。签名用 syncIdentity.signMessage
// (Ed25519)，认证消息由 relayAuth.buildAuthMessage 构造，与 relay 服务端 auth.ts 字节一致。

import { type DeviceIdentity, signMessage } from './syncIdentity';
import { buildAuthMessage } from './relayAuth';
import { bytesToBase64 } from './bytes';

export interface RelayRegisterResult {
  deviceId: string;
  token: string;
  /** 该设备后续建立 WS 长连接的 URL。 */
  wsUrl: string;
  /** 仅 claim-pairing-code 响应里有，标识对端设备。 */
  pairedDeviceId?: string;
}

export interface RelayPairingCodeResult {
  code: string;
  /** 毫秒时间戳，配对码过期时间。 */
  expiresAt: number;
}

export class RelayClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /** 公共签名 POST 请求：构造 timestamp + 签名 + fetch，返回 Response。 */
  private async signedRequest(
    path: string,
    identity: DeviceIdentity,
    action: string,
    body: Record<string, unknown>,
    token?: string,
  ): Promise<Response> {
    const timestamp = Math.floor(Date.now() / 1000);
    const message = buildAuthMessage(identity.deviceId, timestamp, action);
    const signature = bytesToBase64(await signMessage(message, identity.privateKeyPem));
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, timestamp, signature }),
    });
    if (!res.ok) {
      throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
    }
    return res;
  }

  async registerDevice(identity: DeviceIdentity): Promise<RelayRegisterResult> {
    const res = await this.signedRequest('/register-device', identity, 'register', {
      deviceId: identity.deviceId,
      publicKey: identity.publicKeyPem,
    });
    return res.json() as Promise<RelayRegisterResult>;
  }

  async createPairingCode(identity: DeviceIdentity, token: string): Promise<RelayPairingCodeResult> {
    const res = await this.signedRequest('/pairing-codes', identity, 'pairing-code', {}, token);
    return res.json() as Promise<RelayPairingCodeResult>;
  }

  async claimPairingCode(identity: DeviceIdentity, code: string): Promise<RelayRegisterResult> {
    const res = await this.signedRequest('/claim-pairing-code', identity, 'claim-pairing-code:' + code, {
      code,
      deviceId: identity.deviceId,
      publicKey: identity.publicKeyPem,
    });
    return res.json() as Promise<RelayRegisterResult>;
  }

  async refreshToken(identity: DeviceIdentity, token: string): Promise<string> {
    const res = await this.signedRequest('/refresh-token', identity, 'refresh-token', {}, token);
    const body = (await res.json()) as { token?: unknown };
    if (typeof body.token !== 'string') {
      throw new Error('refresh-token response missing token');
    }
    return body.token;
  }

  static isUnauthorizedError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    // P1 修复:精确匹配 HTTP 401 状态码,避免字符串子串误判。
    //
    // signedRequest 抛出的错误格式为:
    //   `${path} failed: ${res.status} ${await res.text()}`
    // 例如 "/pairing-codes failed: 401 Unauthorized"。
    //
    // 原 bug 用 `message.includes('401')`,会误判以下情况为 401:
    // - 500 错误体包含 "line 401 of script" 之类文本
    // - 404 错误体包含 "page 40123 not found"
    // - 任何 4xx/5xx 响应体碰巧含 "401" 子串
    // → 上层会误以为 token 过期而触发刷新,但实际是其他错误,刷了也没用。
    //
    // 修复:用 `\b` 词边界精确匹配 "failed: 401" 模式。
    // `failed:\s*401\b` 要求 401 后是非词字符(空格/换行/字符串末尾),
    // "40123" / "401abc" 都不会匹配。
    return /failed:\s*401\b/.test(error.message);
  }
}
