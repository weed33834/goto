// 移动端 E2EE 同步会话 —— 与桌面端 syncSession.ts 协议字节一致，可跨平台直连。
// HELLO → OFFER → ANSWER 三步握手（ECDH + Ed25519 签名防 MITM），握手完成后用
// 会话密钥 AES-256-GCM 加密数据消息，每条携带 8 字节序列号 + 滑动窗口防重放。
// 全异步（Web Crypto），回调式（替代 EventEmitter），串行化 feedRawFrame 保证状态机一致。

import {
  type DeviceIdentity,
  signMessage,
  verifySignature,
  getDeviceFingerprint,
  buildSignedData,
} from './syncIdentity';
import {
  generateEcdhKeyPair,
  computeSharedSecret,
  deriveSessionKeys,
  encryptSessionMessage,
  decryptSessionMessage,
  type EcdhKeyPair,
} from './syncCrypto';
import {
  type SyncMessage,
  type HelloMessage,
  type OfferMessage,
  type AnswerMessage,
  serializeMessage,
  deserializeMessage,
  type FrameMode,
} from './syncMessages';
import { concatBytes, utf8Encode, bytesToBase64, base64ToBytes, randomBytes } from './bytes';
import { sha256Bytes } from './hashUtils';
import type { Bytes } from './bytes';

export interface SyncSessionCallbacks {
  /** session 请求发送一帧（transport 监听并发到 WS）。同步回调。 */
  onSendFrame: (mode: FrameMode, payload: Bytes) => void;
  /** 握手完成，可开始收发加密消息。 */
  onReady: () => void;
  /** 收到一条解密后的同步消息。 */
  onMessage: (msg: SyncMessage) => void;
  /** 任何异常（握手失败、验签失败、解密失败、超时）。 */
  onError: (err: Error) => void;
  /** 会话结束（主动 close 或握手超时）。 */
  onClose: () => void;
}

export interface SyncSessionOptions {
  identity: DeviceIdentity;
  isInitiator: boolean;
  /** 配对场景下跳过 trusted key 校验（对端尚未登记）。仍校验 deviceId == fingerprint。 */
  isPairing?: boolean;
  /** 非配对场景下根据 deviceId 查 trusted public key，用于握手校验。 */
  getTrustedPublicKey: (deviceId: string) => string | undefined;
  /** 重放保护滑动窗口大小。0 关闭（仅测试）。默认 64。 */
  replayWindow?: number;
  /** 握手超时毫秒。从 begin() 或收到首个 HELLO 开始计时。默认 30s。 */
  handshakeTimeoutMs?: number;
  /** 定时器工厂，默认 setTimeout。测试可注入假时钟。 */
  scheduleTimer?: (fn: () => void, ms: number) => { clear: () => void };
}

type SessionState =
  | 'idle'
  | 'hello_sent'
  | 'hello_received'
  | 'offered'
  | 'ready'
  | 'closed';

const DEFAULT_REPLAY_WINDOW = 64;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 30_000;
const SEQUENCE_BYTES = 8;

export class SyncSession {
  private identity: DeviceIdentity;
  private readonly isInitiator: boolean;
  private readonly isPairing: boolean;
  private readonly getTrustedPublicKey: (deviceId: string) => string | undefined;
  private readonly callbacks: SyncSessionCallbacks;
  private state: SessionState = 'idle';
  private nonce: string;
  private peerDeviceId: string | null = null;
  private peerPublicKey: string | null = null;
  private peerNonce: string | null = null;
  private ecdhKeyPair: EcdhKeyPair | null = null;
  private sendKey: Bytes | null = null;
  private receiveKey: Bytes | null = null;
  private readonly replayWindow: number;
  private sendSequence = 0n;
  private maxReceivedSeq = -1n;
  private receivedSeqs = new Set<bigint>();
  private readonly handshakeTimeoutMs: number;
  private readonly scheduleTimer: (fn: () => void, ms: number) => { clear: () => void };
  private handshakeTimer: { clear: () => void } | null = null;
  /** 串行化 feedRawFrame 的异步处理，防止状态机并发转换。 */
  private processingChain: Promise<void> = Promise.resolve();
  /** 追加的 ready 监听器（once）。transport 用它在握手就绪后自动 flushOutbox。 */
  private readyListeners: Array<() => void> = [];

  constructor(opts: SyncSessionOptions, callbacks: SyncSessionCallbacks) {
    this.identity = opts.identity;
    this.isInitiator = opts.isInitiator;
    this.isPairing = opts.isPairing ?? false;
    this.getTrustedPublicKey = opts.getTrustedPublicKey;
    this.callbacks = callbacks;
    this.replayWindow = opts.replayWindow ?? DEFAULT_REPLAY_WINDOW;
    this.handshakeTimeoutMs = opts.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    this.scheduleTimer =
      opts.scheduleTimer ??
      ((fn, ms) => {
        const id = setTimeout(fn, ms);
        return { clear: () => clearTimeout(id) };
      });
    this.nonce = bytesToBase64(randomBytes(16));
  }

  getNonce(): string {
    return this.nonce;
  }

  isReady(): boolean {
    return this.state === 'ready';
  }

  getSendKey(): Bytes | null {
    return this.sendKey;
  }

  getReceiveKey(): Bytes | null {
    return this.receiveKey;
  }

  getPeerIdentity(): { deviceId: string; publicKey: string } | null {
    if (!this.peerDeviceId || !this.peerPublicKey) return null;
    return { deviceId: this.peerDeviceId, publicKey: this.peerPublicKey };
  }

  /** 追加一次性 ready 监听。若已 ready，立即调用。transport 用它自动 flushOutbox。 */
  onceReady(cb: () => void): void {
    if (this.state === 'ready') {
      cb();
      return;
    }
    this.readyListeners.push(cb);
  }

  /** Initiator 发起握手：发送 HELLO。 */
  async begin(): Promise<void> {
    if (!this.isInitiator) {
      throw new Error('Only the initiator can begin the handshake');
    }
    if (this.state !== 'idle') {
      throw new Error('Handshake already started');
    }
    this.state = 'hello_sent';
    this.startHandshakeTimer();
    this.emitHandshake(this.createHello());
  }

  /**
   * 喂入一帧原始字节。内部串行化异步处理，调用方无需 await（错误经 onError 回调）。
   * 返回 Promise 仅供测试时显式等待处理完成。
   */
  feedRawFrame(mode: FrameMode, payload: Bytes): Promise<void> {
    const next = this.processingChain.then(() => this.processFrame(mode, payload));
    this.processingChain = next.catch((err) => {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    });
    return next;
  }

  /** 发送一条加密同步消息。仅 ready 状态可调。 */
  async send(msg: SyncMessage): Promise<void> {
    if (this.state !== 'ready' || !this.sendKey) {
      throw new Error('Session is not ready');
    }
    const plaintext = serializeMessage(msg);
    // 序列号前缀 8 字节 BE uint64，随密文一起被 GCM authTag 完整性保护。
    // 接收方解密后用滑动窗口检测重放：窗口外的旧帧或重复帧一律静默丢弃。
    const seq = this.sendSequence++;
    const seqBuf = new Uint8Array(SEQUENCE_BYTES);
    new DataView(seqBuf.buffer).setBigUint64(0, seq);
    const framed = concatBytes([seqBuf, plaintext]);
    const encrypted = await encryptSessionMessage(framed, this.sendKey);
    this.callbacks.onSendFrame(1 as FrameMode, encrypted);
  }

  close(): void {
    if (this.state === 'closed') return;
    this.clearHandshakeTimer();
    this.state = 'closed';
    this.callbacks.onClose();
  }

  private async processFrame(mode: FrameMode, payload: Bytes): Promise<void> {
    if (this.state === 'closed') return;
    try {
      if (mode === 0) {
        await this.handleHandshakeMessage(deserializeMessage(payload));
      } else {
        await this.handleEncryptedFrame(payload);
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private startHandshakeTimer(): void {
    if (this.handshakeTimeoutMs <= 0) return;
    this.clearHandshakeTimer();
    this.handshakeTimer = this.scheduleTimer(() => {
      this.handshakeTimer = null;
      if (this.state !== 'ready' && this.state !== 'closed') {
        this.state = 'closed';
        this.callbacks.onError(new Error('Handshake timed out'));
        this.callbacks.onClose();
      }
    }, this.handshakeTimeoutMs);
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) {
      this.handshakeTimer.clear();
      this.handshakeTimer = null;
    }
  }

  /** 滑动窗口重放检测。true=可接受，false=重复或过旧。bigint 避免超 2^53 精度丢失。 */
  private acceptSequence(seq: bigint): boolean {
    if (this.replayWindow <= 0) return true;
    const window = BigInt(this.replayWindow);
    if (seq > this.maxReceivedSeq) {
      // 新最大值：清理被推出窗口的旧序列号
      const lowerBound = seq - window;
      const oldLowerBound = this.maxReceivedSeq - window;
      for (let s = oldLowerBound; s < lowerBound; s += 1n) {
        this.receivedSeqs.delete(s);
      }
      this.receivedSeqs.add(seq);
      this.maxReceivedSeq = seq;
      return true;
    }
    if (seq <= this.maxReceivedSeq - window) {
      return false; // 太旧
    }
    if (this.receivedSeqs.has(seq)) {
      return false; // 重复
    }
    this.receivedSeqs.add(seq);
    return true;
  }

  private createHello(): HelloMessage {
    return {
      type: 'HELLO',
      deviceId: this.identity.deviceId,
      publicKey: this.identity.publicKeyPem,
      nonce: this.nonce,
    };
  }

  private emitHandshake(msg: SyncMessage): void {
    this.callbacks.onSendFrame(0 as FrameMode, serializeMessage(msg));
  }

  private async handleHandshakeMessage(msg: SyncMessage): Promise<void> {
    switch (msg.type) {
      case 'HELLO':
        await this.handleHello(msg);
        break;
      case 'OFFER':
        await this.handleOffer(msg);
        break;
      case 'ANSWER':
        await this.handleAnswer(msg);
        break;
      default:
        throw new Error(`Unexpected handshake message ${msg.type}`);
    }
  }

  private async handleHello(msg: HelloMessage): Promise<void> {
    // deviceId 必须等于公钥指纹，防伪造
    const fingerprint = await getDeviceFingerprint(msg.publicKey);
    if (fingerprint !== msg.deviceId) {
      throw new Error('DeviceId does not match public key fingerprint');
    }

    if (!this.isPairing) {
      const trustedKey = this.getTrustedPublicKey(msg.deviceId);
      if (!trustedKey) {
        throw new Error(`Unknown device ${msg.deviceId}`);
      }
      if (trustedKey !== msg.publicKey) {
        throw new Error(`Public key mismatch for ${msg.deviceId}`);
      }
    }

    this.peerDeviceId = msg.deviceId;
    this.peerPublicKey = msg.publicKey;
    this.peerNonce = msg.nonce;

    if (this.isInitiator) {
      if (this.state !== 'hello_sent') {
        throw new Error('Unexpected HELLO');
      }
      await this.sendOffer();
    } else {
      if (this.state !== 'idle') {
        throw new Error('Unexpected HELLO');
      }
      this.state = 'hello_received';
      // responder 在收到首个 HELLO 时启动握手超时
      this.startHandshakeTimer();
      this.emitHandshake(this.createHello());
    }
  }

  private async sendOffer(): Promise<void> {
    if (this.state !== 'hello_sent' && this.state !== 'hello_received') {
      throw new Error('Cannot send OFFER in current state');
    }
    this.ecdhKeyPair = await generateEcdhKeyPair();
    const signature = await this.signEcdhKey(this.ecdhKeyPair.publicKeyPem);
    const payload = {
      ecdhPublicKeyPem: this.ecdhKeyPair.publicKeyPem,
      signature: bytesToBase64(signature),
    };
    const offer: OfferMessage = {
      type: 'OFFER',
      signedPayload: bytesToBase64(utf8Encode(JSON.stringify(payload))),
    };
    this.state = 'offered';
    this.emitHandshake(offer);
  }

  private async handleOffer(msg: OfferMessage): Promise<void> {
    if (this.isInitiator) {
      throw new Error('Initiator received unexpected OFFER');
    }
    if (this.state !== 'hello_received') {
      throw new Error('Unexpected OFFER');
    }
    if (!this.peerDeviceId || !this.peerNonce) {
      throw new Error('Peer identity not established');
    }

    const peerEcdhPublic = await this.verifyAndExtractEcdhKey(msg.signedPayload);
    this.ecdhKeyPair = await generateEcdhKeyPair();
    await this.computeSessionKeys(peerEcdhPublic, 'responder');

    const signature = await this.signEcdhKey(this.ecdhKeyPair.publicKeyPem);
    const payload = {
      ecdhPublicKeyPem: this.ecdhKeyPair.publicKeyPem,
      signature: bytesToBase64(signature),
    };
    const answer: AnswerMessage = {
      type: 'ANSWER',
      signedPayload: bytesToBase64(utf8Encode(JSON.stringify(payload))),
    };
    this.state = 'ready';
    this.clearHandshakeTimer();
    this.emitHandshake(answer);
    this.fireReady();
  }

  private async handleAnswer(msg: AnswerMessage): Promise<void> {
    if (!this.isInitiator) {
      throw new Error('Responder received unexpected ANSWER');
    }
    if (this.state !== 'offered') {
      throw new Error('Unexpected ANSWER');
    }
    if (!this.peerDeviceId || !this.peerNonce) {
      throw new Error('Peer identity not established');
    }

    const peerEcdhPublic = await this.verifyAndExtractEcdhKey(msg.signedPayload);
    await this.computeSessionKeys(peerEcdhPublic, 'initiator');
    this.state = 'ready';
    this.clearHandshakeTimer();
    this.fireReady();
  }

  /** 触发 onReady 回调 + 所有追加的 ready 监听器（once，触发后清空）。 */
  private fireReady(): void {
    this.callbacks.onReady();
    const listeners = this.readyListeners;
    this.readyListeners = [];
    for (const cb of listeners) {
      try {
        cb();
      } catch {
        // 监听器错误不應影响握手流程，吞掉（调用方应自行 catch）
      }
    }
  }

  private async signEcdhKey(ecdhPublicKeyPem: string): Promise<Bytes> {
    if (!this.peerDeviceId || !this.peerNonce) {
      throw new Error('Peer identity not established');
    }
    const message = buildSignedData(
      this.identity.deviceId,
      this.peerDeviceId,
      this.nonce,
      this.peerNonce,
      ecdhPublicKeyPem,
    );
    return signMessage(message, this.identity.privateKeyPem);
  }

  private async verifyAndExtractEcdhKey(encryptedPayload: string): Promise<string> {
    if (!this.peerDeviceId || !this.peerNonce || !this.peerPublicKey) {
      throw new Error('Peer identity not established');
    }
    let payload: { ecdhPublicKeyPem?: string; signature?: string };
    try {
      payload = JSON.parse(new TextDecoder().decode(base64ToBytes(encryptedPayload)));
    } catch {
      throw new Error('Malformed OFFER/ANSWER payload: invalid JSON');
    }
    if (!payload.ecdhPublicKeyPem || !payload.signature) {
      throw new Error('Invalid OFFER/ANSWER payload');
    }

    const message = buildSignedData(
      this.peerDeviceId,
      this.identity.deviceId,
      this.peerNonce,
      this.nonce,
      payload.ecdhPublicKeyPem,
    );
    const signature = base64ToBytes(payload.signature);
    const valid = await verifySignature(message, signature, this.peerPublicKey);
    if (!valid) {
      throw new Error('Invalid ECDH key signature');
    }
    return payload.ecdhPublicKeyPem;
  }

  /** 派生会话密钥。salt = sha256(sortedDeviceIds + sortedNonces 拼接)，排序保证双方一致。 */
  private async computeSessionKeys(
    peerEcdhPublicKeyPem: string,
    role: 'initiator' | 'responder',
  ): Promise<void> {
    if (!this.ecdhKeyPair || !this.peerDeviceId) {
      throw new Error('Cannot compute session keys');
    }
    if (!this.peerNonce) {
      // peer nonce 未建立时 fail-closed，避免 undefined 进入 salt 派生错误密钥
      throw new Error('Cannot compute session keys: peer nonce not established');
    }
    const sharedSecret = await computeSharedSecret(
      this.ecdhKeyPair.privateKeyPem,
      peerEcdhPublicKeyPem,
    );
    const sortedDeviceIds = [this.identity.deviceId, this.peerDeviceId].sort();
    const sortedNonces = [this.nonce, this.peerNonce].sort();
    const saltInput = concatBytes([
      utf8Encode(sortedDeviceIds[0]),
      utf8Encode(sortedDeviceIds[1]),
      utf8Encode(sortedNonces[0]),
      utf8Encode(sortedNonces[1]),
    ]);
    const salt = await sha256Bytes(saltInput);
    const keys = await deriveSessionKeys(sharedSecret, salt, role);
    this.sendKey = keys.sendKey;
    this.receiveKey = keys.receiveKey;
  }

  private async handleEncryptedFrame(payload: Bytes): Promise<void> {
    if (!this.receiveKey) {
      throw new Error('Received encrypted frame before key negotiation');
    }
    const framed = await decryptSessionMessage(payload, this.receiveKey);
    if (framed.length < SEQUENCE_BYTES) {
      throw new Error('Encrypted frame too short to contain sequence number');
    }
    const seq = new DataView(framed.buffer, framed.byteOffset, framed.byteLength).getBigUint64(0);
    if (!this.acceptSequence(seq)) {
      // 重放或乱序：静默丢弃，不触发 onMessage。
      // relay store-and-forward 可能合法补发重复帧，抛错会触发上层 terminate+重连造成抖动。
      return;
    }
    const plaintext = framed.subarray(SEQUENCE_BYTES);
    const msg = deserializeMessage(plaintext);
    this.callbacks.onMessage(msg);
  }
}
