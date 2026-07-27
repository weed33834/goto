// Templates Slice — 任务模板(D3)
//
// 设计:
// - templates 数组持久化到 STORAGE_KEYS.TEMPLATES(已留 key)。
// - applyTemplate(id, variables) 用模板蓝本调 addTask 创建实例,并 +1 usageCount。
// - 变量替换:在 title/description/content 上做 {{key}} → variables[key] 字符串替换。
//   未提供的变量保留原占位符(用户可后续编辑)。
// - 内置模板(isBuiltIn)不可删除,只可编辑(允许用户调整默认值)。
// - 不走 E2EE 同步:模板是设备本地的个人偏好。
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { Template, TemplateTaskDefaults, Task, Notification } from '../../types';
import { generateId } from '../constants';
import { pushUndo } from '../../hooks/useUndo';
// 在 slice 内通过 useAppStore.getState()/setState 实现撤销恢复,
// 避免把 Template 类型耦合到 useUndo.ts(template 仅本 slice 使用)。
import { useAppStore } from '../index';

/**
 * 构造 addTask 接受的最小合法 Task 输入(覆盖所有必填字段)。
 * 模板只存部分字段,这里把缺失字段补成与 tasksSlice 测试用例一致的默认值。
 *
 * 不导出到 types.ts —— 仅 templatesSlice 内部使用,避免暴露"默认任务"约定。
 */
function makeDefaultTaskInput(overrides: Partial<Task>): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
  return {
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
    ...overrides,
  };
}

function pushNotification(
  get: () => AppStore,
  params: { type: Notification['type']; title: string; message?: string },
): void {
  const notification: Notification = {
    id: `n-${generateId()}`,
    type: params.type,
    title: params.title,
    message: params.message ?? '',
    isRead: false,
    isArchived: false,
    actionUrl: null,
    data: {},
    createdAt: new Date(),
  };
  get().addNotification(notification);
}

/** 把字符串中的 {{key}} 替换为 variables[key]。未提供的 key 保留原占位符。 */
function applyVariables(text: string | undefined, variables: Record<string, string>): string | undefined {
  if (!text) return text;
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key]! : match;
  });
}

export interface TemplatesSlice {
  templates: Template[];
  addTemplate: (input: {
    name: string;
    description?: string;
    taskDefaults: TemplateTaskDefaults;
    variables?: string[];
  }) => string;
  updateTemplate: (id: string, updates: Partial<Omit<Template, 'id' | 'isBuiltIn' | 'createdAt'>>) => void;
  deleteTemplate: (id: string) => void;
  /** 应用模板:用模板蓝本调 addTask,返回新任务 id。variables 用于 {{key}} 替换。 */
  applyTemplate: (id: string, variables?: Record<string, string>) => string | null;
}

export const createTemplatesSlice: StateCreator<AppStore, [], [], TemplatesSlice> = (set, get) => ({
  templates: [],

  addTemplate: (input) => {
    const id = generateId();
    const now = new Date().toISOString();
    const newTemplate: Template = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      taskDefaults: {
        ...input.taskDefaults,
        title: input.taskDefaults.title.trim(),
      },
      variables: input.variables ?? [],
      usageCount: 0,
      lastUsedAt: null,
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({ templates: [...state.templates, newTemplate] }));
    get().saveData();
    return id;
  },

  updateTemplate: (id, updates) => {
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === id
          ? {
              ...t,
              ...updates,
              id,
              // name/description 若传入,trim 一次
              name: updates.name !== undefined ? updates.name.trim() : t.name,
              description:
                updates.description !== undefined
                  ? updates.description.trim() || undefined
                  : t.description,
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    }));
    get().saveData();
  },

  deleteTemplate: (id) => {
    const deleted = get().templates.find((t) => t.id === id);
    if (!deleted) return;
    // 内置模板不可删除
    if (deleted.isBuiltIn) {
      pushNotification(get, {
        type: 'system',
        title: '内置模板不可删除',
        message: deleted.name,
      });
      return;
    }
    set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }));
    get().saveData();
    pushUndo({
      type: 'template',
      data: deleted,
      message: `已删除模板"${deleted.name}"`,
      undo: () => {
        // 内联撤销:不暴露 undoDeleteTemplate,直接 setState + saveData
        const current = useAppStore.getState().templates;
        if (!current.some((t) => t.id === deleted.id)) {
          useAppStore.setState({ templates: [...current, deleted] });
          useAppStore.getState().saveData();
        }
      },
    });
    pushNotification(get, {
      type: 'system',
      title: '已删除模板',
      message: deleted.name,
    });
  },

  applyTemplate: (id, variables = {}) => {
    const template = get().templates.find((t) => t.id === id);
    if (!template) return null;

    const defaults = template.taskDefaults;
    const title = applyVariables(defaults.title, variables) ?? defaults.title;
    const description = applyVariables(defaults.description, variables);
    const content = applyVariables(defaults.content, variables);

    // 用模板字段覆盖默认值,缺失字段由 makeDefaultTaskInput 补齐
    const taskInput = makeDefaultTaskInput({
      title,
      description: description ?? '',
      content: content ?? '',
      priority: defaults.priority ?? 'medium',
      tags: defaults.tags ?? [],
      projectId: defaults.projectId ?? null,
      categoryId: defaults.categoryId ?? null,
      estimatedTime: defaults.estimatedTime ?? null,
      isRecurring: defaults.isRecurring ?? false,
      recurrence: defaults.recurrence ?? null,
      // subtasks 模板:每项 { title } → 转 Subtask
      subtasks: (defaults.subtasks ?? []).map((s, idx) => ({
        id: generateId(),
        title: applyVariables(s.title, variables) ?? s.title,
        completed: false,
        order: idx,
      })),
    });

    const newTaskId = get().addTask(taskInput);

    // 使用次数 +1,记录最后使用时间
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === id
          ? {
              ...t,
              usageCount: t.usageCount + 1,
              lastUsedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    }));
    get().saveData();

    pushNotification(get, {
      type: 'task',
      title: '已从模板创建任务',
      message: template.name,
    });

    return newTaskId;
  },
});
