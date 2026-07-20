// 移动端同步引擎 —— manifest diff + record exchange 编排，与桌面端协议一致。
// session ready → MANIFEST → diff → REQUEST (500 分块) → BATCH (500 分块) →
// hash 校验 + 冲突裁决 → 落库 → ACK → 清 pendingAcks → 全部清空 onComplete。
// 全异步（Web Crypto），回调式，串行化 handleMessage 保证内存状态一致。
// 完成判定：localManifestSent && remoteManifestReceived && pendingRequests.empty && pendingAcks.empty。

import { type SyncSession } from './syncSession';
import {
  type SyncMessage,
  type ManifestMessage,
  type RequestMessage,
  type BatchMessage,
  type AckMessage,
  type WireSyncRecord,
  type ManifestRecordItem,
} from './syncMessages';
import {
  type SyncStore,
  type SyncRecord,
} from './syncStorage';
import { resolveConflict, type ConflictResult } from './conflictResolver';
import { sha256Hex } from './hashUtils';
import { bytesToBase64, base64ToBytes, utf8Encode } from './bytes';
import type { Bytes } from './bytes';

export interface SyncEngineCallbacks {
  onComplete: () => void;
  onError: (err: Error) => void;
  onClose: () => void;
  /** 检测到并发写入（版本向量互不支配）。可选，用于 UI 提示。 */
  onConcurrentWrite?: (info: {
    recordId: string;
    localDeviceVersion: Record<string, number>;
    remoteDeviceVersion: Record<string, number>;
  }) => void;
}

export interface SyncEngineOptions {
  session: SyncSession;
  smk: Bytes;
  store: SyncStore;
  tables: string[];
}

export const MAX_RECORDS_PER_BATCH = 500;
export const MAX_REQUEST_IDS = 500;

export class SyncEngine {
  private session: SyncSession;
  private store: SyncStore;
  private tables: string[];
  private smk: Bytes;
  private callbacks: SyncEngineCallbacks;
  private pendingRequests = new Set<string>();
  private pendingAcks = new Set<string>();
  private localManifestSent = false;
  private remoteManifestReceived = false;
  private remoteManifestHashes = new Map<string, string>();
  private completed = false;
  /** 串行化 message 处理，保证异步操作下内存状态一致。 */
  private messageChain: Promise<void> = Promise.resolve();

  constructor(opts: SyncEngineOptions, callbacks: SyncEngineCallbacks) {
    this.session = opts.session;
    this.store = opts.store;
    this.tables = opts.tables;
    this.smk = opts.smk;
    this.callbacks = callbacks;
  }

  /** 启动引擎。session 回调在构造时闭包注入，start() 仅处理 session 已 ready 的复用场景。 */
  start(): void {
    if (this.session.isReady()) {
      void this.sendManifest();
    }
  }

  /** 重新触发一次同步：重置状态 + 重发 manifest。 */
  triggerSync(): void {
    if (!this.session.isReady()) return;
    this.localManifestSent = false;
    this.remoteManifestReceived = false;
    this.pendingRequests.clear();
    this.pendingAcks.clear();
    this.completed = false;
    void this.sendManifest();
  }

  /**
   * 处理收到的同步消息。由 session 的 onMessage 回调调用。
   * 内部串行化，调用方无需 await。
   */
  handleMessage(msg: SyncMessage): Promise<void> {
    const next = this.messageChain.then(() => this.processMessage(msg));
    this.messageChain = next.catch((err) => {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    });
    return next;
  }

  /** session ready 时调用。 */
  onSessionReady(): void {
    void this.sendManifest();
  }

  private async sendManifest(): Promise<void> {
    if (this.localManifestSent) return;
    const records: ManifestRecordItem[] = [];
    for (const table of this.tables) {
      const manifest = await this.store.getManifest(table);
      for (const item of manifest) {
        records.push({
          id: item.id,
          updatedAt: item.updatedAt,
          hash: item.hash,
        });
      }
    }
    this.localManifestSent = true;
    await this.session.send({ type: 'MANIFEST', records });
    this.checkComplete();
  }

  private async processMessage(msg: SyncMessage): Promise<void> {
    switch (msg.type) {
      case 'MANIFEST':
        await this.handleManifest(msg);
        break;
      case 'REQUEST':
        await this.handleRequest(msg);
        break;
      case 'BATCH':
        await this.handleBatch(msg);
        break;
      case 'ACK':
        this.handleAck(msg);
        break;
      case 'ERROR':
        // P0 死锁修复:对端发 ERROR.missingIds 时,从 pendingRequests 清空这些 ids
        // (responder 找不到这些 records,不会发 BATCH,不清空就会死锁)
        if (msg.code === 'NOT_FOUND' && Array.isArray(msg.missingIds)) {
          for (const id of msg.missingIds) {
            this.pendingRequests.delete(id);
          }
          this.checkComplete();
        }
        this.callbacks.onError(new Error(`Peer error ${msg.code}: ${msg.message}`));
        break;
      // HELLO/OFFER/ANSWER/SMK_TRANSFER 由 session 处理，不应到达这里
    }
  }

  private async handleManifest(msg: ManifestMessage): Promise<void> {
    this.remoteManifestReceived = true;
    const localMap = new Map<string, { id: string; updatedAt: number; hash: string }>();
    for (const table of this.tables) {
      const manifest = await this.store.getManifest(table);
      for (const item of manifest) {
        localMap.set(item.id, {
          id: item.id,
          updatedAt: item.updatedAt,
          hash: item.hash,
        });
      }
    }

    this.remoteManifestHashes.clear();
    const missing: string[] = [];
    for (const remote of msg.records) {
      this.remoteManifestHashes.set(remote.id, remote.hash);
      const local = localMap.get(remote.id);
      if (
        !local ||
        remote.updatedAt > local.updatedAt ||
        (remote.updatedAt === local.updatedAt && remote.hash !== local.hash)
      ) {
        missing.push(remote.id);
      }
    }

    if (missing.length > 0) {
      for (const id of missing) this.pendingRequests.add(id);
      // 单条 REQUEST 上限 MAX_REQUEST_IDS（500），超限分块发送。
      // pendingRequests 一次性记入全部缺失 id，分块只影响线上消息条数。
      for (let i = 0; i < missing.length; i += MAX_REQUEST_IDS) {
        const chunk = missing.slice(i, i + MAX_REQUEST_IDS);
        await this.session.send({ type: 'REQUEST', recordIds: chunk });
      }
    }

    this.checkComplete();
  }

  private async handleRequest(msg: RequestMessage): Promise<void> {
    if (msg.recordIds.length === 0) return;
    if (msg.recordIds.length > MAX_REQUEST_IDS) {
      await this.session.send({
        type: 'ERROR',
        code: 'REQUEST_TOO_LARGE',
        message: `Request contains ${msg.recordIds.length} ids, maximum is ${MAX_REQUEST_IDS}`,
      });
      return;
    }
    const records = await this.store.getRecordsByIds(msg.recordIds);

    // P0 死锁修复:找出 store 中找不到的 ids,通过 ERROR.missingIds 告知对端清 pendingRequests
    // (否则对端永远等不到 BATCH,checkComplete 永远完不成)
    const foundIds = new Set(records.map((r) => r.id));
    const missingIds = msg.recordIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      await this.session.send({
        type: 'ERROR',
        code: 'NOT_FOUND',
        message: `Records not found: ${missingIds.length} ids`,
        missingIds,
      });
    }

    const wireRecords: WireSyncRecord[] = records.map((r) => ({
      id: r.id,
      tableName: r.tableName,
      recordId: r.recordId,
      version: r.version,
      encryptedPayload: bytesToBase64(r.encryptedPayload),
      updatedAt: r.updatedAt,
      deleted: r.deleted,
      deviceVersion: r.deviceVersion,
    }));
    for (let i = 0; i < wireRecords.length; i += MAX_RECORDS_PER_BATCH) {
      const chunk = wireRecords.slice(i, i + MAX_RECORDS_PER_BATCH);
      for (const r of chunk) this.pendingAcks.add(r.id);
      await this.session.send({ type: 'BATCH', records: chunk });
    }
  }

  private async handleBatch(msg: BatchMessage): Promise<void> {
    if (msg.records.length > MAX_RECORDS_PER_BATCH) {
      this.callbacks.onError(
        new Error(
          `Batch contains ${msg.records.length} records, maximum is ${MAX_RECORDS_PER_BATCH}`,
        ),
      );
      return;
    }

    const receivedIds: string[] = [];
    const toApply: SyncRecord[] = [];
    for (const wire of msg.records) {
      const actualHash = await sha256Hex(utf8Encode(wire.encryptedPayload));
      const expectedHash = this.remoteManifestHashes.get(wire.id);
      if (expectedHash !== undefined && expectedHash !== actualHash) {
        this.callbacks.onError(
          new Error(`Hash mismatch for record ${wire.id}; skipping corrupted record`),
        );
        // P0 死锁修复:hash 不匹配也要清 pendingRequests 并 ACK 该 id,
        // 否则该 id 永远在 pendingRequests 中,checkComplete 永远完不成
        // (数据损坏是边缘情况,不能让整个同步卡死)
        receivedIds.push(wire.id);
        this.pendingRequests.delete(wire.id);
        continue;
      }

      const record: SyncRecord = {
        id: wire.id,
        tableName: wire.tableName,
        recordId: wire.recordId,
        version: wire.version,
        encryptedPayload: base64ToBytes(wire.encryptedPayload),
        updatedAt: wire.updatedAt,
        deleted: wire.deleted,
        deviceVersion: wire.deviceVersion ?? {},
      };

      const local = await this.store.getRecordById(record.id);
      let apply = false;
      let decision: ConflictResult = 'remote';
      if (!local) {
        apply = true;
      } else {
        decision = resolveConflict(
          {
            id: local.id,
            updatedAt: local.updatedAt,
            version: local.version,
            deviceVersion: local.deviceVersion,
          },
          {
            id: record.id,
            updatedAt: record.updatedAt,
            version: record.version,
            deviceVersion: record.deviceVersion,
          },
        );
        apply = decision === 'remote' || decision === 'concurrent';
      }

      if (apply) {
        toApply.push(record);
      }
      if (decision === 'concurrent') {
        this.callbacks.onConcurrentWrite?.({
          recordId: record.id,
          localDeviceVersion: local?.deviceVersion ?? {},
          remoteDeviceVersion: record.deviceVersion,
        });
      }
      receivedIds.push(record.id);
      this.pendingRequests.delete(record.id);
    }

    // 落库：优先事务化批量，否则逐条
    if (toApply.length > 0) {
      if (this.store.applyBatch) {
        await this.store.applyBatch(toApply, this.smk);
      } else {
        for (const record of toApply) {
          await this.store.insertRecord(record);
          await this.store.applyRecord(record, this.smk);
        }
      }
    }

    if (receivedIds.length > 0) {
      await this.session.send({ type: 'ACK', receivedIds });
    }

    this.checkComplete();
  }

  private handleAck(msg: AckMessage): void {
    for (const id of msg.receivedIds) {
      this.pendingAcks.delete(id);
    }
    this.checkComplete();
  }

  private checkComplete(): void {
    if (this.completed) return;
    if (
      this.localManifestSent &&
      this.remoteManifestReceived &&
      this.pendingRequests.size === 0 &&
      this.pendingAcks.size === 0
    ) {
      this.completed = true;
      this.store.updateLastSyncAt(Date.now());
      this.callbacks.onComplete();
    }
  }
}
