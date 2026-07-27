// insightsEngine 单测 — 验证规则触发与排序(D5)
import { describe, it, expect } from 'vitest';
import { generateInsights } from './insightsEngine';
import type { Task, Habit, Goal } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date();
  return {
    id: 't-' + Math.random().toString(36).slice(2, 8),
    title: 'task',
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
    createdAt: now,
    updatedAt: now,
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

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h-' + Math.random().toString(36).slice(2, 8),
    name: 'habit',
    cadence: 'daily',
    color: '#5B6CFF',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: false,
    completedDates: [],
    ...overrides,
  } as Habit;
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g-' + Math.random().toString(36).slice(2, 8),
    title: 'goal',
    period: '2026-Q3',
    status: 'active',
    keyResults: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('generateInsights', () => {
  it('空数据无建议', () => {
    const out = generateInsights({ tasks: [], habits: [], goals: [] });
    expect(out).toEqual([]);
  });

  it('5+ 逾期任务触发 critical', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const tasks = Array.from({ length: 6 }, () =>
      makeTask({ dueDate: yesterday, completed: false }),
    );
    const out = generateInsights({ tasks, habits: [], goals: [] });
    const overdue = out.find((s) => s.id === 'overdue');
    expect(overdue).toBeDefined();
    expect(overdue!.severity).toBe('critical');
  });

  it('1-4 逾期任务触发 warn', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const tasks = [makeTask({ dueDate: yesterday, completed: false })];
    const out = generateInsights({ tasks, habits: [], goals: [] });
    const overdue = out.find((s) => s.id === 'overdue');
    expect(overdue?.severity).toBe('warn');
  });

  it('高优先级积压触发 warn', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({ priority: i < 3 ? 'urgent' : 'critical', completed: false }),
    );
    const out = generateInsights({ tasks, habits: [], goals: [] });
    expect(out.some((s) => s.id === 'high-priority-backlog' && s.severity === 'warn')).toBe(true);
  });

  it('完成趋势下滑触发 warn', () => {
    // 前 7 天完成 5 个,近 7 天完成 1 个 → 1 < 5*0.6=3
    const now = new Date();
    const tasks: Task[] = [];
    for (let i = 8; i <= 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      tasks.push(makeTask({ completed: true, completedAt: d }));
    }
    const recent = new Date(now);
    recent.setDate(recent.getDate() - 2);
    tasks.push(makeTask({ completed: true, completedAt: recent }));

    const out = generateInsights({ tasks, habits: [], goals: [] });
    const trend = out.find((s) => s.id === 'trend-down');
    expect(trend).toBeDefined();
    expect(trend!.severity).toBe('warn');
  });

  it('今日待办 ≥ 8 触发 warn', () => {
    const today = new Date();
    today.setHours(10, 0, 0, 0);
    const tasks = Array.from({ length: 8 }, () =>
      makeTask({ dueDate: today, completed: false }),
    );
    const out = generateInsights({ tasks, habits: [], goals: [] });
    expect(out.some((s) => s.id === 'today-overload')).toBe(true);
  });

  it('习惯中断 3 天触发 warn', () => {
    const last = new Date();
    last.setDate(last.getDate() - 4);
    const key = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
    const habits = [makeHabit({ completedDates: [key] })];
    const out = generateInsights({ tasks: [], habits, goals: [] });
    const h = out.find((s) => s.id === 'habit-broken');
    expect(h).toBeDefined();
    expect(h!.severity).toBe('warn');
  });

  it('预估偏差 >1.5 触发 info', () => {
    const tasks: Task[] = [];
    for (let i = 0; i < 6; i++) {
      tasks.push(makeTask({ completed: true, estimatedTime: 30, actualTime: 60 }));
    }
    const out = generateInsights({ tasks, habits: [], goals: [] });
    const est = out.find((s) => s.id === 'estimate-low');
    expect(est).toBeDefined();
    expect(est!.severity).toBe('info');
  });

  it('目标 7 天未更新触发 info', () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    const goals = [makeGoal({ updatedAt: old.toISOString(), keyResults: [{ id: 'k1', title: 'kr', type: 'quantitative', target: 10, current: 1 }] })];
    const out = generateInsights({ tasks: [], habits: [], goals });
    expect(out.some((s) => s.id === 'goal-stale')).toBe(true);
  });

  it('critical 排在 warn 之前,warn 排在 info 之前', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const tasks: Task[] = [
      ...Array.from({ length: 6 }, () => makeTask({ dueDate: yesterday, completed: false })),
      ...Array.from({ length: 5 }, () => makeTask({ priority: 'critical', completed: false })),
    ];
    const out = generateInsights({ tasks, habits: [], goals: [] });
    const severities = out.map((s) => s.severity);
    const firstWarnIdx = severities.indexOf('warn');
    const firstCriticalIdx = severities.indexOf('critical');
    const firstInfoIdx = severities.indexOf('info');
    expect(firstCriticalIdx).toBeLessThan(firstWarnIdx);
    // info 可能不存在;若存在则排在 warn 之后
    if (firstInfoIdx !== -1) {
      expect(firstWarnIdx).toBeLessThan(firstInfoIdx);
    }
  });
});
