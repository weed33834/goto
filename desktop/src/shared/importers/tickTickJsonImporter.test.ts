// TickTick JSON 导入器单测 —— 验证字段映射 + RRULE 解析。
import { describe, it, expect } from 'vitest';
import { importTickTickJson } from './tickTickJsonImporter';

describe('importTickTickJson', () => {
  it('空数组 → 0 task,0 error', () => {
    const result = importTickTickJson('[]');
    expect(result.tasks).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('非 JSON 字符串 → 解析失败错误', () => {
    const result = importTickTickJson('not json');
    expect(result.tasks).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/JSON 解析失败/);
  });

  it('JSON 对象(非数组) → 报错', () => {
    const result = importTickTickJson('{"title": "task"}');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/应为数组/);
  });

  it('标准 task: title/content/priority/dueDate 正确映射', () => {
    const json = JSON.stringify([{
      title: 'Buy milk',
      content: 'From supermarket',
      priority: 5,
      dueDate: '2023-01-15T10:00:00+0800',
      status: 0,
    }]);
    const result = importTickTickJson(json);
    expect(result.errors).toHaveLength(0);
    expect(result.tasks).toHaveLength(1);
    const t = result.tasks[0];
    expect(t.title).toBe('Buy milk');
    expect(t.description).toBe('From supermarket');
    expect(t.priority).toBe('urgent'); // TickTick 5 → urgent
    expect(t.dueDate).toEqual(new Date('2023-01-15T10:00:00+0800'));
    expect(t.completed).toBe(false);
    expect(t.status).toBe('todo');
  });

  it('PRIORITY 映射:5=urgent,3=high,1=low,0=medium', () => {
    const json = JSON.stringify([
      { title: 'T1', priority: 5 },
      { title: 'T2', priority: 3 },
      { title: 'T3', priority: 1 },
      { title: 'T4', priority: 0 },
    ]);
    const result = importTickTickJson(json);
    expect(result.tasks[0].priority).toBe('urgent');
    expect(result.tasks[1].priority).toBe('high');
    expect(result.tasks[2].priority).toBe('low');
    expect(result.tasks[3].priority).toBe('medium');
  });

  it('status=2 (completed) → completed=true + completedAt', () => {
    const json = JSON.stringify([{
      title: 'Done task',
      status: 2,
      completedTime: '2023-01-10T15:00:00+0800',
    }]);
    const result = importTickTickJson(json);
    expect(result.tasks[0].completed).toBe(true);
    expect(result.tasks[0].status).toBe('completed');
    expect(result.tasks[0].completedAt).toEqual(new Date('2023-01-10T15:00:00+0800'));
  });

  it('repeatFlag RRULE:FREQ=DAILY → daily recurrence', () => {
    const json = JSON.stringify([{ title: 'T', repeatFlag: 'RRULE:FREQ=DAILY' }]);
    const result = importTickTickJson(json);
    expect(result.tasks[0].isRecurring).toBe(true);
    expect(result.tasks[0].recurrence).toEqual({
      type: 'daily',
      interval: 1,
      endType: 'never',
      exceptions: [],
      exceptionsCount: 0,
    });
  });

  it('repeatFlag RRULE:FREQ=WEEKLY;INTERVAL=2 → weekly, interval=2', () => {
    const json = JSON.stringify([{ title: 'T', repeatFlag: 'RRULE:FREQ=WEEKLY;INTERVAL=2' }]);
    const result = importTickTickJson(json);
    expect(result.tasks[0].recurrence?.type).toBe('weekly');
    expect(result.tasks[0].recurrence?.interval).toBe(2);
  });

  it('repeatFlag RRULE:FREQ=MONTHLY → monthly', () => {
    const json = JSON.stringify([{ title: 'T', repeatFlag: 'RRULE:FREQ=MONTHLY' }]);
    const result = importTickTickJson(json);
    expect(result.tasks[0].recurrence?.type).toBe('monthly');
  });

  it('repeatFlag RRULE:FREQ=YEARLY → yearly', () => {
    const json = JSON.stringify([{ title: 'T', repeatFlag: 'RRULE:FREQ=YEARLY' }]);
    const result = importTickTickJson(json);
    expect(result.tasks[0].recurrence?.type).toBe('yearly');
  });

  it('repeatFlag 为空字符串/null/undefined → recurrence=null', () => {
    const json = JSON.stringify([
      { title: 'T1', repeatFlag: '' },
      { title: 'T2', repeatFlag: null },
      { title: 'T3' },
    ]);
    const result = importTickTickJson(json);
    expect(result.tasks).toHaveLength(3);
    expect(result.tasks[0].recurrence).toBeNull();
    expect(result.tasks[1].recurrence).toBeNull();
    expect(result.tasks[2].recurrence).toBeNull();
    expect(result.tasks.every((t) => !t.isRecurring)).toBe(true);
  });

  it('startDate + dueDate 都映射', () => {
    const json = JSON.stringify([{
      title: 'T',
      startDate: '2023-01-10T09:00:00+0800',
      dueDate: '2023-01-15T18:00:00+0800',
    }]);
    const result = importTickTickJson(json);
    expect(result.tasks[0].startDate).toEqual(new Date('2023-01-10T09:00:00+0800'));
    expect(result.tasks[0].dueDate).toEqual(new Date('2023-01-15T18:00:00+0800'));
  });

  it('缺 title 的条目 → 报错并跳过', () => {
    const json = JSON.stringify([
      { title: 'Valid' },
      { content: 'no title' },
      { title: '', content: 'empty title' },
    ]);
    const result = importTickTickJson(json);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe('Valid');
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[1].row).toBe(3);
  });

  it('批量导入 50 条 task', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      title: `Task ${i}`,
      priority: (i % 4 === 0) ? 5 : 3,
      status: i % 5 === 0 ? 2 : 0,
    }));
    const result = importTickTickJson(JSON.stringify(items));
    expect(result.tasks).toHaveLength(50);
    expect(result.errors).toHaveLength(0);
    expect(result.tasks[0].title).toBe('Task 0');
    expect(result.tasks[49].title).toBe('Task 49');
  });
});
