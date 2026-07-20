import { describe, it, expect } from 'vitest';
import { camelToSnake, snakeToCamel, parseDates } from './transform';

describe('transform.ts', () => {
  describe('camelToSnake', () => {
    it('converts top-level camelCase keys to snake_case', () => {
      const input = { createdAt: '2026-01-01', taskTitle: 'foo', isArchived: false };
      expect(camelToSnake(input)).toEqual({
        created_at: '2026-01-01',
        task_title: 'foo',
        is_archived: false,
      });
    });

    it('recursively converts nested objects', () => {
      const input = {
        task: {
          dueDate: '2026-01-02',
          parentTaskId: 'p-1',
        },
      };
      expect(camelToSnake(input)).toEqual({
        task: {
          due_date: '2026-01-02',
          parent_task_id: 'p-1',
        },
      });
    });

    it('converts arrays element by element', () => {
      const input = [{ taskTitle: 'a' }, { taskTitle: 'b' }];
      expect(camelToSnake(input)).toEqual([{ task_title: 'a' }, { task_title: 'b' }]);
    });

    it('serializes Date instances to ISO strings', () => {
      const date = new Date('2026-06-15T10:00:00.000Z');
      const result = camelToSnake({ createdAt: date }) as { created_at: string };
      expect(result.created_at).toBe(date.toISOString());
    });

    it('drops undefined values but keeps null', () => {
      const input = { a: undefined, b: null, c: 1 };
      expect(camelToSnake(input)).toEqual({ b: null, c: 1 });
    });

    it('returns primitives unchanged', () => {
      expect(camelToSnake(42)).toBe(42);
      expect(camelToSnake('hello')).toBe('hello');
      expect(camelToSnake(null)).toBe(null);
      expect(camelToSnake(undefined)).toBe(undefined);
    });

    it('handles already-snake_case keys without double underscores', () => {
      // The regex adds _ before each uppercase letter, then lowercases.
      // A key already containing underscores but no uppercase letters stays the same.
      const input = { already_snake: 1, mixedCase_key: 2 };
      expect(camelToSnake(input)).toEqual({ already_snake: 1, mixed_case_key: 2 });
    });

    it('converts consecutive capitals with underscores before each (leading capital yields leading underscore)', () => {
      // The regex /([A-Z])/g prepends "_" before every uppercase letter, then
      // lowercases — so "HTTPResponse" becomes "_h_t_t_p_response".
      const input = { HTTPResponse: 1 };
      const result = camelToSnake(input) as Record<string, unknown>;
      expect(Object.keys(result)).toEqual(['_h_t_t_p_response']);
    });
  });

  describe('snakeToCamel', () => {
    it('converts snake_case keys to camelCase', () => {
      const input = { created_at: '2026-01-01', parent_task_id: 'p-1' };
      expect(snakeToCamel(input)).toEqual({
        createdAt: '2026-01-01',
        parentTaskId: 'p-1',
      });
    });

    it('recursively converts nested objects', () => {
      const input = { task: { due_date: '2026-01-02', sub_tasks: [1, 2] } };
      expect(snakeToCamel(input)).toEqual({
        task: { dueDate: '2026-01-02', subTasks: [1, 2] },
      });
    });

    it('converts arrays element by element', () => {
      const input = [{ created_at: 'a' }, { created_at: 'b' }];
      expect(snakeToCamel(input)).toEqual([{ createdAt: 'a' }, { createdAt: 'b' }]);
    });

    it('preserves Date instances (does not clone or stringify)', () => {
      const date = new Date('2026-06-15T10:00:00.000Z');
      const result = snakeToCamel({ created_at: date }) as { createdAt: Date };
      // snakeToCamel leaves Date values untouched (returns the same reference).
      expect(result.createdAt).toBe(date);
    });

    it('drops undefined values', () => {
      const input = { a: undefined, b: 2 };
      expect(snakeToCamel(input)).toEqual({ b: 2 });
    });

    it('returns primitives unchanged', () => {
      expect(snakeToCamel(42)).toBe(42);
      expect(snakeToCamel(null)).toBe(null);
      expect(snakeToCamel('hello')).toBe('hello');
    });

    it('leaves keys without underscores untouched', () => {
      expect(snakeToCamel({ simple: 1 })).toEqual({ simple: 1 });
      // Trailing underscore does not match the _([a-z]) pattern, so stays verbatim.
      expect(snakeToCamel({ trailing_: 1 })).toEqual({ trailing_: 1 });
    });
  });

  describe('parseDates', () => {
    const dateFields = [
      'createdAt',
      'updatedAt',
      'dueDate',
      'startDate',
      'endDate',
      'reminderDate',
      'completedAt',
      'deletedAt',
      'joinedAt',
      'startedAt',
    ];

    it('converts all known date fields from ISO strings to Date instances', () => {
      const iso = '2026-06-15T10:00:00.000Z';
      const input: Record<string, unknown> = {};
      for (const f of dateFields) input[f] = iso;
      const result = parseDates(input);
      for (const f of dateFields) {
        expect(result[f]).toBeInstanceOf(Date);
        expect((result[f] as Date).toISOString()).toBe(iso);
      }
    });

    it('leaves null and undefined date fields untouched', () => {
      const input = { createdAt: null, updatedAt: undefined, dueDate: '2026-01-01' };
      const result = parseDates(input);
      expect(result.createdAt).toBeNull();
      expect(result.updatedAt).toBeUndefined();
      expect(result.dueDate).toBeInstanceOf(Date);
    });

    it('preserves non-date fields verbatim', () => {
      const input = { id: 't-1', title: 'buy milk', createdAt: '2026-01-01' };
      const result = parseDates(input);
      expect(result.id).toBe('t-1');
      expect(result.title).toBe('buy milk');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('does not mutate the original object', () => {
      const input = { createdAt: '2026-01-01' };
      const result = parseDates(input);
      expect(input.createdAt).toBe('2026-01-01');
      expect(result).not.toBe(input);
    });

    it('accepts a Date instance for date fields (passes through new Date())', () => {
      const date = new Date('2026-06-15T10:00:00.000Z');
      const result = parseDates({ createdAt: date });
      expect(result.createdAt).toBeInstanceOf(Date);
      expect((result.createdAt as Date).getTime()).toBe(date.getTime());
    });
  });
});
