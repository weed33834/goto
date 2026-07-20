// 移动端 relay WebSocket 长连接 transport —— 与桌面端 relayTransport.ts 协议对齐。
// 管理 WS 长连接，承载 SyncSession 帧收发，断线指数退避重连（+jitter 防雪崩），
// 握手 ready 后补发离线 outbox。
// 认证用 ?token=<token> query（桌面端用 headers，RN WebSocket headers 非标准）。
// 心跳用活动检测（RN 无 ping/pong）：relay 每 30s 发 TCP ping，transport 监听 message
// 更新最后活动时间，超 90s 无活动判半开连接 → terminate + 重连。
// 帧发送：mode=0 握手帧 WS OPEN 即发不入 outbox；mode=1 加密帧需 OPEN && session.isReady()。

import { type SyncSession } from './syncSession';
import {
  FrameParser,
  encodeFrame,
  type ParsedFrame,
  type FrameMode,
} from './syncMessages';
import {
  type OutboxStore,
  createMemoryOutbox,
} from './outboxQueue';
import type { Bytes } from './bytes';

const DEFAULT_RECONNECT_BASE_MS = 1000;
const DEFAULT_RECONNECT_MAX_MS = 30000;
/** 活动检测阈值：3 倍 relay ping 间隔（90s）。超过此时间无任何 message 视为半开连接。 */
const ACTIVITY_TIMEOUT_MS = 90_000;
/** 活动检测检查周期：30s（与 relay ping 间隔对齐）。 */
const ACTIVITY_CHECK_INTERVAL_MS = 30_000;

/** WebSocket 工厂。生产用全局 WebSocket（RN 内置），测试注入 Node `ws`。 */
export type WebSocketFactory = (url: string) => WebSocketLike;

export interface WebSocketLike {
  readonly readyState: number;
  readonly OPEN: number;
  send(data: ArrayBuffer | ArrayBufferView | string): void;
  close(code?: number, reason?: string): void;
  terminate?(): void;
  // 事件回调（与浏览器/RN WebSocket 一致的 onXxx 风格）
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: ArrayBuffer | ArrayBufferView | string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
}

export interface RelayTransportOptions {
  url: string;
  token: string;
  role: 'initiator' | 'responder';
  createSession: () => SyncSession;
  onSession?: (session: SyncSession) => void;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  /** 对端设备 ID。配对场景下连接建立后才确定，故允许 getter。 */
  peerDeviceId?: string | (() => string | undefined);
  /** 离线发件箱存储。未提供时仅内存缓冲。 */
  outbox?: OutboxStore;
  /** WebSocket 工厂，测试注入。生产用全局 WebSocket。 */
  createWebSocket?: WebSocketFactory;
}

export class RelayTransport {
  private url: string;
  private token: string;
  private role: 'initiator' | 'responder';
  private createSession: () => SyncSession;
  private onSession?: (session: SyncSession) => void;
  private reconnectBaseMs: number;
  private reconnectMaxMs: number;
  private peerDeviceIdResolver: string | (() => string | undefined) | undefined;
  private outbox: OutboxStore;
  private createWebSocket: WebSocketFactory;

  private ws: WebSocketLike | null = null;
  private session: SyncSession | null = null;
  private parser: FrameParser;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivityAt = 0;
  private destroyed = false;
  private reconnectDelay: number;

  constructor(opts: RelayTransportOptions) {
    this.url = opts.url;
    this.token = opts.token;
    this.role = opts.role;
    this.createSession = opts.createSession;
    this.onSession = opts.onSession;
    this.reconnectBaseMs = opts.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
    this.reconnectMaxMs = opts.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
    this.reconnectDelay = this.reconnectBaseMs;
    this.peerDeviceIdResolver = opts.peerDeviceId;
    this.outbox = opts.outbox ?? createMemoryOutbox();
    this.createWebSocket =
      opts.createWebSocket ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
    this.parser = new FrameParser(this.onFrame, this.onParserError);
    this.connect();
  }

  private resolvePeerDeviceId(): string | undefined {
    if (!this.peerDeviceIdResolver) return undefined;
    return typeof this.peerDeviceIdResolver === 'function'
      ? this.peerDeviceIdResolver()
      : this.peerDeviceIdResolver;
  }

  /** 构造带 token query param 的认证 URL。 */
  private buildAuthUrl(baseUrl: string): string {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}token=${encodeURIComponent(this.token)}`;
  }

  private connect(): void {
    if (this.destroyed) return;
    // P0 资源泄漏修复:connect 被多次调用时(边缘场景:重连定时器竞态、外部主动重连),
    // 旧 ws 可能仍在 OPEN/CLOSING 状态。先终止旧 ws,避免连接泄漏 + 旧 ws 的事件
    // 回调污染新 session 状态。
    if (this.ws && this.ws.readyState !== 3 /* CLOSED */) {
      try {
        if (this.ws.terminate) this.ws.terminate();
        else this.ws.close();
      } catch {
        // 旧 ws 关闭失败不阻塞新连接
      }
    }
    if (this.session) {
      // 旧 session 也清掉(理论上 handleClose 已清,这里防御性)
      try {
        this.session.close();
      } catch {
        // 旧 session 关闭失败不阻塞新连接
      }
      this.session = null;
    }
    const authUrl = this.buildAuthUrl(this.url);
    let ws: WebSocketLike;
    try {
      ws = this.createWebSocket(authUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.lastActivityAt = Date.now();

    ws.onopen = () => this.handleOpen();
    ws.onmessage = (ev) => this.handleMessage(ev);
    ws.onerror = () => {
      // RN WebSocket onerror 无有用信息，仅记录。重连由 onclose 驱动。
    };
    ws.onclose = () => this.handleClose();
  }

  private handleOpen(): void {
    this.reconnectDelay = this.reconnectBaseMs;
    this.lastActivityAt = Date.now();
    // 防御:若旧 session 残留(理论上 connect 已清),先 close 避免泄漏
    if (this.session) {
      try {
        this.session.close();
      } catch {
        // 旧 session 关闭失败不阻塞新 session
      }
      this.session = null;
    }
    this.session = this.createSession();
    this.onSession?.(this.session);
    this.startActivityCheck();
    if (this.role === 'initiator') {
      // initiator 主动发起握手；responder 等对端 HELLO
      void this.session.begin().catch(() => {
        // begin 失败由 session 内部 onError 回调暴露，这里吞掉防 unhandled rejection
      });
    }
    // 握手前的加密帧对端无法解密，故 outbox 补发由调用方在 session onReady 回调里
    // 显式调 transport.flushOutbox()——transport 不自动监听 ready，保持与 session 解耦。
  }

  private handleMessage(ev: { data: ArrayBuffer | ArrayBufferView | string }): void {
    this.lastActivityAt = Date.now();
    let bytes: Uint8Array;
    const data = ev.data;
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data);
    } else if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else {
      // ArrayBufferView
      bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    this.parser.feed(bytes);
  }

  private onFrame = (frame: ParsedFrame): void => {
    // feedRawFrame 是异步的，但 transport 不 await（串行化由 session 内部保证）
    void this.session?.feedRawFrame(frame.mode, frame.payload);
  };

  private onParserError = (_err: Error): void => {
    this.terminateWs();
    this.scheduleReconnect();
  };

  /** 发送一帧（session onSendFrame 触发）。mode=0 直接发，mode=1 需 ready 否则入 outbox。 */
  sendFrame(mode: FrameMode, payload: Bytes): void {
    if (mode === 0) {
      if (this.ws && this.ws.readyState === this.ws.OPEN) {
        this.ws.send(encodeFrame(mode, payload));
      }
      return;
    }
    if (this.ws && this.ws.readyState === this.ws.OPEN && this.session?.isReady()) {
      this.ws.send(encodeFrame(mode, payload));
      return;
    }
    const peer = this.resolvePeerDeviceId();
    if (!peer) {
      // 握手未完成且对端身份未知，无法持久化，只能丢帧（重连时重新生成）
      return;
    }
    this.outbox.enqueue(peer, mode, payload);
  }

  /** 握手 ready 后调用，补发离线队列。 */
  flushOutbox(): void {
    const peer = this.resolvePeerDeviceId();
    if (!peer || !this.ws || this.ws.readyState !== this.ws.OPEN) return;

    this.outbox.trim(peer);
    const frames = this.outbox.peek(peer);
    const sentIds: number[] = [];
    for (const frame of frames) {
      if (this.ws.readyState !== this.ws.OPEN) break;
      this.ws.send(encodeFrame(frame.frameMode, frame.payload));
      sentIds.push(frame.id);
    }
    if (sentIds.length > 0) {
      this.outbox.clear(sentIds);
    }
  }

  private handleClose(): void {
    this.stopActivityCheck();
    if (this.session) {
      this.session.close();
      this.session = null;
    }
    // 重建 parser，避免旧 buffer 残留
    this.parser = new FrameParser(this.onFrame, this.onParserError);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    // 指数退避 + ±10% jitter，防移动网络雪崩
    const jitter = this.reconnectDelay * (Math.random() * 0.2 - 0.1);
    const delay = Math.max(0, Math.round(this.reconnectDelay + jitter));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.reconnectMaxMs);
  }

  /** 活动检测：每 30s 检查，距上次活动超 90s 判半开连接 → terminate → onclose 触发重连。 */
  private startActivityCheck(): void {
    this.stopActivityCheck();
    this.activityTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== this.ws.OPEN) return;
      const idle = Date.now() - this.lastActivityAt;
      if (idle > ACTIVITY_TIMEOUT_MS) {
        this.terminateWs();
        // terminate 会触发 onclose → handleClose → scheduleReconnect
      }
    }, ACTIVITY_CHECK_INTERVAL_MS);
  }

  private stopActivityCheck(): void {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  private terminateWs(): void {
    if (this.ws) {
      if (this.ws.terminate) {
        this.ws.terminate();
      } else {
        this.ws.close();
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.stopActivityCheck();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.terminateWs();
    this.ws = null;
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }
}
