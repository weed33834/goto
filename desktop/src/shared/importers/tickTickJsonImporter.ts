// TickTick JSON 导入器 —— 把 TickTick 导出的 JSON 数组解析为 Goto Task[]。
//
// TickTick 导出格式(Settings → Backup → Export Data to JSON):
//   [{
//     "id": "abc123",
//     "title": "Buy milk",
//     "content": "From supermarket",
//     "priority": 3,            // 0=none, 1=low, 3=medium, 5=high
//     "startDate": "2023-01-15T10:00:00+0800",
//     "dueDate": "2023-01-15T10:00:00+0800",
//     "repeatFlag": "RRULE:FREQ=DAILY",
//     "status": 0,              // 0=inbox/未完成, 2=completed
//     "projectId": "xxx",
//     "createdTime": "2023-01-09T12:00:00+0800",
//     "completedTime": null
//   }, ...]

import type { Task, Priority, RecurrenceRule, RecurrenceType } from '../types';
import type { ImportResult } from './todoistCsvImporter';

/** TickTick JSON 数组中单个条目的最小字段集(其余字段忽略)。 */
interface TickTickItem {
  title?: string;
  content?: string;
  priority?: number;
  startDate?: string | null;
  dueDate?: string | null;
  repeatFlag?: string | null;
  status?: number;
  projectId?: string | null;
  createdTime?: string | null;
  completedTime?: string | null;
  order?: number;
}

/** TickTick 优先级 0/1/3/5 → Goto Priority。 */
function mapTickTickPriority(p: number | undefined): Priority {
  switch (p) {
    case 5:
      return 'urgent';
    case 3:
      return 'high';
    case 1:
      return 'low';
    case 0:
    default:
      return 'medium';
  }
}

/** 解析 TickTick ISO 8601 日期字符串(带时区偏移)为 Date | null。 */
function parseTickTickDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 解析 TickTick repeatFlag(RRULE 格式)为 Goto RecurrenceRule。
 * RRULE:FREQ=DAILY → daily
 * RRULE:FREQ=WEEKLY → weekly
 * RRULE:FREQ=MONTHLY → monthly
 * RRULE:FREQ=YEARLY → yearly
 * RRULE:FREQ=DAILY;INTERVAL=3 → daily, interval=3
 */
function parseRepeatFlag(repeatFlag: string | null | undefined): RecurrenceRule | null {
  if (!repeatFlag || !repeatFlag.trim()) return null;
  // 提取 RRULE: 前缀后的内容
  const rrulePart = repeatFlag.startsWith('RRULE:') ? repeatFlag.slice(6) : repeatFlag;
  const parts = rrulePart.split(';');
  const params: Record<string, string> = {};
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k && v) params[k.toUpperCase()] = v;
  }

  const freq = params.FREQ?.toUpperCase();
  let type: RecurrenceType | null = null;
  if (freq === 'DAILY') type = 'daily';
  else if (freq === 'WEEKLY') type = 'weekly';
  else if (freq === 'MONTHLY') type = 'monthly';
  else if (freq === 'YEARLY') type = 'yearly';

  if (!type) return null;
  const interval = params.INTERVAL ? Math.max(1, parseInt(params.INTERVAL, 10)) : 1;
  if (isNaN(interval)) return null;

  return {
    type,
    interval,
    endType: 'never',
    exceptions: [],
    exceptionsCount: 0,
  };
}

function createTaskTemplate(): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
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
  };
}

/**
 * 解析 TickTick JSON 字符串为 Goto Task 列表。
 *
 * @param jsonText TickTick 导出的 JSON 原文(数组)
 * @returns { tasks, errors, skipped }(skipped 始终为 0,TickTick 无 section/note 概念)
 */
export function importTickTickJson(jsonText: string): ImportResult {
  const result: ImportResult = { tasks: [], errors: [], skipped: 0 };

  let items: TickTickItem[];
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) {
      result.errors.push({ row: 0, message: 'TickTick JSON 应为数组,实际为 ' + typeof parsed });
      return result;
    }
    items = parsed as TickTickItem[];
  } catch (err) {
    result.errors.push({
      row: 0,
      message: `JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`,
    });
    return result;
  }

  items.forEach((item, idx) => {
    const rowNumber = idx + 1;
    const title = item.title?.trim();
    if (!title) {
      result.errors.push({ row: rowNumber, message: '缺少 title 字段' });
      return;
    }

    try {
      const task = createTaskTemplate();
      task.title = title;
      task.description = item.content?.trim() ?? '';
      task.content = item.content?.trim() ?? '';
      task.priority = mapTickTickPriority(item.priority);
      task.startDate = parseTickTickDate(item.startDate);
      task.dueDate = parseTickTickDate(item.dueDate);
      task.completedAt = parseTickTickDate(item.completedTime);
      task.completed = task.completedAt !== null || item.status === 2;
      task.status = task.completed ? 'completed' : 'todo';
      const recurrence = parseRepeatFlag(item.repeatFlag);
      task.recurrence = recurrence;
      task.isRecurring = recurrence !== null;
      task.order = typeof item.order === 'number' ? item.order : idx;
      // projectId 不直接映射(需用户在 Goto 内重新关联项目),仅保留为 0
      result.tasks.push(task);
    } catch (err) {
      result.errors.push({
        row: rowNumber,
        message: `解析失败: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  return result;
}
