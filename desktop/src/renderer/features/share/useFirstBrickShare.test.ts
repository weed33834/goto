// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFirstBrickShare } from './useFirstBrickShare';
import type { Task } from '../../../shared/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'test task',
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
    version: 0,
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

describe('useFirstBrickShare', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('初始无任务时,shareTask = null', () => {
    const { result } = renderHook(() => useFirstBrickShare([]));
    expect(result.current.shareTask).toBeNull();
  });

  it('从 0 → 1 完成任务跳变时,触发 shareTask', () => {
    // 用闭包变量绕过 renderHook 的 props 泛型推导
    let tasks: Task[] = [];
    const { result, rerender } = renderHook(() => useFirstBrickShare(tasks));

    expect(result.current.shareTask).toBeNull();

    tasks = [
      makeTask({
        id: 't1',
        completed: true,
        completedAt: new Date('2026-07-18T10:00:00Z'),
      }),
    ];
    rerender();

    expect(result.current.shareTask).not.toBeNull();
    expect(result.current.shareTask?.id).toBe('t1');
  });

  it('本会话已弹过则不再触发(即便再次 0→1)', () => {
    sessionStorage.setItem('goto:shareModalShown', '1');

    let tasks: Task[] = [];
    const { result, rerender } = renderHook(() => useFirstBrickShare(tasks));

    tasks = [
      makeTask({
        id: 't1',
        completed: true,
        completedAt: new Date(),
      }),
    ];
    rerender();

    expect(result.current.shareTask).toBeNull();
  });

  it('dismiss 后 shareTask 清空', () => {
    let tasks: Task[] = [];
    const { result, rerender } = renderHook(() => useFirstBrickShare(tasks));

    tasks = [
      makeTask({
        id: 't1',
        completed: true,
        completedAt: new Date(),
      }),
    ];
    rerender();
    expect(result.current.shareTask).not.toBeNull();

    act(() => result.current.dismiss());
    expect(result.current.shareTask).toBeNull();
  });

  it('已是多块砖状态(初始就 >0)不触发', () => {
    const completed = makeTask({
      completed: true,
      completedAt: new Date(),
    });
    const { result } = renderHook(() => useFirstBrickShare([completed]));
    // 首次加载已有 1 个完成(prevCompletedCount = -1 → 1)
    expect(result.current.shareTask).toBeNull();
  });
});
