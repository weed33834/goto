import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseNaturalLanguage, NL_EXAMPLES, NL_KEYWORDS_HELP } from './naturalLanguageParser';

describe('naturalLanguageParser.ts', () => {
  beforeEach(() => {
    // Pin "today" to 2026-05-01 (clearly before June 15) so:
    //   - relative-date assertions (今天/明天/后天) are deterministic;
    //   - the "6月15日" specific-date case stays in the current year
    //     (since May 1 < June 15);
    //   - the "1月1日" specific-date case rolls forward one year
    //     (since May 1 > January 1).
    vi.useFakeTimers({ now: new Date('2026-05-01T10:30:00.000Z') });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('tags (#tag)', () => {
    it('extracts a single tag and removes it from the title', () => {
      const r = parseNaturalLanguage('buy milk #shopping');
      expect(r.tags).toEqual(['shopping']);
      expect(r.title).toBe('buy milk');
    });

    it('extracts multiple tags including Chinese and underscore names', () => {
      // Only tokens prefixed with "#" are tags; "tag_only_1" without # stays in the title.
      const r = parseNaturalLanguage('买菜 #购物 #生活日用 tag_only_1');
      expect(r.tags).toEqual(['购物', '生活日用']);
      expect(r.title).toBe('买菜 tag_only_1');
    });

    it('does not set tags when none are present', () => {
      const r = parseNaturalLanguage('plain title');
      expect(r.tags).toBeUndefined();
    });
  });

  describe('projects (+project)', () => {
    it('extracts a project and removes it from the title', () => {
      const r = parseNaturalLanguage('meeting +work');
      expect(r.project).toBe('work');
      expect(r.title).toBe('meeting');
    });

    it('keeps only the last project when multiple are present (matches impl behavior)', () => {
      const r = parseNaturalLanguage('meeting +work +personal');
      expect(r.project).toBe('personal');
    });

    it('does not set project when none present', () => {
      const r = parseNaturalLanguage('plain title');
      expect(r.project).toBeUndefined();
    });
  });

  describe('priority (!N and keywords)', () => {
    it('maps !1 to critical', () => {
      expect(parseNaturalLanguage('task !1').priority).toBe('critical');
    });
    it('maps !2 to urgent', () => {
      expect(parseNaturalLanguage('task !2').priority).toBe('urgent');
    });
    it('maps !3 to medium', () => {
      expect(parseNaturalLanguage('task !3').priority).toBe('medium');
    });
    it('maps !4 to low', () => {
      expect(parseNaturalLanguage('task !4').priority).toBe('low');
    });

    it('maps the keyword "紧急" to critical', () => {
      expect(parseNaturalLanguage('紧急 task').priority).toBe('critical');
    });
    it('maps the keyword "urgent" to urgent', () => {
      expect(parseNaturalLanguage('urgent task').priority).toBe('urgent');
    });
    it('maps the keyword "普通" to medium', () => {
      expect(parseNaturalLanguage('普通 task').priority).toBe('medium');
    });
    it('maps the keyword "low" to low', () => {
      expect(parseNaturalLanguage('low priority task').priority).toBe('low');
    });

    it('does not match "中等" as medium due to negative lookahead', () => {
      // The pattern is `中(?!等)`, so "中等" should not be classified as medium.
      const r = parseNaturalLanguage('中等优先 task');
      expect(r.priority).toBeUndefined();
    });

    it('removes the priority marker from the title', () => {
      const r = parseNaturalLanguage('task !1');
      expect(r.title).toBe('task');
    });

    it('returns undefined when no priority is specified', () => {
      expect(parseNaturalLanguage('plain task').priority).toBeUndefined();
    });
  });

  describe('duration', () => {
    it('parses "30分钟" as 30 minutes', () => {
      expect(parseNaturalLanguage('task 30分钟').estimatedTime).toBe(30);
    });
    it('parses "2小时" as 120 minutes', () => {
      expect(parseNaturalLanguage('task 2小时').estimatedTime).toBe(120);
    });
    it('parses "30m" as 30 minutes', () => {
      expect(parseNaturalLanguage('task 30m').estimatedTime).toBe(30);
    });
    it('parses "2h" as 120 minutes', () => {
      expect(parseNaturalLanguage('task 2h').estimatedTime).toBe(120);
    });
    it('removes the duration token from the title', () => {
      const r = parseNaturalLanguage('task 30分钟');
      expect(r.title).toBe('task');
    });
    it('does not set estimatedTime when no duration is present', () => {
      expect(parseNaturalLanguage('plain task').estimatedTime).toBeUndefined();
    });
  });

  describe('recurrence', () => {
    it('parses "每天" as daily recurrence', () => {
      const r = parseNaturalLanguage('每天 task');
      expect(r.isRecurring).toBe(true);
      expect(r.recurrence).toEqual({
        type: 'daily',
        endType: 'never',
        interval: 1,
        exceptions: [],
        exceptionsCount: 0,
      });
    });
    it('parses "每周" as weekly', () => {
      expect(parseNaturalLanguage('每周 task').recurrence?.type).toBe('weekly');
    });
    it('parses "每月" as monthly', () => {
      expect(parseNaturalLanguage('每月 task').recurrence?.type).toBe('monthly');
    });
    it('parses "每年" as yearly', () => {
      expect(parseNaturalLanguage('每年 task').recurrence?.type).toBe('yearly');
    });
    it('parses the English keyword "daily" as daily', () => {
      expect(parseNaturalLanguage('daily task').recurrence?.type).toBe('daily');
    });
    it('removes the recurrence token from the title', () => {
      const r = parseNaturalLanguage('每天 task');
      expect(r.title).toBe('task');
    });
  });

  describe('relative dates', () => {
    it('parses "今天" as today at 00:00:00', () => {
      const r = parseNaturalLanguage('今天 task');
      expect(r.dueDate).toBeInstanceOf(Date);
      const today = new Date('2026-05-01T10:30:00.000Z');
      // Compare year/month/day; timezone-agnostic comparison of date parts.
      expect(r.dueDate!.getFullYear()).toBe(today.getFullYear());
      expect(r.dueDate!.getMonth()).toBe(today.getMonth());
      expect(r.dueDate!.getDate()).toBe(today.getDate());
      expect(r.dueDate!.getHours()).toBe(0);
      expect(r.dueDate!.getMinutes()).toBe(0);
    });

    it('parses "明天" as tomorrow at 00:00:00', () => {
      const r = parseNaturalLanguage('明天 task');
      const tomorrow = new Date('2026-05-01T10:30:00.000Z');
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(r.dueDate!.getFullYear()).toBe(tomorrow.getFullYear());
      expect(r.dueDate!.getMonth()).toBe(tomorrow.getMonth());
      expect(r.dueDate!.getDate()).toBe(tomorrow.getDate());
      expect(r.dueDate!.getHours()).toBe(0);
    });

    it('parses "后天" as day-after-tomorrow at 00:00:00', () => {
      const r = parseNaturalLanguage('后天 task');
      const expected = new Date('2026-05-01T10:30:00.000Z');
      expected.setDate(expected.getDate() + 2);
      expect(r.dueDate!.getDate()).toBe(expected.getDate());
      expect(r.dueDate!.getHours()).toBe(0);
    });

    it('matches "后天" (substring of "大后天") first due to iteration order — a known parser quirk', () => {
      // The keyword map iterates in insertion order and uses String.includes,
      // so "后天" matches the input "大后天" before "大后天" is ever checked.
      // We document the *actual* behavior here rather than the intuitive one
      // (the source must not be modified per task constraints).
      const r = parseNaturalLanguage('大后天 task');
      const expected = new Date('2026-05-01T10:30:00.000Z');
      expected.setDate(expected.getDate() + 2); // +2, not +3, because 后天 matched
      expect(r.dueDate!.getDate()).toBe(expected.getDate());
    });
  });

  describe('specific dates', () => {
    it('parses a full ISO date "2026-06-15" with hour set to 09:00:00', () => {
      const r = parseNaturalLanguage('2026-06-15 task');
      expect(r.dueDate).toBeInstanceOf(Date);
      expect(r.dueDate!.getFullYear()).toBe(2026);
      expect(r.dueDate!.getMonth()).toBe(5); // June = 5
      expect(r.dueDate!.getDate()).toBe(15);
      expect(r.dueDate!.getHours()).toBe(9);
      expect(r.dueDate!.getMinutes()).toBe(0);
    });

    it('parses "6月15日" using the current year', () => {
      const r = parseNaturalLanguage('6月15日 task');
      expect(r.dueDate!.getFullYear()).toBe(2026);
      expect(r.dueDate!.getMonth()).toBe(5);
      expect(r.dueDate!.getDate()).toBe(15);
      expect(r.dueDate!.getHours()).toBe(9);
    });

    it('rolls "1月1日" forward one year when the date is already past', () => {
      // Today is 2026-05-01 (pinned). The impl compares
      //   new Date(2026, 0, 1, 0, 0, 0) < new Date() (== 2026-05-01 10:30 local)
      // → true, so the year is incremented to 2027.
      const r = parseNaturalLanguage('1月1日 task');
      expect(r.dueDate!.getFullYear()).toBe(2027);
      expect(r.dueDate!.getMonth()).toBe(0);
      expect(r.dueDate!.getDate()).toBe(1);
    });
  });

  describe('time-of-day keywords and numeric times', () => {
    it('parses "下午3点" as 15:00 today', () => {
      const r = parseNaturalLanguage('下午3点 task');
      const today = new Date('2026-05-01T10:30:00.000Z');
      expect(r.dueDate!.getFullYear()).toBe(today.getFullYear());
      expect(r.dueDate!.getMonth()).toBe(today.getMonth());
      expect(r.dueDate!.getDate()).toBe(today.getDate());
      expect(r.dueDate!.getHours()).toBe(15);
      expect(r.dueDate!.getMinutes()).toBe(0);
    });

    it('parses "15:00" as 15:00 today', () => {
      const r = parseNaturalLanguage('15:00 task');
      expect(r.dueDate!.getHours()).toBe(15);
      expect(r.dueDate!.getMinutes()).toBe(0);
    });

    it('parses "3:30" as 03:30 (no AM/PM keyword, hour stays 3)', () => {
      const r = parseNaturalLanguage('3:30 task');
      expect(r.dueDate!.getHours()).toBe(3);
      expect(r.dueDate!.getMinutes()).toBe(30);
    });

    it('parses "上午9点" as 09:00 today', () => {
      const r = parseNaturalLanguage('上午9点 task');
      expect(r.dueDate!.getHours()).toBe(9);
      expect(r.dueDate!.getMinutes()).toBe(0);
    });

    it('parses "晚上8点" as 20:00 today (24 via 8+12)', () => {
      const r = parseNaturalLanguage('晚上8点 task');
      expect(r.dueDate!.getHours()).toBe(20);
      expect(r.dueDate!.getMinutes()).toBe(0);
    });

    it('treats 24:00 as 00:00 of the same date', () => {
      const r = parseNaturalLanguage('24:00 task');
      expect(r.dueDate!.getHours()).toBe(0);
      expect(r.dueDate!.getMinutes()).toBe(0);
    });
  });

  describe('combined / real-world inputs', () => {
    it('parses "明天下午3点 买菜 #购物" into title/tags/dueDate', () => {
      const r = parseNaturalLanguage('明天下午3点 买菜 #购物');
      expect(r.title).toBe('买菜');
      expect(r.tags).toEqual(['购物']);
      expect(r.dueDate).toBeInstanceOf(Date);
      const tomorrow = new Date('2026-05-01T10:30:00.000Z');
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(r.dueDate!.getDate()).toBe(tomorrow.getDate());
      expect(r.dueDate!.getHours()).toBe(15);
      expect(r.dueDate!.getMinutes()).toBe(0);
    });

    it('parses "每天 8点 跑步 30分钟" as recurring + duration + time', () => {
      const r = parseNaturalLanguage('每天 8点 跑步 30分钟');
      expect(r.title).toBe('跑步');
      expect(r.isRecurring).toBe(true);
      expect(r.recurrence?.type).toBe('daily');
      expect(r.estimatedTime).toBe(30);
      expect(r.dueDate).toBeInstanceOf(Date);
      expect(r.dueDate!.getHours()).toBe(8);
    });

    it('returns the original input as title when nothing is parseable', () => {
      const r = parseNaturalLanguage('just a plain title');
      expect(r.title).toBe('just a plain title');
      expect(r.tags).toBeUndefined();
      expect(r.project).toBeUndefined();
      expect(r.priority).toBeUndefined();
      expect(r.estimatedTime).toBeUndefined();
      expect(r.dueDate).toBeUndefined();
      expect(r.isRecurring).toBeUndefined();
    });

    it('falls back to the original trimmed input when all tokens strip the title to empty', () => {
      // "#tag" alone becomes "" after stripping; impl falls back to input.trim().
      const r = parseNaturalLanguage('   #tag   ');
      expect(r.tags).toEqual(['tag']);
      expect(r.title).toBe('#tag');
    });
  });

  describe('exported example/help arrays', () => {
    it('NL_EXAMPLES is a non-empty array of { input, expected }', () => {
      expect(Array.isArray(NL_EXAMPLES)).toBe(true);
      expect(NL_EXAMPLES.length).toBeGreaterThan(0);
      for (const ex of NL_EXAMPLES) {
        expect(typeof ex.input).toBe('string');
        expect(typeof ex.expected).toBe('string');
      }
    });

    it('NL_KEYWORDS_HELP is a non-empty array of strings', () => {
      expect(Array.isArray(NL_KEYWORDS_HELP)).toBe(true);
      expect(NL_KEYWORDS_HELP.length).toBeGreaterThan(0);
      for (const k of NL_KEYWORDS_HELP) {
        expect(typeof k).toBe('string');
      }
    });
  });
});
