import { describe, it, expect } from 'vitest';
import {
  priorityToEmotion,
  emotionToColor,
  categoryToShape,
  completedAtToGrid,
  isBrickEligible,
} from './types';
import { deriveMosaicTiles, deriveMosaicStats } from './deriveMosaic';
import type { Task } from '../types';

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
