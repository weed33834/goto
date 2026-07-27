// Todoist CSV 导入器 —— 把 Todoist 导出的 CSV 解析为 Goto Task[]。
//
// Todoist 导出格式(Settings → Integrations → Export CSV):
//   TYPE,TITLE,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,
//   TIMEZONE,RECURRENCE,CREATE_DATE,COMPLETED_DATE,ORDER,INDENT_TAGS,CONTENT
//
// 字段映射:
//   TYPE (task/section/note):仅导入 task 行,section/note 跳过
//   TITLE → title
//   DESCRIPTION / CONTENT → description / content
//   PRIORITY (1-4):1=urgent,2=high,3=medium,4=low
//   DATE (YYYY-MM-DD) → dueDate
//   CREATE_DATE → createdAt(自动生成,这里仅用于保留原始时间)
//   COMPLETED_DATE → completed=true + completedAt
//   RECURRENCE ("every day") → recurrence rule(简单映射,复杂 RRULE 留待用户后续编辑)

import { parseCsv, rowToObject } from './csvParser';
import type { Task, Priority, RecurrenceRule, RecurrenceType } from '../types';

/** 导入结果:任务列表 + 错误清单 + 跳过计数。 */
export interface ImportResult {
  /** 待插入任务(无 id/createdAt/updatedAt,由 addTask 补齐)。 */
  tasks: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>[];
  /** 解析失败的行 + 错误原因。 */
  errors: { row: number; message: string }[];
  /** section/note 行被跳过的数量。 */
  skipped: number;
}

/** Todoist 优先级 1-4 → Goto Priority。其他值默认 medium。 */
function mapPriority(todoistPriority: string): Priority {
  const p = Number(todoistPriority);
  switch (p) {
    case 1:
      return 'urgent';
    case 2:
      return 'high';
    case 3:
      return 'medium';
    case 4:
      return 'low';
    default:
      return 'medium';
  }
}

/** 解析 Todoist 日期字符串(YYYY-MM-DD 或 YYYY-MM-DDTHH:MM:SS)为 Date | null。 */
function parseTodoistDate(value: string): Date | null {
  if (!value || !value.trim()) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 解析 Todoist recurrence 字符串为 Goto RecurrenceRule。
 * Todoist 格式简单:"every day" / "every week" / "every month" / "every year"
 * 复杂格式(every 3 days / every mon, wed)退化为 daily/weekly,保留 interval=1。
 */
function parseRecurrence(recurrence: string): RecurrenceRule | null {
  if (!recurrence || !recurrence.trim()) return null;
  const lower = recurrence.toLowerCase();
  let type: RecurrenceType | null = null;
  if (lower.includes('day') || lower.includes('daily')) type = 'daily';
  else if (lower.includes('week')) type = 'weekly';
  else if (lower.includes('month')) type = 'monthly';
  else if (lower.includes('year')) type = 'yearly';

  // 提取 interval:every 3 days → 3
  const match = lower.match(/every\s+(\d+)/);
  const interval = match ? Math.max(1, parseInt(match[1], 10)) : 1;

  if (!type) return null;
  return {
    type,
    interval,
    endType: 'never',
    exceptions: [],
    exceptionsCount: 0,
  };
}

/** 构造一个空的 Task 模板(不含 id/createdAt/updatedAt,由 addTask 补齐)。 */
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
 * 解析 Todoist CSV 字符串为 Goto Task 列表。
 *
 * @param csvText Todoist 导出的 CSV 原文
 * @returns { tasks, errors, skipped }
 */
export function importTodoistCsv(csvText: string): ImportResult {
  const parsed = parseCsv(csvText);
  const result: ImportResult = { tasks: [], errors: [], skipped: 0 };

  if (parsed.headers.length === 0) {
    result.errors.push({ row: 0, message: 'CSV 为空或格式不正确' });
    return result;
  }

  // Todoist 导出一定有 TYPE 和 TITLE 列,缺一不可
  const hasType = parsed.headers.some((h) => h.toUpperCase() === 'TYPE');
  const hasTitle = parsed.headers.some((h) => h.toUpperCase() === 'TITLE');
  if (!hasType || !hasTitle) {
    result.errors.push({
      row: 0,
      message: `CSV 缺少必要列(TYPE/TITLE),检测到的列: ${parsed.headers.join(', ')}`,
    });
    return result;
  }

  parsed.rows.forEach((row, idx) => {
    const obj = rowToObject(parsed.headers, row);
    const rowNumber = idx + 2; // +2:跳过 header,行号从 1 开始
    const type = (obj.TYPE ?? '').toLowerCase().trim();

    // section / note 行跳过(不报错,计入 skipped)
    if (type !== 'task') {
      result.skipped++;
      return;
    }

    const title = (obj.TITLE ?? '').trim();
    if (!title) {
      result.errors.push({ row: rowNumber, message: 'task 行缺少 TITLE' });
      return;
    }

    try {
      const task = createTaskTemplate();
      task.title = title;
      task.description = (obj.DESCRIPTION ?? '').trim();
      task.content = (obj.CONTENT ?? '').trim();
      task.priority = mapPriority(obj.PRIORITY ?? '');
      task.dueDate = parseTodoistDate(obj.DATE ?? '');
      task.completedAt = parseTodoistDate(obj.COMPLETED_DATE ?? '');
      task.completed = task.completedAt !== null;
      task.status = task.completed ? 'completed' : 'todo';
      const recurrence = parseRecurrence(obj.RECURRENCE ?? '');
      task.recurrence = recurrence;
      task.isRecurring = recurrence !== null;
      // ORDER 字段保留(若存在)用于后续排序
      const orderVal = Number(obj.ORDER);
      task.order = isNaN(orderVal) ? idx : orderVal;

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
