// 重复任务下次实例生成 — Phase 1.2
//
// 完成一个有 recurrence 规则的任务时,生成下次实例。
// 支持 daily / weekly / monthly / yearly,可带 interval(每 N 周)和 daysOfWeek(周几)。
//
// 设计取舍:不引入 rrule.js(~30KB),自实现覆盖 95% 用例。
// 复杂规则(每月最后一个工作日 / 每年感恩节等)留给未来扩展。

import type { RecurrenceRule, Task } from '../types';

/**
 * 根据 recurrence 规则和当前完成时间,生成下次实例的 dueDate。
 * 返回 null 表示规则已结束(endDate/endCount 已达上限)或规则无效。
 */
export function getNextRecurrenceDate(
  rule: RecurrenceRule,
  completedAt: Date,
): Date | null {
  const base = new Date(completedAt);

  // 检查 endCount:exceptionsCount 已达 endCount 上限
  if (rule.endType === 'count' && rule.endCount != null && rule.exceptionsCount >= rule.endCount) {
    return null;
  }

  // 检查 endDate:下次 occurrence 已超过 endDate
  // 先粗算下次 occurrence,再校验 endDate

  let next: Date | null = null;

  switch (rule.type) {
    case 'daily':
      next = new Date(base);
      next.setDate(next.getDate() + (rule.interval || 1));
      break;

    case 'weekly': {
      // 优先用 daysOfWeek;否则用 interval 周推
      if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
        next = nextWeeklyMatch(base, rule.daysOfWeek, rule.interval || 1);
      } else {
        next = new Date(base);
        next.setDate(next.getDate() + 7 * (rule.interval || 1));
      }
      break;
    }

    case 'monthly':
      next = new Date(base);
      next.setMonth(next.getMonth() + (rule.interval || 1));
      break;

    case 'yearly':
      next = new Date(base);
      next.setFullYear(next.getFullYear() + (rule.interval || 1));
      break;

    default:
      return null;
  }

  if (!next) return null;

  // endDate 校验
  if (rule.endType === 'date' && rule.endDate && next > rule.endDate) {
    return null;
  }

  return next;
}

/** 周内匹配:从 base 开始,找下一个落在 daysOfWeek 的日期,跳过 interval 周。 */
function nextWeeklyMatch(base: Date, daysOfWeek: number[], interval: number): Date {
  const sorted = [...new Set(daysOfWeek)].sort((a, b) => a - b);
  const baseDay = base.getDay();

  // 先找本周内剩余的天
  for (const day of sorted) {
    if (day > baseDay) {
      const next = new Date(base);
      next.setDate(next.getDate() + (day - baseDay));
      return next;
    }
  }

  // 本周无剩余,跳到下个 interval 周的第一天
  const firstDay = sorted[0];
  const next = new Date(base);
  // (7 - baseDay + firstDay) 跳到本周日 + firstDay,再加 (interval-1) * 7
  next.setDate(next.getDate() + (7 - baseDay + firstDay) + (interval - 1) * 7);
  return next;
}

/**
 * 完成 recurring task 时构造下次实例。
 * 复制原任务,清空 completed/completedAt,生成新 id 与 dueDate,
 * exceptionsCount +1(用于 endCount 上限判定)。
 */
export function buildNextRecurrenceTask(
  currentTask: Task,
  completedAt: Date = new Date(),
): Task | null {
  if (!currentTask.recurrence) return null;

  const nextDue = getNextRecurrenceDate(currentTask.recurrence, completedAt);
  if (!nextDue) return null;

  const nextRule: RecurrenceRule = {
    ...currentTask.recurrence,
    exceptionsCount: currentTask.recurrence.exceptionsCount + 1,
  };

  return {
    ...currentTask,
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    title: currentTask.title,
    description: currentTask.description,
    dueDate: nextDue,
    dueTime: currentTask.dueTime ? new Date(nextDue.getTime() + getTimeOffset(currentTask.dueTime)) : null,
    reminderDate: currentTask.reminderDate
      ? new Date(nextDue.getTime() + getTimeOffset(currentTask.reminderDate))
      : null,
    completed: false,
    completedAt: null,
    status: 'todo',
    progress: 0,
    actualTime: null,
    recurrence: nextRule,
    isRecurring: true,
    parentTaskId: null,
    subtasks: currentTask.subtasks.map((s) => ({
      ...s,
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      completed: false,
    })),
    attachments: [],
    comments: [],
    notes: [],
    checklist: currentTask.checklist.map((c) => ({
      ...c,
      id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      completed: false,
      completedAt: null,
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    deletedAt: null,
    version: 1,
    deviceVersion: undefined,
  };
}

/** 从一个 Date 中提取"距当天 0 点的毫秒数",用于把 dueTime 偏移加到新 dueDate。 */
function getTimeOffset(timeDate: Date): number {
  const startOfDay = new Date(timeDate);
  startOfDay.setHours(0, 0, 0, 0);
  return timeDate.getTime() - startOfDay.getTime();
}

/** 人类可读的 recurrence 描述,用于 UI 展示。 */
export function describeRecurrence(rule: RecurrenceRule): string {
  const interval = rule.interval || 1;
  const unit = rule.type === 'daily' ? '天' : rule.type === 'weekly' ? '周' : rule.type === 'monthly' ? '月' : '年';
  const prefix = interval === 1 ? `每${unit}` : `每 ${interval} ${unit}`;

  let suffix = '';
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    suffix = ' ' + rule.daysOfWeek.map((d) => `周${dayNames[d]}`).join('/');
  }

  let end = '';
  if (rule.endType === 'count' && rule.endCount != null) {
    end = `,共 ${rule.endCount} 次`;
  } else if (rule.endType === 'date' && rule.endDate) {
    end = `,至 ${rule.endDate.toLocaleDateString()}`;
  }

  return `${prefix}${suffix}${end}`;
}
