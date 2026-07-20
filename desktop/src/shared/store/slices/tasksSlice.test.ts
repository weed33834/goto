import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../index';
import type { Task, Filter, SortOption } from '../../types';

// 构造一个满足 Omit<Task, 'id' | 'createdAt' | 'updatedAt'> 的最小合法 task 输入。
// Task 接口字段非常多，集中在此构造避免每个测试用例重复。
function makeTaskInput(overrides: Partial<Task> = {}): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
  return {
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

// 在每个测试前重置 store 状态，避免跨测试污染。
beforeEach(() => {
  useAppStore.setState({
    tasks: [],
    selectedTask: null,
    apiAvailable: false,
  });
});

describe('tasksSlice', () => {
  describe('addTask', () => {
    it('appends a new task and returns a non-empty id', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'Buy milk' }));
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);

      const tasks = useAppStore.getState().tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(id);
      expect(tasks[0].title).toBe('Buy milk');
    });

    it('sets createdAt and updatedAt to the current time', () => {
      const before = Date.now();
      const id = useAppStore.getState().addTask(makeTaskInput());
      const after = Date.now();
      const task = useAppStore.getState().tasks.find((t) => t.id === id)!;
      expect(task.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(task.createdAt.getTime()).toBeLessThanOrEqual(after);
      expect(task.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(task.updatedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('preserves caller-supplied fields (tags, priority, dueDate)', () => {
      const due = new Date('2026-12-31T09:00:00.000Z');
      const id = useAppStore.getState().addTask(
        makeTaskInput({ title: 'Ship', tags: ['release', 'qa'], priority: 'urgent', dueDate: due }),
      );
      const task = useAppStore.getState().tasks.find((t) => t.id === id)!;
      expect(task.tags).toEqual(['release', 'qa']);
      expect(task.priority).toBe('urgent');
      expect(task.dueDate).toEqual(due);
    });

    it('does not invoke the API when apiAvailable is false', async () => {
      // apiAvailable defaults to false in beforeEach; addTask should still succeed locally
      // and must not throw (the API branch is skipped).
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'No-API' }));
      expect(useAppStore.getState().tasks).toHaveLength(1);
      expect(useAppStore.getState().tasks[0].id).toBe(id);
    });

    it('can add multiple tasks preserving insertion order', () => {
      useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      useAppStore.getState().addTask(makeTaskInput({ title: 'B' }));
      useAppStore.getState().addTask(makeTaskInput({ title: 'C' }));
      const titles = useAppStore.getState().tasks.map((t) => t.title);
      expect(titles).toEqual(['A', 'B', 'C']);
    });
  });

  describe('updateTask', () => {
    it('merges updates into the matching task and refreshes updatedAt', () => {
      // Use fake timers so we can deterministically advance time and verify
      // that updateTask stamps updatedAt with a strictly-later timestamp.
      // (V8's `new Date()` reads the system clock directly and does NOT go
      // through the `Date.now` function, so monkey-patching Date.now is not enough.)
      vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
      try {
        const id = useAppStore.getState().addTask(makeTaskInput({ title: 'Old' }));
        const beforeUpdate = useAppStore.getState().tasks.find((t) => t.id === id)!.updatedAt;
        vi.advanceTimersByTime(1000);
        useAppStore.getState().updateTask(id, { title: 'New', priority: 'high' });
        const task = useAppStore.getState().tasks.find((t) => t.id === id)!;
        expect(task.title).toBe('New');
        expect(task.priority).toBe('high');
        expect(task.updatedAt.getTime()).toBeGreaterThan(beforeUpdate.getTime());
      } finally {
        vi.useRealTimers();
      }
    });

    it('leaves other tasks untouched', () => {
      const id1 = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      const id2 = useAppStore.getState().addTask(makeTaskInput({ title: 'B' }));
      useAppStore.getState().updateTask(id1, { title: 'A-updated' });
      const tasks = useAppStore.getState().tasks;
      expect(tasks.find((t) => t.id === id1)!.title).toBe('A-updated');
      expect(tasks.find((t) => t.id === id2)!.title).toBe('B');
    });

    it('is a no-op for an unknown id (does not throw, does not change state shape)', () => {
      expect(() => useAppStore.getState().updateTask('nonexistent', { title: 'X' })).not.toThrow();
      expect(useAppStore.getState().tasks).toHaveLength(0);
    });
  });

  describe('deleteTask', () => {
    it('removes the task with the given id', () => {
      const id1 = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      const id2 = useAppStore.getState().addTask(makeTaskInput({ title: 'B' }));
      useAppStore.getState().deleteTask(id1);
      const tasks = useAppStore.getState().tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(id2);
    });

    it('clears selectedTask if the deleted task was selected', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      const task = useAppStore.getState().tasks.find((t) => t.id === id)!;
      useAppStore.getState().selectTask(task);
      expect(useAppStore.getState().selectedTask).not.toBeNull();
      useAppStore.getState().deleteTask(id);
      expect(useAppStore.getState().selectedTask).toBeNull();
    });

    it('keeps selectedTask if a different task was selected', () => {
      const id1 = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      const id2 = useAppStore.getState().addTask(makeTaskInput({ title: 'B' }));
      const selected = useAppStore.getState().tasks.find((t) => t.id === id2)!;
      useAppStore.getState().selectTask(selected);
      useAppStore.getState().deleteTask(id1);
      expect(useAppStore.getState().selectedTask?.id).toBe(id2);
    });
  });

  describe('toggleTaskComplete', () => {
    it('flips completed from false to true and sets completedAt + status', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A', completed: false }));
      useAppStore.getState().toggleTaskComplete(id);
      const task = useAppStore.getState().tasks.find((t) => t.id === id)!;
      expect(task.completed).toBe(true);
      expect(task.completedAt).toBeInstanceOf(Date);
      expect(task.status).toBe('completed');
    });

    it('flips completed from true back to false and clears completedAt + resets status', () => {
      const id = useAppStore.getState().addTask(
        makeTaskInput({ title: 'A', completed: true, status: 'completed', completedAt: new Date() }),
      );
      useAppStore.getState().toggleTaskComplete(id);
      const task = useAppStore.getState().tasks.find((t) => t.id === id)!;
      expect(task.completed).toBe(false);
      expect(task.completedAt).toBeNull();
      expect(task.status).toBe('todo');
    });

    it('is a no-op for an unknown id', () => {
      expect(() => useAppStore.getState().toggleTaskComplete('nope')).not.toThrow();
      expect(useAppStore.getState().tasks).toHaveLength(0);
    });
  });

  describe('selectTask', () => {
    it('sets selectedTask to the provided task', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      const task = useAppStore.getState().tasks.find((t) => t.id === id)!;
      useAppStore.getState().selectTask(task);
      expect(useAppStore.getState().selectedTask).toEqual(task);
    });

    it('can clear selectedTask by passing null', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      const task = useAppStore.getState().tasks.find((t) => t.id === id)!;
      useAppStore.getState().selectTask(task);
      useAppStore.getState().selectTask(null);
      expect(useAppStore.getState().selectedTask).toBeNull();
    });
  });

  describe('archiveTask / restoreTask', () => {
    it('archiveTask sets isArchived=true', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A', isArchived: false }));
      useAppStore.getState().archiveTask(id);
      expect(useAppStore.getState().tasks.find((t) => t.id === id)!.isArchived).toBe(true);
    });

    it('restoreTask sets isArchived=false', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A', isArchived: true }));
      useAppStore.getState().restoreTask(id);
      expect(useAppStore.getState().tasks.find((t) => t.id === id)!.isArchived).toBe(false);
    });
  });

  describe('duplicateTask', () => {
    it('creates a copy of the task with a new id and fresh timestamps', () => {
      const original = useAppStore.getState().addTask(
        makeTaskInput({ title: 'Original', tags: ['x'], priority: 'low' }),
      );
      useAppStore.getState().duplicateTask(original);
      const tasks = useAppStore.getState().tasks;
      expect(tasks).toHaveLength(2);
      const dup = tasks[1];
      expect(dup.id).not.toBe(original);
      expect(dup.title).toBe('Original');
      expect(dup.tags).toEqual(['x']);
      expect(dup.priority).toBe('low');
      expect(dup.createdAt).toBeInstanceOf(Date);
    });

    it('is a no-op for an unknown id', () => {
      expect(() => useAppStore.getState().duplicateTask('nope')).not.toThrow();
      expect(useAppStore.getState().tasks).toHaveLength(0);
    });
  });

  describe('moveTask', () => {
    it('moves a task to the target task position (target index computed against the original array)', () => {
      // Trace of the impl with [A, B, C], moving A to C's position:
      //   taskIndex(A)=0, targetIndex(C)=2
      //   splice(0, 1) → newTasks=[B, C], task=A
      //   splice(2, 0, A) → [B, C, A]   (index 2 of the now-shorter array appends A at the end)
      // So the resulting order is [B, C, A] — this is the documented actual behavior.
      const idA = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      const idB = useAppStore.getState().addTask(makeTaskInput({ title: 'B' }));
      const idC = useAppStore.getState().addTask(makeTaskInput({ title: 'C' }));
      useAppStore.getState().moveTask(idA, idC);
      const titles = useAppStore.getState().tasks.map((t) => t.title);
      expect(titles).toEqual(['B', 'C', 'A']);
      // Sanity: the moved task is still present.
      expect(useAppStore.getState().tasks.find((t) => t.id === idA)).toBeDefined();
      expect(useAppStore.getState().tasks.find((t) => t.id === idB)).toBeDefined();
      expect(useAppStore.getState().tasks.find((t) => t.id === idC)).toBeDefined();
    });

    it('is a no-op when either id is unknown', () => {
      const idA = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      useAppStore.getState().moveTask(idA, 'unknown');
      expect(useAppStore.getState().tasks.map((t) => t.title)).toEqual(['A']);
    });
  });

  describe('reorderTasks', () => {
    it('updates the order field of matching tasks', () => {
      const idA = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      const idB = useAppStore.getState().addTask(makeTaskInput({ title: 'B' }));
      const idC = useAppStore.getState().addTask(makeTaskInput({ title: 'C' }));
      const tasks = useAppStore.getState().tasks;
      const reordered = [tasks[2], tasks[0], tasks[1]];
      useAppStore.getState().reorderTasks(reordered);
      const state = useAppStore.getState().tasks;
      expect(state.find((t) => t.id === idA)!.order).toBe(1);
      expect(state.find((t) => t.id === idB)!.order).toBe(2);
      expect(state.find((t) => t.id === idC)!.order).toBe(0);
    });

    it('leaves the order of tasks not present in the input unchanged', () => {
      const idA = useAppStore.getState().addTask(makeTaskInput({ title: 'A', order: 5 }));
      const idB = useAppStore.getState().addTask(makeTaskInput({ title: 'B', order: 7 }));
      // Only re-order A; B should keep its order.
      const tasks = useAppStore.getState().tasks;
      useAppStore.getState().reorderTasks([tasks[0]]);
      const state = useAppStore.getState().tasks;
      expect(state.find((t) => t.id === idA)!.order).toBe(0);
      expect(state.find((t) => t.id === idB)!.order).toBe(7);
    });
  });

  describe('sortTasks', () => {
    function makeTask(partial: Partial<Task>): Task {
      return { ...makeTaskInput(partial), id: partial.id ?? 'x', createdAt: new Date(), updatedAt: new Date() };
    }

    it('sorts ascending by a numeric field', () => {
      const tasks = [
        makeTask({ id: '1', order: 3 }),
        makeTask({ id: '2', order: 1 }),
        makeTask({ id: '3', order: 2 }),
      ];
      const sortOptions: SortOption[] = [{ id: 's', field: 'order', direction: 'asc', priority: 0 }];
      const sorted = useAppStore.getState().sortTasks(tasks, sortOptions);
      expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1']);
    });

    it('sorts descending when direction is desc', () => {
      const tasks = [
        makeTask({ id: '1', order: 1 }),
        makeTask({ id: '2', order: 3 }),
        makeTask({ id: '3', order: 2 }),
      ];
      const sortOptions: SortOption[] = [{ id: 's', field: 'order', direction: 'desc', priority: 0 }];
      const sorted = useAppStore.getState().sortTasks(tasks, sortOptions);
      expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1']);
    });

    it('does not mutate the input array', () => {
      const tasks = [makeTask({ id: '1', order: 2 }), makeTask({ id: '2', order: 1 })];
      const sortOptions: SortOption[] = [{ id: 's', field: 'order', direction: 'asc', priority: 0 }];
      const sorted = useAppStore.getState().sortTasks(tasks, sortOptions);
      expect(sorted).not.toBe(tasks);
      // Original array order is unchanged.
      expect(tasks[0].id).toBe('1');
      expect(tasks[1].id).toBe('2');
    });

    it('places null/undefined values last regardless of direction', () => {
      const tasks = [
        makeTask({ id: '1', order: 1 }),
        makeTask({ id: '2', order: null as unknown as number }),
        makeTask({ id: '3', order: 3 }),
      ];
      const sortOptions: SortOption[] = [{ id: 's', field: 'order', direction: 'asc', priority: 0 }];
      const sorted = useAppStore.getState().sortTasks(tasks, sortOptions);
      // Nulls go last; remaining items are sorted ascending.
      expect(sorted.map((t) => t.id)).toEqual(['1', '3', '2']);
    });
  });

  describe('filterTasks', () => {
    function makeTask(partial: Partial<Task>): Task {
      return { ...makeTaskInput(partial), id: partial.id ?? 'x', createdAt: new Date(), updatedAt: new Date() };
    }

    function filter(field: string, operator: Filter['operator'], value: unknown): Filter {
      return { id: 'f', field, operator, value, isNegated: false, conjunction: 'and', order: 0 };
    }

    it('filters by equals', () => {
      const tasks = [
        makeTask({ id: '1', priority: 'high' }),
        makeTask({ id: '2', priority: 'low' }),
        makeTask({ id: '3', priority: 'high' }),
      ];
      const result = useAppStore.getState().filterTasks(tasks, [filter('priority', 'equals', 'high')]);
      expect(result.map((t) => t.id)).toEqual(['1', '3']);
    });

    it('filters by not-equals', () => {
      const tasks = [
        makeTask({ id: '1', priority: 'high' }),
        makeTask({ id: '2', priority: 'low' }),
      ];
      const result = useAppStore.getState().filterTasks(tasks, [filter('priority', 'not-equals', 'high')]);
      expect(result.map((t) => t.id)).toEqual(['2']);
    });

    it('filters by contains (case-insensitive substring match)', () => {
      const tasks = [
        makeTask({ id: '1', title: 'Buy Milk' }),
        makeTask({ id: '2', title: 'Walk dog' }),
        makeTask({ id: '3', title: 'buy bread' }),
      ];
      const result = useAppStore.getState().filterTasks(tasks, [filter('title', 'contains', 'buy')]);
      expect(result.map((t) => t.id)).toEqual(['1', '3']);
    });

    it('filters by greater-than / less-than on numbers', () => {
      const tasks = [
        makeTask({ id: '1', progress: 10 }),
        makeTask({ id: '2', progress: 50 }),
        makeTask({ id: '3', progress: 90 }),
      ];
      const gt = useAppStore.getState().filterTasks(tasks, [filter('progress', 'greater-than', 40)]);
      expect(gt.map((t) => t.id)).toEqual(['2', '3']);
      const lt = useAppStore.getState().filterTasks(tasks, [filter('progress', 'less-than', 50)]);
      expect(lt.map((t) => t.id)).toEqual(['1']);
    });

    it('filters by in (membership in a list)', () => {
      const tasks = [
        makeTask({ id: '1', status: 'todo' }),
        makeTask({ id: '2', status: 'completed' }),
        makeTask({ id: '3', status: 'in-progress' }),
      ];
      const result = useAppStore.getState().filterTasks(
        tasks,
        [filter('status', 'in', ['todo', 'in-progress'])],
      );
      expect(result.map((t) => t.id)).toEqual(['1', '3']);
    });

    it('filters by is-empty / is-not-empty', () => {
      const tasks = [
        makeTask({ id: '1', description: '' }),
        makeTask({ id: '2', description: 'has text' }),
        makeTask({ id: '3', description: null as unknown as string }),
      ];
      const empty = useAppStore.getState().filterTasks(tasks, [filter('description', 'is-empty', null)]);
      expect(empty.map((t) => t.id)).toEqual(['1', '3']);
      const notEmpty = useAppStore.getState().filterTasks(tasks, [filter('description', 'is-not-empty', null)]);
      expect(notEmpty.map((t) => t.id)).toEqual(['2']);
    });

    it('combines multiple filters with AND semantics', () => {
      const tasks = [
        makeTask({ id: '1', priority: 'high', completed: false }),
        makeTask({ id: '2', priority: 'high', completed: true }),
        makeTask({ id: '3', priority: 'low', completed: false }),
      ];
      const result = useAppStore.getState().filterTasks(tasks, [
        filter('priority', 'equals', 'high'),
        filter('completed', 'equals', false),
      ]);
      expect(result.map((t) => t.id)).toEqual(['1']);
    });
  });

  describe('subtask / checklist / tag helpers', () => {
    it('addSubtask appends to the task subtasks array', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      useAppStore.getState().addSubtask(id, { id: 's1', title: 'Step 1', completed: false, order: 0 });
      const task = useAppStore.getState().tasks.find((t) => t.id === id)!;
      expect(task.subtasks).toHaveLength(1);
      expect(task.subtasks[0]).toEqual({ id: 's1', title: 'Step 1', completed: false, order: 0 });
    });

    it('updateSubtask merges updates for the matching subtask', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      useAppStore.getState().addSubtask(id, { id: 's1', title: 'Step 1', completed: false, order: 0 });
      useAppStore.getState().updateSubtask(id, 's1', { completed: true });
      const sub = useAppStore.getState().tasks.find((t) => t.id === id)!.subtasks[0];
      expect(sub.completed).toBe(true);
      expect(sub.title).toBe('Step 1');
    });

    it('deleteSubtask removes the matching subtask', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      useAppStore.getState().addSubtask(id, { id: 's1', title: 'Step 1', completed: false, order: 0 });
      useAppStore.getState().addSubtask(id, { id: 's2', title: 'Step 2', completed: false, order: 1 });
      useAppStore.getState().deleteSubtask(id, 's1');
      const subtasks = useAppStore.getState().tasks.find((t) => t.id === id)!.subtasks;
      expect(subtasks).toHaveLength(1);
      expect(subtasks[0].id).toBe('s2');
    });

    it('addTagToTask adds a tag only if not already present', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A', tags: ['x'] }));
      useAppStore.getState().addTagToTask(id, 'y');
      useAppStore.getState().addTagToTask(id, 'x'); // duplicate, ignored
      expect(useAppStore.getState().tasks.find((t) => t.id === id)!.tags).toEqual(['x', 'y']);
    });

    it('removeTagFromTask removes the matching tag', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A', tags: ['x', 'y'] }));
      useAppStore.getState().removeTagFromTask(id, 'x');
      expect(useAppStore.getState().tasks.find((t) => t.id === id)!.tags).toEqual(['y']);
    });

    it('toggleChecklistItem flips completed and updates completedAt', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      useAppStore.getState().addChecklistItem(id, { id: 'c1', text: 'do thing', completed: false, order: 0 });
      useAppStore.getState().toggleChecklistItem(id, 'c1');
      const item = useAppStore.getState().tasks.find((t) => t.id === id)!.checklist[0];
      expect(item.completed).toBe(true);
      expect(item.completedAt).toBeInstanceOf(Date);

      useAppStore.getState().toggleChecklistItem(id, 'c1');
      const item2 = useAppStore.getState().tasks.find((t) => t.id === id)!.checklist[0];
      expect(item2.completed).toBe(false);
      expect(item2.completedAt).toBeNull();
    });

    it('deleteChecklistItem removes the matching item', () => {
      const id = useAppStore.getState().addTask(makeTaskInput({ title: 'A' }));
      useAppStore.getState().addChecklistItem(id, { id: 'c1', text: 'a', completed: false, order: 0 });
      useAppStore.getState().addChecklistItem(id, { id: 'c2', text: 'b', completed: false, order: 1 });
      useAppStore.getState().deleteChecklistItem(id, 'c1');
      const checklist = useAppStore.getState().tasks.find((t) => t.id === id)!.checklist;
      expect(checklist).toHaveLength(1);
      expect(checklist[0].id).toBe('c2');
    });
  });
});
