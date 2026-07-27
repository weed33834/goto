// csvParser 单测 —— 验证 RFC 4180 基本语法 + Todoist 导出兼容性。
import { describe, it, expect } from 'vitest';
import { parseCsv, rowToObject } from './csvParser';

describe('csvParser', () => {
  it('空字符串返回空结构', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
    expect(parseCsv('   ')).toEqual({ headers: [], rows: [] });
  });

  it('简单 CSV(无引号):header + 2 行数据', () => {
    const csv = 'A,B,C\n1,2,3\n4,5,6';
    const result = parseCsv(csv);
    expect(result.headers).toEqual(['A', 'B', 'C']);
    expect(result.rows).toEqual([['1', '2', '3'], ['4', '5', '6']]);
  });

  it('字段含逗号时必须用双引号包裹', () => {
    const csv = 'TITLE,DESC\n"Hello, World","Has comma"';
    const result = parseCsv(csv);
    expect(result.rows[0]).toEqual(['Hello, World', 'Has comma']);
  });

  it('字段含换行时用双引号包裹(Todoist 多行描述)', () => {
    const csv = 'TITLE,DESC\n"Task A","Line 1\nLine 2"';
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0][0]).toBe('Task A');
    expect(result.rows[0][1]).toBe('Line 1\nLine 2');
  });

  it('转义引号:"" → "', () => {
    const csv = 'TITLE,DESC\n"Say ""hi""","quoted"';
    const result = parseCsv(csv);
    expect(result.rows[0][0]).toBe('Say "hi"');
    expect(result.rows[0][1]).toBe('quoted');
  });

  it('统一换行符:\\r\\n 与 \\r 都按 \\n 处理', () => {
    const csv = 'A,B\r\n1,2\r3,4';
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['1', '2']);
    expect(result.rows[1]).toEqual(['3', '4']);
  });

  it('尾部空行被忽略(Todoist 导出末尾常有空行)', () => {
    const csv = 'A,B\n1,2\n\n\n';
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(1);
  });

  it('header 空白被 trim', () => {
    const csv = '  A  , B \n1,2';
    const result = parseCsv(csv);
    expect(result.headers).toEqual(['A', 'B']);
  });

  it('行字段数不足时用空串补齐(不丢行)', () => {
    const csv = 'A,B,C\n1,2\n4,5,6';
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['1', '2', '']);
  });

  it('行字段数过多时截断到 header 长度', () => {
    const csv = 'A,B\n1,2,3,4';
    const result = parseCsv(csv);
    expect(result.rows[0]).toEqual(['1', '2']);
  });

  it('无尾换行的最后一行也能被解析', () => {
    const csv = 'A,B\n1,2';
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(['1', '2']);
  });

  it('rowToObject:headers + row → 对象', () => {
    const obj = rowToObject(['TYPE', 'TITLE', 'PRIORITY'], ['task', 'Buy milk', '1']);
    expect(obj).toEqual({ TYPE: 'task', TITLE: 'Buy milk', PRIORITY: '1' });
  });

  it('rowToObject:行长度不足时缺失字段为空串', () => {
    const obj = rowToObject(['A', 'B', 'C'], ['1']);
    expect(obj).toEqual({ A: '1', B: '', C: '' });
  });

  it('Todoist 真实导出样本(含引号、多列)能正确解析', () => {
    const csv = `TYPE,TITLE,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,RECURRENCE,CREATE_DATE,COMPLETED_DATE,ORDER,INDENT_TAGS,CONTENT
task,Buy milk,,4,1,John,,2023-01-15,en,UTC,,,2023-01-10,,1,,
task,"Meeting with ""Boss""","Discuss\nQuarterly plan",2,1,John,,2023-01-16,en,UTC,,2023-01-09,,2,,`;
    const result = parseCsv(csv);
    expect(result.headers).toHaveLength(16);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0][1]).toBe('Buy milk');
    expect(result.rows[1][1]).toBe('Meeting with "Boss"');
    expect(result.rows[1][2]).toBe('Discuss\nQuarterly plan');
    expect(result.rows[1][3]).toBe('2');
  });
});
