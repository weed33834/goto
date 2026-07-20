// 移动端同步消息层 —— 与桌面端 syncMessages.ts 线格式完全对齐。
// 9 种消息类型（HELLO/OFFER/ANSWER/MANIFEST/REQUEST/BATCH/ACK/ERROR/SMK_TRANSFER）。
// 序列化 JSON+UTF-8；帧协议 mode[1]+length[4 BE]+payload，可跨平台直连。

import { utf8Encode, utf8Decode, concatBytes } from './bytes';
import type { Bytes } from './bytes';

export interface HelloMessage {
  type: 'HELLO';
  deviceId: string;
  publicKey: string;
  nonce: string;
}

export interface OfferMessage {
  type: 'OFFER';
  signedPayload: string;
}

export interface AnswerMessage {
  type: 'ANSWER';
  signedPayload: string;
}

export interface ManifestRecordItem {
  id: string;
  updatedAt: number;
  hash: string;
}

export interface ManifestMessage {
  type: 'MANIFEST';
  records: ManifestRecordItem[];
}

export interface RequestMessage {
  type: 'REQUEST';
  recordIds: string[];
}

export interface WireSyncRecord {
  id: string;
  tableName: string;
  recordId: string;
  version: number;
  encryptedPayload: string;
  updatedAt: number;
  deleted: number;
  deviceVersion?: Record<string, number>;
}

export interface BatchMessage {
  type: 'BATCH';
  records: WireSyncRecord[];
}

export interface AckMessage {
  type: 'ACK';
  receivedIds: string[];
}

export interface ErrorMessage {
  type: 'ERROR';
  code: string;
  message: string;
  /**
   * 可选:Responder 找不到的 record ids(REQUEST 处理时 store 中不存在)。
   * 用于让 Requester 清 pendingRequests,避免等不到 BATCH 死锁。
   * 仅 code='NOT_FOUND' 时携带;其他 ERROR 不带此字段。
   */
  missingIds?: string[];
}

export interface SmkTransferMessage {
  type: 'SMK_TRANSFER';
  encryptedSmk: string;
}

export type SyncMessage =
  | HelloMessage
  | OfferMessage
  | AnswerMessage
  | ManifestMessage
  | RequestMessage
  | BatchMessage
  | AckMessage
  | ErrorMessage
  | SmkTransferMessage;

const MESSAGE_TYPES = [
  'HELLO', 'OFFER', 'ANSWER', 'MANIFEST',
  'REQUEST', 'BATCH', 'ACK', 'ERROR', 'SMK_TRANSFER',
] as const;

// 类型守卫（与桌面端逻辑一致，逐字段校验）

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isHelloMessage(msg: unknown): msg is HelloMessage {
  return (
    typeof msg === 'object' && msg !== null &&
    (msg as HelloMessage).type === 'HELLO' &&
    typeof (msg as HelloMessage).deviceId === 'string' &&
    typeof (msg as HelloMessage).publicKey === 'string' &&
    typeof (msg as HelloMessage).nonce === 'string'
  );
}

export function isOfferMessage(msg: unknown): msg is OfferMessage {
  return (
    typeof msg === 'object' && msg !== null &&
    (msg as OfferMessage).type === 'OFFER' &&
    typeof (msg as OfferMessage).signedPayload === 'string'
  );
}

export function isAnswerMessage(msg: unknown): msg is AnswerMessage {
  return (
    typeof msg === 'object' && msg !== null &&
    (msg as AnswerMessage).type === 'ANSWER' &&
    typeof (msg as AnswerMessage).signedPayload === 'string'
  );
}

export function isManifestRecordItem(item: unknown): item is ManifestRecordItem {
  return (
    typeof item === 'object' && item !== null &&
    typeof (item as ManifestRecordItem).id === 'string' &&
    typeof (item as ManifestRecordItem).updatedAt === 'number' &&
    typeof (item as ManifestRecordItem).hash === 'string'
  );
}

export function isManifestMessage(msg: unknown): msg is ManifestMessage {
  return (
    typeof msg === 'object' && msg !== null &&
    (msg as ManifestMessage).type === 'MANIFEST' &&
    Array.isArray((msg as ManifestMessage).records) &&
    (msg as ManifestMessage).records.every(isManifestRecordItem)
  );
}

export function isRequestMessage(msg: unknown): msg is RequestMessage {
  return (
    typeof msg === 'object' && msg !== null &&
    (msg as RequestMessage).type === 'REQUEST' &&
    Array.isArray((msg as RequestMessage).recordIds) &&
    (msg as RequestMessage).recordIds.every((id) => typeof id === 'string')
  );
}

function isVersionVector(value: unknown): value is Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  // 值必须为有限数：NaN/Infinity 会破坏 conflictResolver 的版本向量偏序比较。
  return Object.values(value).every((v) => typeof v === 'number' && Number.isFinite(v));
}

export function isWireSyncRecord(record: unknown): record is WireSyncRecord {
  if (
    !(
      typeof record === 'object' && record !== null &&
      typeof (record as WireSyncRecord).id === 'string' &&
      typeof (record as WireSyncRecord).tableName === 'string' &&
      typeof (record as WireSyncRecord).recordId === 'string' &&
      typeof (record as WireSyncRecord).version === 'number' &&
      Number.isFinite((record as WireSyncRecord).version) &&
      typeof (record as WireSyncRecord).encryptedPayload === 'string' &&
      typeof (record as WireSyncRecord).updatedAt === 'number' &&
      Number.isFinite((record as WireSyncRecord).updatedAt) &&
      typeof (record as WireSyncRecord).deleted === 'number' &&
      Number.isFinite((record as WireSyncRecord).deleted)
    )
  ) {
    return false;
  }
  const deviceVersion = (record as WireSyncRecord).deviceVersion;
  return deviceVersion === undefined || isVersionVector(deviceVersion);
}

export function isBatchMessage(msg: unknown): msg is BatchMessage {
  return (
    typeof msg === 'object' && msg !== null &&
    (msg as BatchMessage).type === 'BATCH' &&
    Array.isArray((msg as BatchMessage).records) &&
    (msg as BatchMessage).records.every(isWireSyncRecord)
  );
}

export function isAckMessage(msg: unknown): msg is AckMessage {
  return (
    typeof msg === 'object' && msg !== null &&
    (msg as AckMessage).type === 'ACK' &&
    Array.isArray((msg as AckMessage).receivedIds) &&
    (msg as AckMessage).receivedIds.every((id) => typeof id === 'string')
  );
}

export function isErrorMessage(msg: unknown): msg is ErrorMessage {
  return (
    typeof msg === 'object' && msg !== null &&
    (msg as ErrorMessage).type === 'ERROR' &&
    typeof (msg as ErrorMessage).code === 'string' &&
    typeof (msg as ErrorMessage).message === 'string' &&
    // missingIds 可选;若存在必须是 string[]
    (
      (msg as ErrorMessage).missingIds === undefined ||
      (Array.isArray((msg as ErrorMessage).missingIds) &&
        (msg as ErrorMessage).missingIds!.every((id) => typeof id === 'string'))
    )
  );
}

export function isSmkTransferMessage(msg: unknown): msg is SmkTransferMessage {
  return isRecord(msg) && msg.type === 'SMK_TRANSFER' && typeof msg.encryptedSmk === 'string';
}

export function isSyncMessage(obj: unknown): obj is SyncMessage {
  if (
    !(
      typeof obj === 'object' && obj !== null &&
      'type' in obj &&
      typeof (obj as { type: unknown }).type === 'string' &&
      MESSAGE_TYPES.includes((obj as { type: string }).type as (typeof MESSAGE_TYPES)[number])
    )
  ) {
    return false;
  }
  switch ((obj as { type: string }).type) {
    case 'HELLO': return isHelloMessage(obj);
    case 'OFFER': return isOfferMessage(obj);
    case 'ANSWER': return isAnswerMessage(obj);
    case 'MANIFEST': return isManifestMessage(obj);
    case 'REQUEST': return isRequestMessage(obj);
    case 'BATCH': return isBatchMessage(obj);
    case 'ACK': return isAckMessage(obj);
    case 'ERROR': return isErrorMessage(obj);
    case 'SMK_TRANSFER': return isSmkTransferMessage(obj);
    default: return false;
  }
}

// 序列化 / 反序列化（JSON + UTF-8，与桌面端字节一致）

export function serializeMessage(msg: SyncMessage): Bytes {
  return utf8Encode(JSON.stringify(msg));
}

export function deserializeMessage(buf: Uint8Array): SyncMessage {
  let obj: unknown;
  try {
    obj = JSON.parse(utf8Decode(buf));
  } catch {
    throw new Error('Malformed sync message: invalid JSON');
  }
  if (!isSyncMessage(obj)) {
    // 只记录 type 字段，不序列化整个 obj：攻击者可构造近 MAX_FRAME_SIZE 的
    // 合法 JSON 但类型不合规的载荷，整体序列化进错误消息会造成存储耗尽。
    const typeStr =
      obj !== null && typeof obj === 'object' && 'type' in obj
        ? String((obj as { type: unknown }).type)
        : typeof obj;
    throw new Error(`Invalid sync message: type=${typeStr}`);
  }
  return obj;
}

// 帧协议：mode[1] + length[4 BE] + payload。mode=0 握手明文，mode=1 加密。

export type FrameMode = 0 | 1;

export interface ParsedFrame {
  mode: FrameMode;
  payload: Bytes;
}

export const MAX_FRAME_SIZE = 8 * 1024 * 1024;

/** 增量帧解析器。喂入任意分片字节流，按 mode+length 边界切分完整帧。 */
export class FrameParser {
  private buffer = new Uint8Array(0);
  private onFrame: (frame: ParsedFrame) => void;
  private onError: (err: Error) => void;

  constructor(onFrame: (frame: ParsedFrame) => void, onError: (err: Error) => void) {
    this.onFrame = onFrame;
    this.onError = onError;
  }

  feed(chunk: Uint8Array): void {
    this.buffer = concatBytes([this.buffer, chunk]);
    for (;;) {
      if (this.buffer.length < 5) return;

      const mode = this.buffer[0] as FrameMode;
      if (mode !== 0 && mode !== 1) {
        this.onError(new Error(`Invalid frame mode ${mode}`));
        this.buffer = new Uint8Array(0);
        return;
      }

      const dv = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
      const length = dv.getUint32(1);
      if (length > MAX_FRAME_SIZE) {
        this.onError(new Error(`Frame exceeds maximum size of ${MAX_FRAME_SIZE} bytes`));
        this.buffer = new Uint8Array(0);
        return;
      }

      if (this.buffer.length < 5 + length) return;

      // 复制一份，避免持有大 buffer 引用导致内存无法回收
      const payload = new Uint8Array(this.buffer.subarray(5, 5 + length));
      this.buffer = this.buffer.subarray(5 + length);
      this.onFrame({ mode, payload });
    }
  }
}

export function encodeFrame(mode: FrameMode, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = mode;
  new DataView(frame.buffer).setUint32(1, payload.length);
  frame.set(payload, 5);
  return frame;
}
