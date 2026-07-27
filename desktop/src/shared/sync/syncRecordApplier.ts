// 同步记录业务回写 —— 把 SyncRecord 解密后写回 zustand store。
// 支持 5 张表:tasks / projects / categories / tags / vault_items。
// 通过 store.getState/setState 直接操作数组(不走 slice 的 add/update 方法:
// 它们生成新 id / 覆盖 updatedAt / 触发 API 调用,不适合同步路径)。

import { decryptSyncRecord } from './syncCrypto';
import type { SyncRecord, SyncRecordApplier } from './syncStorage';
import type { Task, Project, Category, Tag, VaultItem } from '../types';
import type { Bytes } from './bytes';

/** 最小 store 接口,避免直接 import store/index 造成循环依赖。 */
export interface ApplierStore {
  getState(): {
    tasks: Task[];
    projects: Project[];
    categories: Category[];
    tags: Tag[];
    vaultItems: VaultItem[];
  };
  setState(partial: {
    tasks?: Task[];
    projects?: Project[];
    categories?: Category[];
    tags?: Tag[];
    vaultItems?: VaultItem[];
  }): void;
}

/** 安全转 Date | null。JSON 反序列化后日期字段变 string/number,需转回 Date。 */
function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** 创建带默认值的空 Task,补齐 payload 缺失的字段。 */
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

/** 把解密后的 payload upsert 到 store.tasks。已有则替换,新任务用默认值补齐后追加。 */
function applyTask(payload: Record<string, unknown>, store: ApplierStore): void {
  const id = payload.id;
  if (typeof id !== 'string' || !id) return;

  const state = store.getState();
  const existing = state.tasks.find((t) => t.id === id);
  const base = existing ?? createDefaultTask(id);

  const task: Task = { ...base, ...(payload as Partial<Task>) };
  task.id = id;
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

/** 删除墓碑记录:从 store.tasks 中移除对应 id。 */
function deleteTask(recordId: string, store: ApplierStore): void {
  const state = store.getState();
  const tasks = state.tasks.filter((t) => t.id !== recordId);
  if (tasks.length !== state.tasks.length) {
    store.setState({ tasks });
  }
}

/** 创建带默认值的空 Project。 */
function createDefaultProject(id: string): Project {
  const now = new Date();
  return {
    id,
    name: '',
    description: '',
    color: '#6366f1',
    icon: 'folder',
    isDefault: false,
    isFavorite: false,
    isArchived: false,
    parentProjectId: null,
    childProjectIds: [],
    createdAt: now,
    updatedAt: now,
    status: 'active',
    taskCount: 0,
    completedTaskCount: 0,
    progress: 0,
    startDate: null,
    dueDate: null,
    ownerId: null,
    tags: [],
    location: null,
  };
}

function applyProject(payload: Record<string, unknown>, store: ApplierStore): void {
  const id = payload.id;
  if (typeof id !== 'string' || !id) return;

  const state = store.getState();
  const existing = state.projects.find((p) => p.id === id);
  const base = existing ?? createDefaultProject(id);

  const project: Project = { ...base, ...(payload as Partial<Project>) };
  project.id = id;
  project.createdAt = toDate(payload.createdAt) ?? base.createdAt;
  project.updatedAt = toDate(payload.updatedAt) ?? base.updatedAt;
  project.startDate = toDate(payload.startDate);
  project.dueDate = toDate(payload.dueDate);

  const projects = existing
    ? state.projects.map((p) => (p.id === id ? project : p))
    : [...state.projects, project];
  store.setState({ projects });
}

function deleteProject(recordId: string, store: ApplierStore): void {
  const state = store.getState();
  const projects = state.projects.filter((p) => p.id !== recordId);
  if (projects.length !== state.projects.length) {
    store.setState({ projects });
  }
}

/** 创建带默认值的空 Category。 */
function createDefaultCategory(id: string): Category {
  const now = new Date();
  return {
    id,
    name: '',
    description: '',
    color: '#64748b',
    parentCategoryId: null,
    childCategoryIds: [],
    isSystem: false,
    isArchived: false,
    taskCount: 0,
    order: 0,
    createdAt: now,
    updatedAt: now,
    projectId: null,
  };
}

function applyCategory(payload: Record<string, unknown>, store: ApplierStore): void {
  const id = payload.id;
  if (typeof id !== 'string' || !id) return;

  const state = store.getState();
  const existing = state.categories.find((c) => c.id === id);
  const base = existing ?? createDefaultCategory(id);

  const category: Category = { ...base, ...(payload as Partial<Category>) };
  category.id = id;
  category.createdAt = toDate(payload.createdAt) ?? base.createdAt;
  category.updatedAt = toDate(payload.updatedAt) ?? base.updatedAt;

  const categories = existing
    ? state.categories.map((c) => (c.id === id ? category : c))
    : [...state.categories, category];
  store.setState({ categories });
}

function deleteCategory(recordId: string, store: ApplierStore): void {
  const state = store.getState();
  const categories = state.categories.filter((c) => c.id !== recordId);
  if (categories.length !== state.categories.length) {
    store.setState({ categories });
  }
}

/** 创建带默认值的空 Tag。 */
function createDefaultTag(id: string): Tag {
  const now = new Date();
  return {
    id,
    name: '',
    color: '#6b7280',
    icon: 'tag',
    isSystem: false,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: null,
  };
}

function applyTag(payload: Record<string, unknown>, store: ApplierStore): void {
  const id = payload.id;
  if (typeof id !== 'string' || !id) return;

  const state = store.getState();
  const existing = state.tags.find((t) => t.id === id);
  const base = existing ?? createDefaultTag(id);

  const tag: Tag = { ...base, ...(payload as Partial<Tag>) };
  tag.id = id;
  tag.createdAt = toDate(payload.createdAt) ?? base.createdAt;
  tag.updatedAt = toDate(payload.updatedAt) ?? base.updatedAt;

  const tags = existing
    ? state.tags.map((t) => (t.id === id ? tag : t))
    : [...state.tags, tag];
  store.setState({ tags });
}

function deleteTag(recordId: string, store: ApplierStore): void {
  const state = store.getState();
  const tags = state.tags.filter((t) => t.id !== recordId);
  if (tags.length !== state.tags.length) {
    store.setState({ tags });
  }
}

/**
 * VaultItem:createdAt/updatedAt 是 string(非 Date),fields 内含敏感字段。
 * 同步层只搬运 SMK 密文,业务回写时是解密后的明文对象,可直接 setState。
 * 注意:这是跨设备同步已加密的 vault 条目本身,不是字段级加密——字段级加密
 * 由 vaultSlice 单独负责,同步的 VaultItem.fields 在 SMK 解密后是明文。
 */
function applyVaultItem(payload: Record<string, unknown>, store: ApplierStore): void {
  const id = payload.id;
  if (typeof id !== 'string' || !id) return;

  const state = store.getState();
  const existing = state.vaultItems.find((v) => v.id === id);

  // VaultItem 字段较简单,浅合并即可。createdAt/updatedAt 保持 string。
  // 走 unknown 中转:payload 是解密后的自由对象,TS 无法证明与 VaultItem 重叠。
  const item: VaultItem = existing
    ? { ...existing, ...(payload as Partial<VaultItem>) }
    : (payload as unknown as VaultItem);
  item.id = id;

  const vaultItems = existing
    ? state.vaultItems.map((v) => (v.id === id ? item : v))
    : [...state.vaultItems, item];
  store.setState({ vaultItems });
}

function deleteVaultItem(recordId: string, store: ApplierStore): void {
  const state = store.getState();
  const vaultItems = state.vaultItems.filter((v) => v.id !== recordId);
  if (vaultItems.length !== state.vaultItems.length) {
    store.setState({ vaultItems });
  }
}

/** 创建同步记录 applier。在 SyncStore.applyRecord/applyBatch 中调用:先落库密文,再回写业务层。 */
export function createSyncRecordApplier(store: ApplierStore): SyncRecordApplier {
  return async (records: SyncRecord[], smk: Bytes): Promise<void> => {
    for (const record of records) {
      if (record.deleted) {
        switch (record.tableName) {
          case 'tasks':
            deleteTask(record.recordId, store);
            break;
          case 'projects':
            deleteProject(record.recordId, store);
            break;
          case 'categories':
            deleteCategory(record.recordId, store);
            break;
          case 'tags':
            deleteTag(record.recordId, store);
            break;
          case 'vault_items':
            deleteVaultItem(record.recordId, store);
            break;
          default:
            // 未知表名,跳过业务回写(密文已落库,不影响同步协议)
            break;
        }
        continue;
      }

      const payload = await decryptSyncRecord(record.encryptedPayload, smk);
      switch (record.tableName) {
        case 'tasks':
          applyTask(payload, store);
          break;
        case 'projects':
          applyProject(payload, store);
          break;
        case 'categories':
          applyCategory(payload, store);
          break;
        case 'tags':
          applyTag(payload, store);
          break;
        case 'vault_items':
          applyVaultItem(payload, store);
          break;
        default:
          break;
      }
    }
  };
}
