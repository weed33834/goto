import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  priorityToEmotion,
  emotionToColor,
  categoryToShape,
  completedAtToGrid,
  isBrickEligible,
} from './types';
import {
  deriveMosaicTiles,
  deriveMosaicStats,
  deriveRecentActivity,
  deriveEmotionBreakdown,
} from './deriveMosaic';
import type { Task } from '../types';
import type { MosaicTile, MosaicEmotion } from './types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'test',
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
    status: 'completed',
    progress: 100,
    categoryId: null,
    projectId: null,
    tags: [],
    completed: true,
    completedAt: new Date('2026-07-18T10:00:00Z'),
    estimatedTime: null,
    actualTime: null,
    createdAt: new Date('2026-07-18T08:00:00Z'),
    updatedAt: new Date('2026-07-18T10:00:00Z'),
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

describe('mosaic types', () => {
  it('priorityToEmotion — urgent/critical → urgent', () => {
    expect(priorityToEmotion('urgent')).toBe('urgent');
    expect(priorityToEmotion('critical')).toBe('urgent');
  });

  it('priorityToEmotion — high → focus, medium → steady, low → rest', () => {
    expect(priorityToEmotion('high')).toBe('focus');
    expect(priorityToEmotion('medium')).toBe('steady');
    expect(priorityToEmotion('low')).toBe('rest');
  });

  it('emotionToColor — 8 色调色板映射', () => {
    expect(emotionToColor('focus')).toBe('#E8C56C');
    expect(emotionToColor('urgent')).toBe('#C75D4F');
    expect(emotionToColor('steady')).toBe('#7B8B3D');
    expect(emotionToColor('rest')).toBe('#3D7B8B');
  });

  it('emotionToColor — joy 与 focus 拉开色差(P1 修复:不再同色)', () => {
    expect(emotionToColor('joy')).toBe('#F5D88A');
    expect(emotionToColor('joy')).not.toBe(emotionToColor('focus'));
  });

  it('categoryToShape — null → rect', () => {
    expect(categoryToShape(null)).toBe('rect');
  });

  it('categoryToShape — 同 categoryId 稳定返回同形状', () => {
    const s1 = categoryToShape('cat-1');
    const s2 = categoryToShape('cat-1');
    expect(s1).toBe(s2);
  });

  it('categoryToShape — 不同 categoryId 可能不同形状', () => {
    const shapes = new Set([
      categoryToShape('a'),
      categoryToShape('b'),
      categoryToShape('c'),
      categoryToShape('d'),
      categoryToShape('e'),
    ]);
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('completedAtToGrid — 同日 gridX=0', () => {
    const t = Date.now();
    const g = completedAtToGrid(t, t);
    expect(g.gridX).toBe(0);
  });

  it('isBrickEligible — 未完成 false', () => {
    expect(
      isBrickEligible({
        status: 'todo',
        completed: false,
        completedAt: null,
      }),
    ).toBe(false);
  });

  it('isBrickEligible — 已完成但有 completedAt true', () => {
    expect(
      isBrickEligible({
        status: 'completed',
        completed: true,
        completedAt: new Date(),
      }),
    ).toBe(true);
  });
});

describe('deriveMosaicTiles', () => {
  it('空任务 → 空砖', () => {
    expect(deriveMosaicTiles([])).toEqual([]);
  });

  it('过滤未完成任务', () => {
    const tasks = [
      makeTask({ id: 't1', completed: true, completedAt: new Date('2026-07-18') }),
      makeTask({ id: 't2', completed: false, completedAt: null, status: 'todo' }),
    ];
    const tiles = deriveMosaicTiles(tasks);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].taskId).toBe('t1');
  });

  it('按 completedAt 升序排列', () => {
    const tasks = [
      makeTask({ id: 'late', completedAt: new Date('2026-07-20T10:00:00Z') }),
      makeTask({ id: 'early', completedAt: new Date('2026-07-18T10:00:00Z') }),
    ];
    const tiles = deriveMosaicTiles(tasks);
    expect(tiles[0].taskId).toBe('early');
    expect(tiles[1].taskId).toBe('late');
  });

  it('同一天的多块砖 gridY 递增', () => {
    const day = new Date('2026-07-18T10:00:00Z');
    const tasks = [
      makeTask({ id: 'a', completedAt: day }),
      makeTask({ id: 'b', completedAt: new Date('2026-07-18T14:00:00Z') }),
      makeTask({ id: 'c', completedAt: new Date('2026-07-18T18:00:00Z') }),
    ];
    const tiles = deriveMosaicTiles(tasks);
    expect(tiles.map((t) => t.gridY)).toEqual([0, 1, 2]);
    expect(tiles.every((t) => t.gridX === 0)).toBe(true);
  });

  it('不同天的砖 gridX 递增', () => {
    const tasks = [
      makeTask({ id: 'd1', completedAt: new Date('2026-07-18T10:00:00Z') }),
      makeTask({ id: 'd2', completedAt: new Date('2026-07-19T10:00:00Z') }),
      makeTask({ id: 'd3', completedAt: new Date('2026-07-20T10:00:00Z') }),
    ];
    const tiles = deriveMosaicTiles(tasks);
    expect(tiles.map((t) => t.gridX)).toEqual([0, 1, 2]);
  });

  it('priority 映射到 emotion/color', () => {
    const tasks = [
      makeTask({ id: 'urgent', priority: 'urgent', completedAt: new Date('2026-07-18') }),
      makeTask({ id: 'low', priority: 'low', completedAt: new Date('2026-07-18T14:00:00Z') }),
    ];
    const tiles = deriveMosaicTiles(tasks);
    expect(tiles[0].emotion).toBe('urgent');
    expect(tiles[0].color).toBe('#C75D4F');
    expect(tiles[1].emotion).toBe('rest');
    expect(tiles[1].color).toBe('#3D7B8B');
  });

  it('同一天 >8 块时 gridY 继续递增(不堆叠到 gridY=7) — P1 修复', () => {
    const day = new Date('2026-07-18T10:00:00Z');
    const tasks = Array.from({ length: 12 }, (_, i) =>
      makeTask({
        id: `t${i}`,
        completedAt: new Date(day.getTime() + i * 60_000),
      }),
    );
    const tiles = deriveMosaicTiles(tasks);
    // 12 块砖 gridY 应该是 0..11,不堆叠
    expect(tiles.map((t) => t.gridY)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(tiles.every((t) => t.gridX === 0)).toBe(true);
  });
});

describe('deriveMosaicStats', () => {
  it('空砖 → 全 0', () => {
    const s = deriveMosaicStats([]);
    expect(s).toEqual({
      totalBricks: 0,
      currentStreak: 0,
      longestStreak: 0,
      todayBricks: 0,
    });
  });

  it('单砖 → totalBricks=1, currentStreak=1', () => {
    const today = new Date();
    const tiles = deriveMosaicTiles([
      makeTask({ completedAt: today }),
    ]);
    const s = deriveMosaicStats(tiles);
    expect(s.totalBricks).toBe(1);
    expect(s.longestStreak).toBe(1);
  });

  it('连续 3 天 → longestStreak=3', () => {
    const base = Date.now();
    const tasks = [0, 1, 2].map((i) =>
      makeTask({
        id: `t${i}`,
        completedAt: new Date(base - i * 86400000),
      }),
    );
    const tiles = deriveMosaicTiles(tasks);
    const s = deriveMosaicStats(tiles);
    expect(s.longestStreak).toBe(3);
  });

  it('中间断一天 → longestStreak 不连续', () => {
    const base = Date.now();
    const tasks = [0, 2].map((i) =>
      makeTask({
        id: `t${i}`,
        completedAt: new Date(base - i * 86400000),
      }),
    );
    const tiles = deriveMosaicTiles(tasks);
    const s = deriveMosaicStats(tiles);
    expect(s.longestStreak).toBe(1);
  });
});

// ─── b3:可视化派生测试 ──────────────────────────────────────────────────

/** 构造最小合法 MosaicTile,避免每个用例重复 9 个字段 */
function makeTile(overrides: Partial<MosaicTile> = {}): MosaicTile {
  return {
    taskId: 't1',
    title: 'test',
    completedAt: Date.now(),
    emotion: 'steady',
    shape: 'rect',
    color: '#7B8B3D',
    gridX: 0,
    gridY: 0,
    spanX: 1,
    spanY: 1,
    ...overrides,
  };
}

describe('deriveRecentActivity', () => {
  beforeEach(() => {
    // 锁定"今天"为 2026-07-26 00:00 本地时区,保证测试可重复
    vi.useFakeTimers({ now: new Date('2026-07-26T00:00:00') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('空 tiles → 14 天全 0,仅今天 isToday', () => {
    const act = deriveRecentActivity([], 14);
    expect(act).toHaveLength(14);
    expect(act.every((a) => a.count === 0)).toBe(true);
    expect(act.filter((a) => a.isToday)).toHaveLength(1);
    expect(act[13].isToday).toBe(true);
  });

  it('今天的砖 → 最后一天 count=1', () => {
    const tile = makeTile({ completedAt: new Date('2026-07-26T10:00:00').getTime() });
    const act = deriveRecentActivity([tile], 14);
    expect(act[13].count).toBe(1);
    expect(act[13].isToday).toBe(true);
  });

  it('昨天的砖 → 倒数第二天 count=1', () => {
    const tile = makeTile({ completedAt: new Date('2026-07-25T10:00:00').getTime() });
    const act = deriveRecentActivity([tile], 14);
    expect(act[12].count).toBe(1);
    expect(act[13].count).toBe(0);
  });

  it('14 天外的砖 → 不计入热力图', () => {
    // 2026-07-11 距今天 15 天,超出 14 天窗口
    const tile = makeTile({ completedAt: new Date('2026-07-11T10:00:00').getTime() });
    const act = deriveRecentActivity([tile], 14);
    expect(act.every((a) => a.count === 0)).toBe(true);
  });

  it('断档天占位 count=0,不跳过', () => {
    // 今天和 3 天前各一块,中间两天应为 0
    const tiles = [
      makeTile({ taskId: 'today', completedAt: new Date('2026-07-26T10:00:00').getTime() }),
      makeTile({ taskId: 'd3', completedAt: new Date('2026-07-23T10:00:00').getTime() }),
    ];
    const act = deriveRecentActivity(tiles, 14);
    expect(act[13].count).toBe(1); // 今天
    expect(act[12].count).toBe(0); // 昨天
    expect(act[11].count).toBe(0); // 前天
    expect(act[10].count).toBe(1); // 3 天前
  });

  it('同一天多块砖 → count 累加', () => {
    const tiles = [
      makeTile({ taskId: 'a', completedAt: new Date('2026-07-26T10:00:00').getTime() }),
      makeTile({ taskId: 'b', completedAt: new Date('2026-07-26T14:00:00').getTime() }),
      makeTile({ taskId: 'c', completedAt: new Date('2026-07-26T18:00:00').getTime() }),
    ];
    const act = deriveRecentActivity(tiles, 14);
    expect(act[13].count).toBe(3);
  });

  it('自定义 days 参数', () => {
    const act = deriveRecentActivity([], 7);
    expect(act).toHaveLength(7);
  });

  it('第一天日期正确(14 天前)', () => {
    const act = deriveRecentActivity([], 14);
    const first = act[0].date;
    // 14 天窗口:2026-07-13 ~ 2026-07-26
    expect(first.getDate()).toBe(13);
    expect(first.getMonth()).toBe(6); // 7 月(0-indexed)
  });
});

describe('deriveEmotionBreakdown', () => {
  it('空 tiles → 空数组', () => {
    expect(deriveEmotionBreakdown([])).toEqual([]);
  });

  it('单情绪 → 单切片,label/color 正确', () => {
    const tiles = [makeTile({ emotion: 'urgent', color: '#C75D4F' })];
    const slices = deriveEmotionBreakdown(tiles);
    expect(slices).toHaveLength(1);
    expect(slices[0]).toEqual({
      emotion: 'urgent',
      color: '#C75D4F',
      label: '突破',
      count: 1,
    });
  });

  it('多情绪 → 按 EMOTION_ORDER 排序(urgent→focus→joy→steady→rest)', () => {
    const tiles = [
      makeTile({ taskId: 'r', emotion: 'rest' }),
      makeTile({ taskId: 'u', emotion: 'urgent' }),
      makeTile({ taskId: 'f', emotion: 'focus' }),
      makeTile({ taskId: 's', emotion: 'steady' }),
    ];
    const slices = deriveEmotionBreakdown(tiles);
    expect(slices.map((s) => s.emotion)).toEqual(['urgent', 'focus', 'steady', 'rest']);
  });

  it('count=0 的情绪不返回', () => {
    const tiles = [
      makeTile({ taskId: 'a', emotion: 'focus' }),
      makeTile({ taskId: 'b', emotion: 'focus' }),
    ];
    const slices = deriveEmotionBreakdown(tiles);
    expect(slices).toHaveLength(1);
    expect(slices[0].emotion).toBe('focus');
    expect(slices[0].count).toBe(2);
  });

  it('同情绪多块 → count 累加', () => {
    const tiles = [
      makeTile({ taskId: 'a', emotion: 'steady' }),
      makeTile({ taskId: 'b', emotion: 'steady' }),
      makeTile({ taskId: 'c', emotion: 'steady' }),
    ];
    const slices = deriveEmotionBreakdown(tiles);
    expect(slices[0].count).toBe(3);
  });

  it('全部 5 种情绪都有砖 → 返回 5 个切片', () => {
    const emotions: MosaicEmotion[] = ['focus', 'steady', 'urgent', 'joy', 'rest'];
    const tiles = emotions.map((e, i) => makeTile({ taskId: `t${i}`, emotion: e }));
    const slices = deriveEmotionBreakdown(tiles);
    expect(slices).toHaveLength(5);
    expect(slices.map((s) => s.label)).toEqual(['突破', '专注', '愉悦', '平稳', '静养']);
  });
});
