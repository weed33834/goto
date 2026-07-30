import type { Task, Priority, TaskStatus } from '@shared/types';
import { isSameDay } from '@shared/utils/dateUtils';

// 构造满足 Omit<Task, 'id' | 'createdAt' | 'updatedAt'> 的最小合法任务输入。
// Task 字段非常多,集中给默认避免每个调用点重复(与 desktop 测试辅助同形)。
export function buildTaskInput(
  overrides: Partial<Task> = {},
): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
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

// 优先级 → 颜色 token(复用 desktop 调色板,不硬编码 hex)。
export const priorityMeta: Record<Priority, { label: string; color: string }> = {
  low: { label: '低', color: 'text-olive' },
  medium: { label: '中', color: 'text-teal' },
  high: { label: '高', color: 'text-gold' },
  urgent: { label: '紧急', color: 'text-seal' },
  critical: { label: '关键', color: 'text-seal' },
};

export const statusMeta: Record<TaskStatus, { label: string }> = {
  todo: { label: '待办' },
  'in-progress': { label: '进行中' },
  waiting: { label: '等待' },
  delegated: { label: '已委派' },
  completed: { label: '已完成' },
  cancelled: { label: '已取消' },
  'on-hold': { label: '搁置' },
};

// 任务是否属于"今日":未完成且(今天到期或无到期日)。
// 日期比较复用 @shared 的 isSameDay,不再手搓年月日比对。
export function isTodayTask(task: Task, now: Date = new Date()): boolean {
  if (task.completed) return false;
  if (!task.dueDate) return true; // 无到期日 → 随时可做,进今日
  return isSameDay(task.dueDate, now);
}
