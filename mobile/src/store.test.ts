import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '@shared/store';
import { buildTaskInput, isTodayTask } from './lib/taskInput';
import type { Task } from '@shared/types';

// 构造完整 Task(补上 addTask 自动生成的三个字段),用于需要完整类型的断言。
function fullTask(overrides: Partial<Task> = {}): Task {
  return { ...buildTaskInput(), id: 't1', createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

beforeEach(() => {
  // 重置关键状态避免跨测试污染;mock 本地落盘(无 IndexedDB 的测试环境)。
  vi.spyOn(useAppStore.getState(), 'saveData').mockResolvedValue(undefined);
  useAppStore.setState({ tasks: [], selectedTask: null, apiAvailable: false });
});

describe('shared store 复用(移动端内核)', () => {
  it('addTask 返回非空 id 且任务入库', () => {
    const id = useAppStore.getState().addTask(buildTaskInput({ title: '买牛奶' }));
    expect(id).toBeTruthy();
    expect(useAppStore.getState().tasks).toHaveLength(1);
    expect(useAppStore.getState().tasks[0].title).toBe('买牛奶');
  });

  it('toggleTaskComplete 切换 completed 与 status', () => {
    const id = useAppStore.getState().addTask(buildTaskInput({ title: 'A' }));
    expect(useAppStore.getState().tasks[0].completed).toBe(false);
    useAppStore.getState().toggleTaskComplete(id);
    const task = useAppStore.getState().tasks[0];
    expect(task.completed).toBe(true);
    expect(task.status).toBe('completed');
    useAppStore.getState().toggleTaskComplete(id);
    expect(useAppStore.getState().tasks[0].completed).toBe(false);
  });

  it('deleteTask 移除任务', () => {
    const id = useAppStore.getState().addTask(buildTaskInput({ title: 'A' }));
    useAppStore.getState().deleteTask(id);
    expect(useAppStore.getState().tasks).toHaveLength(0);
  });

  it('isTodayTask:无到期日/今天到期算今日,已完成不算', () => {
    expect(isTodayTask(fullTask({ title: 'x' }))).toBe(true);
    expect(isTodayTask(fullTask({ title: 'y', dueDate: new Date() }))).toBe(true);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTodayTask(fullTask({ title: 'z', dueDate: tomorrow }))).toBe(false);
    expect(isTodayTask(fullTask({ title: 'w', completed: true }))).toBe(false);
  });
});
