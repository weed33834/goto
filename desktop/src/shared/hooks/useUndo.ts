// Undo 栈 — 模块级单例,记录用户最近的可撤销动作。
//
// P0 修复:之前实现完整但 0 生产调用点,TaskCard 删除直接调 deleteTask 无 undo,
// 误删数据无法恢复。本模块被 tasksSlice.deleteTask 集成,删除时 push 到栈,
// Toaster 渲染"撤销"按钮时调 actionFn → undoDeleteTask 恢复。
//
// 设计:
// - 模块级变量(不放进 store state),避免持久化/序列化
// - MAX_UNDO_STACK=20,超出按 FIFO 丢弃
// - listeners 用于未来 hook 订阅(目前 Toaster 不需要订阅,直接读 action.data)
import { useAppStore } from '../store';
import type { Task, VaultItem, Habit } from '../types';

type UndoableAction = {
  id: string;
  type: 'task' | 'project' | 'note' | 'goal' | 'habit' | 'view' | 'category' | 'tag' | 'template' | 'automation' | 'vault';
  data: unknown;
  undo: () => void;
  message: string;
};

const MAX_UNDO_STACK = 20;

const undoStack: UndoableAction[] = [];
let listeners: Array<(action: UndoableAction | null) => void> = [];

function notify() {
  for (const l of listeners) {
    l(undoStack[0] || null);
  }
}

export function pushUndo(action: Omit<UndoableAction, 'id'>) {
  // 简单 id 生成,避免 import generateId 触发循环依赖
  const id = `undo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  undoStack.unshift({ id, ...action });
  if (undoStack.length > MAX_UNDO_STACK) {
    undoStack.length = MAX_UNDO_STACK;
  }
  notify();
}

export function popUndo(): UndoableAction | null {
  const action = undoStack.shift() || null;
  notify();
  return action;
}

export function peekUndo(): UndoableAction | null {
  return undoStack[0] || null;
}

export function clearUndoStack(): void {
  undoStack.length = 0;
  notify();
}

export function subscribeUndo(listener: (action: UndoableAction | null) => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/**
 * 撤销任务删除:直接把原 task 完整对象(保留 id/createdAt/updatedAt)
 * 追加回 tasks 数组,并落盘。
 *
 * 注意:不走 addTask,因为 addTask 会重新生成 id/createdAt/updatedAt,
 * 覆盖原任务的标识,导致后续 API update/delete 找不到记录。
 *
 * 顺序:追加到数组末尾。原位置已无法恢复(delete 时已从原数组移除),
 * 但任务数据完整恢复,顺序丢失可接受。
 *
 * 幂等:如果 task 已存在(用户重复点 Undo),跳过。
 */
export function undoDeleteTask(task: Task) {
  const state = useAppStore.getState();
  if (state.tasks.some((t) => t.id === task.id)) {
    popUndo();
    return;
  }
  useAppStore.setState({ tasks: [...state.tasks, task] });
  useAppStore.getState().saveData();
  popUndo();
}

/**
 * 撤销保险库项删除:把原 VaultItem 完整对象追加回 vaultItems 数组,并落盘。
 * 幂等:已存在则跳过(用户重复点 Undo)。
 */
export function undoDeleteVaultItem(item: VaultItem) {
  const state = useAppStore.getState();
  if (state.vaultItems.some((v) => v.id === item.id)) {
    popUndo();
    return;
  }
  useAppStore.setState({ vaultItems: [...state.vaultItems, item] });
  useAppStore.getState().saveData();
  popUndo();
}

/**
 * 撤销习惯删除:把原 Habit 完整对象追加回 habits 数组,并落盘。
 * 幂等:已存在则跳过(用户重复点 Undo)。
 */
export function undoDeleteHabit(habit: Habit) {
  const state = useAppStore.getState();
  if (state.habits.some((h) => h.id === habit.id)) {
    popUndo();
    return;
  }
  useAppStore.setState({ habits: [...state.habits, habit] });
  useAppStore.getState().saveData();
  popUndo();
}
