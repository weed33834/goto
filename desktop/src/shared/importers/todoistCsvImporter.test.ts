// Todoist CSV 导入器单测 —— 验证字段映射 + 边界条件。
import { describe, it, expect } from 'vitest';
import { importTodoistCsv } from './todoistCsvImporter';

const TODOIST_HEADERS = 'TYPE,TITLE,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,RECURRENCE,CREATE_DATE,COMPLETED_DATE,ORDER,INDENT_TAGS,CONTENT';

describe('importTodoistCsv', () => {
  it('空字符串 → 1 个错误(空 CSV)', () => {
    const result = importTodoistCsv('');
    expect(result.tasks).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/空/);
  });

  it('缺少 TYPE 列 → 报错并附检测到的列名', () => {
    const csv = 'FOO,TITLE\nbar,Buy milk';
    const result = importTodoistCsv(csv);
    expect(result.tasks).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/缺少必要列/);
    expect(result.errors[0].message).toContain('FOO');
  });

  it('缺少 TITLE 列 → 报错', () => {
    const csv = 'TYPE,FOO\ntask,bar';
    const result = importTodoistCsv(csv);
    expect(result.errors[0].message).toMatch(/缺少必要列/);
  });

  it('标准 task 行:TITLE/PRIORITY/DATE 正确映射', () => {
    // 列序:TYPE,TITLE,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,RECURRENCE,CREATE_DATE,COMPLETED_DATE,ORDER,INDENT_TAGS,CONTENT
    // CREATE_DATE=2023-01-10,COMPLETED_DATE=空(未完成)
    const csv = `${TODOIST_HEADERS}\ntask,Buy milk,,4,1,John,,2023-01-15,en,UTC,,2023-01-10,,,1,,`;
    const result = importTodoistCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.tasks).toHaveLength(1);
    const t = result.tasks[0];
    expect(t.title).toBe('Buy milk');
    expect(t.priority).toBe('low'); // Todoist 4 → low
    expect(t.dueDate).toEqual(new Date('2023-01-15'));
    expect(t.completed).toBe(false);
    expect(t.status).toBe('todo');
  });

  it('PRIORITY 映射:1=urgent,2=high,3=medium,4=low,其他=medium', () => {
    const csv = `${TODOIST_HEADERS}
task,T1,,1,1,,,,,,,,,,,
task,T2,,2,1,,,,,,,,,,,
task,T3,,3,1,,,,,,,,,,,
task,T4,,4,1,,,,,,,,,,,
task,T5,,99,1,,,,,,,,,,,`;
    const result = importTodoistCsv(csv);
    expect(result.tasks).toHaveLength(5);
    expect(result.tasks[0].priority).toBe('urgent');
    expect(result.tasks[1].priority).toBe('high');
    expect(result.tasks[2].priority).toBe('medium');
    expect(result.tasks[3].priority).toBe('low');
    expect(result.tasks[4].priority).toBe('medium');
  });

  it('有 COMPLETED_DATE 的 task 标记为 completed', () => {
    const csv = `${TODOIST_HEADERS}\ntask,Done task,,3,1,,,,,,,2023-01-09,2023-01-10,,1,,`;
    const result = importTodoistCsv(csv);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].completed).toBe(true);
    expect(result.tasks[0].status).toBe('completed');
    expect(result.tasks[0].completedAt).toEqual(new Date('2023-01-10'));
  });

  it('RECURRENCE "every day" → daily recurrence', () => {
    const csv = `${TODOIST_HEADERS}\ntask,Recurring,,3,1,,,,en,UTC,every day,,,,,,`;
    const result = importTodoistCsv(csv);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].isRecurring).toBe(true);
    expect(result.tasks[0].recurrence).toEqual({
      type: 'daily',
      interval: 1,
      endType: 'never',
      exceptions: [],
      exceptionsCount: 0,
    });
  });

  it('RECURRENCE "every 3 weeks" → weekly, interval=3', () => {
    const csv = `${TODOIST_HEADERS}\ntask,Recurring,,3,1,,,,en,UTC,every 3 weeks,,,,,,`;
    const result = importTodoistCsv(csv);
    expect(result.tasks[0].recurrence?.type).toBe('weekly');
    expect(result.tasks[0].recurrence?.interval).toBe(3);
  });

  it('RECURRENCE "every month" → monthly', () => {
    const csv = `${TODOIST_HEADERS}\ntask,Recurring,,3,1,,,,en,UTC,every month,,,,,,`;
    const result = importTodoistCsv(csv);
    expect(result.tasks[0].recurrence?.type).toBe('monthly');
  });

  it('RECURRENCE "every year" → yearly', () => {
    const csv = `${TODOIST_HEADERS}\ntask,Recurring,,3,1,,,,en,UTC,every year,,,,,,`;
    const result = importTodoistCsv(csv);
    expect(result.tasks[0].recurrence?.type).toBe('yearly');
  });

  it('section/note 行被跳过(计入 skipped,不报错)', () => {
    const csv = `${TODOIST_HEADERS}
section,Work,,,,,,,,
task,Buy milk,,4,1,,,,,,,,,,,
note,Some note,,3,1,,,,,,,,,,,`;
    const result = importTodoistCsv(csv);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe('Buy milk');
    expect(result.skipped).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('task 行缺 TITLE → 报错并跳过该行', () => {
    const csv = `${TODOIST_HEADERS}\ntask,,desc,3,1,,,,,,,,,,,`;
    const result = importTodoistCsv(csv);
    expect(result.tasks).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toMatch(/缺少 TITLE/);
  });

  it('DESCRIPTION 含逗号(双引号包裹)正确解析', () => {
    const csv = `${TODOIST_HEADERS}\ntask,Title,"Has, comma",3,1,,,,,,,,,,,`;
    const result = importTodoistCsv(csv);
    expect(result.tasks[0].description).toBe('Has, comma');
  });

  it('TITLE 含转义引号正确解析', () => {
    const csv = `${TODOIST_HEADERS}\ntask,"Say ""hi""",,3,1,,,,,,,,,,,`;
    const result = importTodoistCsv(csv);
    expect(result.tasks[0].title).toBe('Say "hi"');
  });

  it('无效日期字符串 → dueDate=null(不报错)', () => {
    const csv = `${TODOIST_HEADERS}\ntask,Title,,3,1,,invalid-date,en,,,,,,,`;
    const result = importTodoistCsv(csv);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].dueDate).toBeNull();
  });

  it('批量导入 100 条 task 全部成功', () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      `task,Task ${i},,${(i % 4) + 1},1,,,,en,UTC,,,,${i},,,`,
    ).join('\n');
    const csv = `${TODOIST_HEADERS}\n${rows}`;
    const result = importTodoistCsv(csv);
    expect(result.tasks).toHaveLength(100);
    expect(result.errors).toHaveLength(0);
    expect(result.tasks[0].title).toBe('Task 0');
    expect(result.tasks[99].title).toBe('Task 99');
  });

  it('导入的 task 缺少 id/createdAt/updatedAt(由 addTask 补齐)', () => {
    const csv = `${TODOIST_HEADERS}\ntask,Title,,3,1,,,,,,,,,,,`;
    const result = importTodoistCsv(csv);
    const t = result.tasks[0] as Record<string, unknown>;
    expect(t.id).toBeUndefined();
    expect(t.createdAt).toBeUndefined();
    expect(t.updatedAt).toBeUndefined();
  });
});
