// 重复任务下次实例生成 — 单元测试
import { describe, it, expect } from 'vitest';
import { getNextRecurrenceDate, buildNextRecurrenceTask, describeRecurrence } from './recurrenceUtils';
import type { RecurrenceRule, Task } from '../types';

function makeRule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    type: 'daily',
    interval: 1,
    endType: 'never',
    exceptions: [],
    exceptionsCount: 0,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: '测试任务',
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
    createdAt: new Date(),
    updatedAt: new Date(),
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
    version: 1,
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

describe('getNextRecurrenceDate', () => {
  it('daily:从 2026-07-20 推下次为 2026-07-21', () => {
    const rule = makeRule({ type: 'daily' });
    const completedAt = new Date(2026, 6, 20, 10, 0, 0);
    const next = getNextRecurrenceDate(rule, completedAt);
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(21);
    expect(next!.getMonth()).toBe(6);
    expect(next!.getFullYear()).toBe(2026);
  });

  it('daily interval=3:跳 3 天', () => {
    const rule = makeRule({ type: 'daily', interval: 3 });
    const completedAt = new Date(2026, 6, 20);
    const next = getNextRecurrenceDate(rule, completedAt);
    expect(next!.getDate()).toBe(23);
  });

  it('weekly:从周一推下次为下周一', () => {
    const rule = makeRule({ type: 'weekly', interval: 1 });
    // 2026-07-20 是周一
    const completedAt = new Date(2026, 6, 20);
    const next = getNextRecurrenceDate(rule, completedAt);
    expect(next!.getDate()).toBe(27);
  });

  it('weekly with daysOfWeek [1,3,5]:周二完成,下次周三', () => {
    const rule = makeRule({ type: 'weekly', daysOfWeek: [1, 3, 5], interval: 1 });
    // 2026-07-21 是周二
    const completedAt = new Date(2026, 6, 21);
    const next = getNextRecurrenceDate(rule, completedAt);
    expect(next!.getDate()).toBe(22);
    expect(next!.getDay()).toBe(3); // 周三
  });

  it('weekly with daysOfWeek [1,3,5]:周五完成,跳到下周一', () => {
    const rule = makeRule({ type: 'weekly', daysOfWeek: [1, 3, 5], interval: 1 });
    // 2026-07-24 是周五
    const completedAt = new Date(2026, 6, 24);
    const next = getNextRecurrenceDate(rule, completedAt);
    expect(next!.getDay()).toBe(1); // 周一
  });

  it('monthly:从 2026-07-20 推下次为 2026-08-20', () => {
    const rule = makeRule({ type: 'monthly', interval: 1 });
    const completedAt = new Date(2026, 6, 20);
    const next = getNextRecurrenceDate(rule, completedAt);
    expect(next!.getMonth()).toBe(7);
    expect(next!.getDate()).toBe(20);
  });

  it('yearly:从 2026-07-20 推下次为 2027-07-20', () => {
    const rule = makeRule({ type: 'yearly', interval: 1 });
    const completedAt = new Date(2026, 6, 20);
    const next = getNextRecurrenceDate(rule, completedAt);
    expect(next!.getFullYear()).toBe(2027);
  });

  it('endCount 达上限返回 null', () => {
    const rule = makeRule({ type: 'daily', endType: 'count', endCount: 3, exceptionsCount: 3 });
    const next = getNextRecurrenceDate(rule, new Date());
    expect(next).toBeNull();
  });

  it('endDate 已超过返回 null', () => {
    const rule = makeRule({
      type: 'daily',
      endType: 'date',
      endDate: new Date(2026, 6, 19),
    });
    const completedAt = new Date(2026, 6, 20);
    const next = getNextRecurrenceDate(rule, completedAt);
    expect(next).toBeNull();
  });
});

describe('buildNextRecurrenceTask', () => {
  it('返回 null 当任务无 recurrence', () => {
    const task = makeTask({ recurrence: null });
    expect(buildNextRecurrenceTask(task)).toBeNull();
  });

  it('生成新任务,新 id,重置 completed 状态,dueDate 推下次', () => {
    const rule = makeRule({ type: 'daily' });
    const task = makeTask({
      recurrence: rule,
      completed: true,
      completedAt: new Date(2026, 6, 20),
      status: 'completed',
      dueDate: new Date(2026, 6, 20),
    });
    const next = buildNextRecurrenceTask(task, new Date(2026, 6, 20));
    expect(next).not.toBeNull();
    expect(next!.id).not.toBe(task.id);
    expect(next!.completed).toBe(false);
    expect(next!.completedAt).toBeNull();
    expect(next!.status).toBe('todo');
    expect(next!.dueDate!.getDate()).toBe(21);
    expect(next!.recurrence!.exceptionsCount).toBe(1);
  });

  it('清空 attachments / comments / notes', () => {
    const rule = makeRule({ type: 'daily' });
    const task = makeTask({
      recurrence: rule,
      attachments: [{ id: 'a1', name: 'x', type: 'document', uri: '', size: 0, mimeType: '', createdAt: new Date(), updatedAt: new Date(), taskId: 't1', uploadedBy: null }],
      comments: [],
      notes: [],
    });
    const next = buildNextRecurrenceTask(task);
    expect(next!.attachments).toEqual([]);
  });

  it('subtasks / checklist 重置 completed 并给新 id', () => {
    const rule = makeRule({ type: 'daily' });
    const task = makeTask({
      recurrence: rule,
      subtasks: [{ id: 's1', title: '子1', completed: true, order: 0 }],
      checklist: [{ id: 'c1', text: '项1', completed: true, completedAt: new Date(), order: 0, dueDate: null, assigneeId: null, createdAt: new Date() }],
    });
    const next = buildNextRecurrenceTask(task);
    expect(next!.subtasks).toHaveLength(1);
    expect(next!.subtasks[0].id).not.toBe('s1');
    expect(next!.subtasks[0].completed).toBe(false);
    expect(next!.checklist).toHaveLength(1);
    expect(next!.checklist[0].id).not.toBe('c1');
    expect(next!.checklist[0].completed).toBe(false);
  });
});

describe('describeRecurrence', () => {
  it('每天', () => {
    expect(describeRecurrence(makeRule({ type: 'daily' }))).toBe('每天');
  });

  it('每 3 天', () => {
    expect(describeRecurrence(makeRule({ type: 'daily', interval: 3 }))).toBe('每 3 天');
  });

  it('每周 周一/周三/周五', () => {
    const desc = describeRecurrence(makeRule({ type: 'weekly', daysOfWeek: [1, 3, 5] }));
    expect(desc).toBe('每周 周一/周三/周五');
  });

  it('每月,共 12 次', () => {
    expect(describeRecurrence(makeRule({ type: 'monthly', endType: 'count', endCount: 12 }))).toContain('共 12 次');
  });
});
