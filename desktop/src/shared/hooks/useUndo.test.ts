import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../store';
import type { Task } from '../types';

import {
  pushUndo,
  popUndo,
  undoDeleteTask,
} from './useUndo';

// Fixtures

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date('2026-05-01T10:30:00.000Z');
  return {
    id: 'task-1',
    title: 'Test task',
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

// The undoStack lives at module scope inside useUndo.ts and is not directly
// exported. Drain it via popUndo before each test so tests are isolated.
function drainUndoStack() {
  while (popUndo() !== null) {
    /* drop */
  }
}

beforeEach(() => {
  drainUndoStack();
  useAppStore.setState({
    tasks: [],
    projects: [],
    selectedProject: null,
    selectedTask: null,
    apiAvailable: false,
  });
});

// Tests

describe('useUndo — pushUndo / popUndo stack', () => {
  it('popUndo returns null when the stack is empty', () => {
    expect(popUndo()).toBeNull();
  });

  it('pushUndo then popUndo returns the action (LIFO)', () => {
    const undo = vi.fn();
    pushUndo({ type: 'task', data: { a: 1 }, undo, message: 'deleted task' });
    const action = popUndo();
    expect(action).not.toBeNull();
    expect(action!.type).toBe('task');
    expect(action!.message).toBe('deleted task');
    expect(action!.data).toEqual({ a: 1 });
    expect(typeof action!.undo).toBe('function');
    expect(action!.id).toEqual(expect.any(String));
    expect(action!.id.length).toBeGreaterThan(0);
  });

  it('uses LIFO order: the last pushed action is popped first', () => {
    pushUndo({ type: 'task', data: 1, undo: () => {}, message: 'one' });
    pushUndo({ type: 'project', data: 2, undo: () => {}, message: 'two' });
    expect(popUndo()!.message).toBe('two');
    expect(popUndo()!.message).toBe('one');
    expect(popUndo()).toBeNull();
  });

  it('generates unique ids for each pushed action', () => {
    pushUndo({ type: 'task', data: 1, undo: () => {}, message: 'a' });
    pushUndo({ type: 'task', data: 2, undo: () => {}, message: 'b' });
    const ids = new Set<string>();
    let action = popUndo();
    if (action) ids.add(action.id);
    action = popUndo();
    if (action) ids.add(action.id);
    expect(ids.size).toBe(2);
  });
});

describe('useUndo — undoDeleteTask', () => {
  // 新实现不再用 setTimeout reorder,但保留 fake timers 以兼容可能的未来扩展
  // (旧实现用 setTimeout(0) 做 reorder,新实现直接 setState 无需 timer)。
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-adds the task to the store (preserving original id) and pops the undo stack', () => {
    const before = useAppStore.getState().tasks;
    expect(before).toHaveLength(0);

    // Seed the undo stack so we can assert undoDeleteTask pops one entry.
    pushUndo({ type: 'task', data: null, undo: () => {}, message: 'pending' });
    expect(popUndo()).not.toBeNull(); // confirm seeded
    pushUndo({ type: 'task', data: null, undo: () => {}, message: 'to-pop' });

    const task = makeTask({ id: 'deleted-task', title: 'Buy milk' });
    undoDeleteTask(task);

    // 新实现直接 setState 把原 task 完整对象追加回 tasks,
    // 保留原 id/createdAt/updatedAt(不走 addTask 重新生成),
    // 否则后续 API update/delete 找不到记录。
    const tasks = useAppStore.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Buy milk');
    expect(tasks[0].id).toBe('deleted-task');

    // undoDeleteTask must have popped one action from the stack.
    expect(popUndo()).toBeNull();
  });

  it('appends restored task to the end without disturbing existing tasks', () => {
    // Pre-populate the store with an unrelated task so the array isn't empty.
    useAppStore.getState().addTask({
      title: 'Existing',
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
    });

    const before = useAppStore.getState().tasks;
    expect(before).toHaveLength(1);
    const beforeFirstId = before[0].id;

    undoDeleteTask(makeTask({ id: 'deleted-task', title: 'Restored' }));

    // Two tasks now; the original stays at index 0, the restored one appended.
    const after = useAppStore.getState().tasks;
    expect(after).toHaveLength(2);
    expect(after[0].id).toBe(beforeFirstId);
    expect(after[0].title).toBe('Existing');
    expect(after[1].title).toBe('Restored');
    expect(after[1].id).toBe('deleted-task');
  });

  it('is idempotent: repeated undo on same task id is a no-op', () => {
    const task = makeTask({ id: 'unique-task', title: 'Once' });
    pushUndo({ type: 'task', data: task, undo: () => {}, message: 'first' });
    undoDeleteTask(task);
    expect(useAppStore.getState().tasks).toHaveLength(1);

    // 第二次调 undoDeleteTask 应跳过(task 已存在),但仍 popUndo。
    pushUndo({ type: 'task', data: task, undo: () => {}, message: 'second' });
    undoDeleteTask(task);
    expect(useAppStore.getState().tasks).toHaveLength(1);
  });
});
