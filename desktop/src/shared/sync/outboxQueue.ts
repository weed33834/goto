// 移动端离线发件箱 —— 与桌面端 outboxQueue.ts 容量约束对齐，存储抽象可注入。
// 默认内存 Map（进程退出即丢失）；可注入 AsyncStorage 持久化实现（outbox 是加密帧
// mode=1，密文落盘安全）。容量：TTL 7 天 / 单对端 10000 帧 / 64MB。
// 补发：flushOutbox → trim → peek → 逐帧 send → clear(已发 id)。clear 按 id 精确删除
// 而非按对端清空，避免误删补发过程中新入队的内容。

import type { FrameMode } from './syncMessages';
import type { Bytes } from './bytes';

export const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const OUTBOX_MAX_FRAMES_PER_PEER = 10_000;
export const OUTBOX_MAX_BYTES_PER_PEER = 64 * 1024 * 1024;

export interface QueuedOutboxFrame {
  id: number;
  frameMode: FrameMode;
  payload: Bytes;
  createdAt: number;
}

export interface OutboxStore {
  enqueue(peerDeviceId: string, frameMode: FrameMode, payload: Bytes): void;
  peek(peerDeviceId: string): QueuedOutboxFrame[];
  clear(ids: number[]): void;
  purgeExpired(): number;
  trim(peerDeviceId: string): number;
}

/** 默认内存 outbox。进程退出即丢失，适用于测试或断线瞬间缓冲。长期离线应注入持久化实现。 */
export function createMemoryOutbox(): OutboxStore {
  const queues = new Map<string, QueuedOutboxFrame[]>();
  let nextId = 1;

  function trimQueue(queue: QueuedOutboxFrame[]): { queue: QueuedOutboxFrame[]; trimmed: number } {
    let trimmed = 0;
    const q = queue;
    // 帧数超限：删最旧
    while (q.length > OUTBOX_MAX_FRAMES_PER_PEER) {
      q.shift();
      trimmed++;
    }
    // 字节超限：逐条删最旧
    let bytes = q.reduce((s, f) => s + f.payload.length, 0);
    while (bytes > OUTBOX_MAX_BYTES_PER_PEER && q.length > 0) {
      const dropped = q.shift();
      if (!dropped) break;
      bytes -= dropped.payload.length;
      trimmed++;
    }
    return { queue: q, trimmed };
  }

  return {
    enqueue(peerDeviceId, frameMode, payload) {
      const queue = queues.get(peerDeviceId) ?? [];
      queue.push({ id: nextId++, frameMode, payload, createdAt: Date.now() });
      queues.set(peerDeviceId, queue);
    },
    peek(peerDeviceId) {
      return queues.get(peerDeviceId) ?? [];
    },
    clear(ids) {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      for (const [peer, queue] of queues) {
        const remaining = queue.filter((f) => !idSet.has(f.id));
        if (remaining.length === 0) queues.delete(peer);
        else queues.set(peer, remaining);
      }
    },
    purgeExpired() {
      const cutoff = Date.now() - OUTBOX_TTL_MS;
      let removed = 0;
      for (const [peer, queue] of queues) {
        const filtered = queue.filter((f) => f.createdAt >= cutoff);
        removed += queue.length - filtered.length;
        if (filtered.length === 0) queues.delete(peer);
        else queues.set(peer, filtered);
      }
      return removed;
    },
    trim(peerDeviceId) {
      const queue = queues.get(peerDeviceId);
      if (!queue) return 0;
      const { queue: trimmed, trimmed: count } = trimQueue(queue);
      if (trimmed.length === 0) queues.delete(peerDeviceId);
      else queues.set(peerDeviceId, trimmed);
      return count;
    },
  };
}
