// 移动端同步记录业务回写 —— 把 SyncRecord 解密后写回 zustand store。
// 桌面端写 SQLite（INSERT OR REPLACE），移动端通过 store.getState/setState 直接
// 操作 tasks 数组（不走 addTask/updateTask：它们生成新 id / 覆盖 updatedAt /
// 触发 API 调用，不适合同步路径）。仅处理 'tasks' 表。

import { decryptSyncRecord } from './syncCrypto';
import type { SyncRecord, SyncRecordApplier } from './syncStorage';
import type { Task } from '../types';
import type { Bytes } from './bytes';

/** 最小 store 接口，避免直接 import store/index 造成循环依赖。 */
export interface ApplierStore {
  getState(): { tasks: Task[] };
  setState(partial: { tasks?: Task[] }): void;
}

/** 安全转 Date | null。JSON 反序列化后日期字段变 string/number，需转回 Date。 */
function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** 创建带默认值的空 Task，补齐桌面端 payload 缺失的移动端特有字段（content/progress/subtasks 等）。 */
function createDefaultTask(id: string): Task {
  const now = new Date();
  return {
    id,
    title: '',
    description: '',
    content: '',
    dueDate: null,
    dueTime: null,
    startDate: null,
    startTime: null,
    endDate: null,
    reminderDate: null,
    recurrence: null,
    priority: 'medium',
    status: 'todo',
    progress: 0,
    categoryId: null,
    projectId: null,
    tags: [],
    completed: false,
    completedAt: null,
    estimatedTime: null,
    actualTime: null,
    createdAt: now,
    updatedAt: now,
    isRecurring: false,
    parentTaskId: null,
    subtasks: [],
    attachments: [],
    comments: [],
    links: [],
    customFields: [],
    location: null,
    dependencies: [],
    blockedBy: [],
    isStarred: false,
    isHidden: false,
    isArchived: false,
    notes: [],
    checklist: [],
    assigneeId: null,
    createdBy: null,
    order: 0,
    version: 0,
    isDeleted: false,
    deletedAt: null,
  };
}

/** 把解密后的 payload upsert 到 store.tasks。已有则替换，新任务用默认值补齐后追加。 */
function applyTask(payload: Record<string, unknown>, store: ApplierStore): void {
  const id = payload.id;
  if (typeof id !== 'string' || !id) return;

  const state = store.getState();
  const existing = state.tasks.find((t) => t.id === id);
  const base = existing ?? createDefaultTask(id);

  // 浅合并 payload，随后修正日期字段（JSON 序列化把 Date 变成 string）
  const task: Task = { ...base, ...(payload as Partial<Task>) };
  task.id = id;
  // createdAt/updatedAt 用 base 兜底，其余日期字段无值时为 null
  task.createdAt = toDate(payload.createdAt) ?? base.createdAt;
  task.updatedAt = toDate(payload.updatedAt) ?? base.updatedAt;
  for (const field of ['dueDate', 'dueTime', 'startDate', 'startTime', 'endDate', 'reminderDate', 'completedAt', 'deletedAt'] as const) {
    task[field] = toDate(payload[field]);
  }

  const tasks = existing
    ? state.tasks.map((t) => (t.id === id ? task : t))
    : [...state.tasks, task];
  store.setState({ tasks });
}

/** 删除墓碑记录：从 store.tasks 中移除对应 id。 */
function deleteTask(recordId: string, store: ApplierStore): void {
  const state = store.getState();
  const tasks = state.tasks.filter((t) => t.id !== recordId);
  if (tasks.length !== state.tasks.length) {
    store.setState({ tasks });
  }
}

/** 创建同步记录 applier。在 SyncStore.applyRecord/applyBatch 中调用：先落库密文，再回写业务层。 */
export function createSyncRecordApplier(store: ApplierStore): SyncRecordApplier {
  return async (records: SyncRecord[], smk: Bytes): Promise<void> => {
    for (const record of records) {
      if (record.tableName !== 'tasks') {
        // vault_items 等暂未在移动端实现，跳过业务回写
        continue;
      }
      if (record.deleted) {
        deleteTask(record.recordId, store);
        continue;
      }
      const payload = await decryptSyncRecord(record.encryptedPayload, smk);
      applyTask(payload, store);
    }
  };
}
