// Tasks Slice — 任务管理状态
// 保持扁平结构（非归一化），因为数据集较小（<5k 任务），
// 且 FlatList 需要数组结构。若未来支持服务端同步，
// 可切换为 Record<id, Task> 索引并在 selector 中派生数组。
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { Task, Filter, SortOption, Comment, Attachment, ChecklistItem, Notification } from '../../types';
import {
  createTask as apiCreateTask,
  deleteTask as apiDeleteTask,
  updateTask as apiUpdateTask,
} from '../../api';
import { generateId, deepClone } from '../constants';
import { pluginManager } from '../../plugins';
import { pushUndo, undoDeleteTask } from '../../hooks/useUndo';

/**
 * P0 修复:把所有"用户可见反馈"从 console.log 改成真实通知。
 *
 * 之前 toast.error/success/info 只 console.warn/log,API 失败用户看不到任何提示。
 * 现在 push 到 uiSlice.notifications,Toaster 组件会渲染并 5 秒自动消失。
 *
 * slice 直接调 get().addNotification(...) 而非 toast lib,避免引入 UI 库耦合 store 层。
 * useAppStore.getState() 在 slice 内通过 get() 取(同一 store),无循环依赖。
 */
function pushNotification(
  get: () => AppStore,
  params: {
    type: Notification['type'];
    title: string;
    message?: string;
    data?: Record<string, unknown>;
  },
): void {
  const notification: Notification = {
    id: `n-${generateId()}`,
    type: params.type,
    title: params.title,
    message: params.message ?? '',
    data: params.data ?? {},
    isRead: false,
    isArchived: false,
    actionUrl: null,
    createdAt: new Date(),
  };
  get().addNotification(notification);
}

export interface TasksSlice {
  tasks: Task[];
  selectedTask: Task | null;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  selectTask: (task: Task | null) => void;
  toggleTaskComplete: (id: string) => void;
  archiveTask: (id: string) => void;
  restoreTask: (id: string) => void;
  duplicateTask: (id: string) => void;
  moveTask: (id: string, targetId: string) => void;
  sortTasks: (tasks: Task[], sortOptions: SortOption[]) => Task[];
  filterTasks: (tasks: Task[], filters: Filter[]) => Task[];

  addSubtask: (taskId: string, subtask: { id: string; title: string; completed: boolean; order: number }) => void;
  updateSubtask: (taskId: string, subtaskId: string, updates: Partial<{ id: string; title: string; completed: boolean; order: number }>) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;
  addComment: (taskId: string, comment: { id: string; content: string; authorId: string; authorName: string; createdAt: Date; updatedAt: Date }) => void;
  addAttachment: (taskId: string, attachment: Attachment) => void;
  addChecklistItem: (taskId: string, item: { id: string; text: string; completed: boolean; order: number }) => void;
  toggleChecklistItem: (taskId: string, itemId: string) => void;
  deleteChecklistItem: (taskId: string, itemId: string) => void;
  addTagToTask: (taskId: string, tagId: string) => void;
  removeTagFromTask: (taskId: string, tagId: string) => void;
  reorderTasks: (tasks: Task[]) => void;
}

export const createTasksSlice: StateCreator<AppStore, [], [], TasksSlice> = (set, get) => ({
  tasks: [],
  selectedTask: null,

  addTask: (task) => {
    const overrides = pluginManager.invokeSync('taskBeforeCreate', task);
    const mergedTask = overrides ? { ...task, ...overrides } : task;

    const id = generateId();
    const newTask: Task = {
      ...mergedTask,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    set((state) => ({ tasks: [...state.tasks, newTask] }));
    get().saveData();

    if (get().apiAvailable) {
      const tempId = id;
      apiCreateTask({ ...mergedTask, id })
        .then((created) => {
          // 仅替换 id,保留本地最新字段(用户可能在 API 期间又对 tempId 做了 update,
          // 全量用 created 覆盖会丢失这些乐观更新 — P0 乐观写竞争)
          set((state) => ({
            tasks: state.tasks.map((t) =>
              t.id === tempId ? { ...t, id: created.id } : t,
            ),
          }));
          get().saveData();
        })
        .catch((error) => {
          console.warn('API create task failed:', error);
          set((state) => ({
            tasks: state.tasks.filter((t) => t.id !== tempId),
          }));
          get().saveData();
          pushNotification(get, {
            type: 'task',
            title: '同步失败',
            message: '任务创建未保存到服务器,已回滚本地数据',
          });
        });
    }

    return id;
  },

  updateTask: (id, updates) => {
    const previousTask = get().tasks.find((t) => t.id === id);
    // 记录 inflight 时间戳:API 失败回滚前用它判定 task 是否被进一步修改
    // (如果用户在 API 失败的窗口内又改了同一 task,t.updatedAt 会不同,不回滚 — P0 乐观写竞争)
    const inflightUpdatedAt = new Date();
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, ...updates, updatedAt: inflightUpdatedAt } : task
      ),
    }));
    get().saveData();

    if (get().apiAvailable) {
      apiUpdateTask(id, updates).catch((error) => {
        console.warn('API update task failed:', error);
        if (previousTask) {
          set((state) => ({
            tasks: state.tasks.map((t) => {
              if (t.id !== id) return t;
              // 只在 task 还是我们 set 进去的版本时回滚;
              // 若 t.updatedAt 已不同(用户期间又 update),保留用户最新修改
              if (t.updatedAt.getTime() === inflightUpdatedAt.getTime()) {
                return previousTask;
              }
              return t;
            }),
          }));
          get().saveData();
        }
        pushNotification(get, {
          type: 'task',
          title: '同步失败',
          message: '任务更新未保存到服务器,已回滚',
        });
      });
    }
  },

  deleteTask: (id) => {
    const deletedTask = get().tasks.find((t) => t.id === id);
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
      selectedTask: state.selectedTask?.id === id ? null : state.selectedTask,
    }));
    get().saveData();

    // P0 修复:删除时推入 undo 栈 + 弹 toast 给"撤销"入口。
    // 之前 useUndo 实现完整但 0 调用点,误删无法恢复。
    if (deletedTask) {
      pushUndo({
        type: 'task',
        data: deletedTask,
        message: `已删除"${deletedTask.title}"`,
        undo: () => undoDeleteTask(deletedTask),
      });
      pushNotification(get, {
        type: 'task',
        title: '已删除任务',
        message: deletedTask.title,
        data: {
          actionLabel: '撤销',
          actionFn: () => undoDeleteTask(deletedTask),
        },
      });
    }

    if (get().apiAvailable) {
      apiDeleteTask(id).catch((error) => {
        console.warn('API delete task failed:', error);
        if (deletedTask) {
          set((state) => ({
            tasks: [...state.tasks, deletedTask],
          }));
          get().saveData();
        }
        pushNotification(get, {
          type: 'task',
          title: '同步失败',
          message: '任务删除未同步到服务器,已恢复',
        });
      });
    }
  },

  selectTask: (task) => set({ selectedTask: task }),

  toggleTaskComplete: (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (task) {
      get().updateTask(id, {
        completed: !task.completed,
        completedAt: !task.completed ? new Date() : null,
        status: !task.completed ? 'completed' : 'todo',
      });
    }
  },

  archiveTask: (id) => {
    get().updateTask(id, { isArchived: true });
  },

  restoreTask: (id) => {
    get().updateTask(id, { isArchived: false });
  },

  duplicateTask: (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (task) {
      const { id: _, createdAt: __, updatedAt: ___, ...taskData } = deepClone(task);
      get().addTask(taskData as Omit<Task, 'id' | 'createdAt' | 'updatedAt'>);
    }
  },

  moveTask: (id, targetId) => {
    const tasks = get().tasks;
    const taskIndex = tasks.findIndex((t) => t.id === id);
    const targetIndex = tasks.findIndex((t) => t.id === targetId);
    if (taskIndex !== -1 && targetIndex !== -1) {
      const newTasks = [...tasks];
      const [task] = newTasks.splice(taskIndex, 1);
      newTasks.splice(targetIndex, 0, task);
      set({ tasks: newTasks });
      get().saveData();
    }
  },

  sortTasks: (tasks, sortOptions) => {
    return [...tasks].sort((a, b) => {
      for (const option of sortOptions) {
        const aVal = (a as unknown as Record<string, unknown>)[option.field];
        const bVal = (b as unknown as Record<string, unknown>)[option.field];
        if (aVal === bVal) continue;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        const comparison = (aVal as number | string | Date) < (bVal as number | string | Date) ? -1 : 1;
        return option.direction === 'asc' ? comparison : -comparison;
      }
      return 0;
    });
  },

  filterTasks: (tasks, filters) => {
    return tasks.filter((task) => {
      return filters.every((filter) => {
        const value = (task as unknown as Record<string, unknown>)[filter.field];
        const filterValue = filter.value;
        switch (filter.operator) {
          case 'equals':
            return value === filterValue;
          case 'not-equals':
            return value !== filterValue;
          case 'contains':
            return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
          case 'greater-than':
            return (value as number | string | Date) > (filterValue as number | string | Date);
          case 'less-than':
            return (value as number | string | Date) < (filterValue as number | string | Date);
          case 'in':
            return (filterValue as string[] | string).includes(value as string);
          case 'is-empty':
            return value === null || value === undefined || value === '';
          case 'is-not-empty':
            return value !== null && value !== undefined && value !== '';
          default:
            return true;
        }
      });
    });
  },

  addSubtask: (taskId, subtask) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (task) {
      get().updateTask(taskId, { subtasks: [...task.subtasks, subtask] });
    }
  },

  updateSubtask: (taskId, subtaskId, updates) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (task) {
      get().updateTask(taskId, {
        subtasks: task.subtasks.map((s) => (s.id === subtaskId ? { ...s, ...updates } : s)),
      });
    }
  },

  deleteSubtask: (taskId, subtaskId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (task) {
      get().updateTask(taskId, { subtasks: task.subtasks.filter((s) => s.id !== subtaskId) });
    }
  },

  addComment: (taskId, comment) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (task) {
      const newComment: Comment = {
        id: comment.id,
        content: comment.content,
        authorId: comment.authorId,
        authorName: comment.authorName,
        authorAvatar: undefined,
        taskId,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        mentions: [],
        likes: 0,
        isEdited: false,
        parentCommentId: null,
        replies: [],
      };
      get().updateTask(taskId, { comments: [...task.comments, newComment] });
    }
  },

  addAttachment: (taskId, attachment) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (task) {
      get().updateTask(taskId, { attachments: [...task.attachments, attachment] });
    }
  },

  addChecklistItem: (taskId, item) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (task) {
      const newItem: ChecklistItem = {
        id: item.id,
        text: item.text,
        completed: item.completed,
        completedAt: item.completed ? new Date() : null,
        order: item.order,
        dueDate: null,
        assigneeId: null,
        createdAt: new Date(),
      };
      get().updateTask(taskId, { checklist: [...task.checklist, newItem] });
    }
  },

  toggleChecklistItem: (taskId, itemId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (task) {
      get().updateTask(taskId, {
        checklist: task.checklist.map((c) =>
          c.id === itemId
            ? { ...c, completed: !c.completed, completedAt: !c.completed ? new Date() : null }
            : c
        ),
      });
    }
  },

  deleteChecklistItem: (taskId, itemId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (task) {
      get().updateTask(taskId, { checklist: task.checklist.filter((c) => c.id !== itemId) });
    }
  },

  addTagToTask: (taskId, tagId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (task && !task.tags.includes(tagId)) {
      get().updateTask(taskId, { tags: [...task.tags, tagId] });
    }
  },

  removeTagFromTask: (taskId, tagId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (task) {
      get().updateTask(taskId, { tags: task.tags.filter((t) => t !== tagId) });
    }
  },

  reorderTasks: (orderedTasks) => {
    const allTasks = get().tasks;
    const map = new Map(orderedTasks.map((t, idx) => [t.id, idx]));
    const next = allTasks.map((t) => {
      const newOrder = map.get(t.id);
      if (newOrder !== undefined) return { ...t, order: newOrder };
      return t;
    });
    set({ tasks: next });
    get().saveData();
  },
});
