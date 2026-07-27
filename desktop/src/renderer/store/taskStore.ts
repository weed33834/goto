import { create } from 'zustand';
import type { Task } from '../../shared/types';
import { useAppStore } from '../../shared/store';

interface TaskState {
  tasks: Task[];
  loading: boolean;
  fetch: () => Promise<void>;
  create: (task: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> & Pick<Task, 'title'>) => Promise<void>;
  update: (id: string, updates: Partial<Task>) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

// 统一数据层:本 store 仅作为共享 store(useAppStore)的薄封装。
// 通过订阅 useAppStore 使 tasks 始终与 loadData 读取的源(goto-async-storage)
// 保持一致。
//
// P0-3 修复:写操作改走 useAppStore.getState().addTask/updateTask/deleteTask,
// 激活 tasksSlice 已有的 notification(同步失败提示)+ undo(误删撤销)逻辑。
// 之前直接走 window.gotoAPI.tasks.* 是 bypass,用户删除任务无 toast 无撤销入口。
export const useTaskStore = create<TaskState>((set, get) => {
  useAppStore.subscribe((state) => {
    if (state.tasks !== get().tasks) set({ tasks: state.tasks });
  });

  return {
    tasks: useAppStore.getState().tasks,
    loading: false,
    fetch: async () => {
      set({ loading: true });
      await useAppStore.getState().loadData();
      set({ tasks: useAppStore.getState().tasks, loading: false });
    },
    create: async (task) => {
      // 走 useAppStore.addTask 激活 notification + undo(若 apiAvailable=true 还会触发 API 同步)
      // addTask 期望 Omit<Task, 'id'|'createdAt'|'updatedAt'>(非 Partial),但本 store 接收 Partial。
      // webAPI.tasks.create 之前用 spread + 默认值补齐,这里复用同样逻辑保证类型安全。
      const defaults: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = {
        title: task.title,
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
      };
      useAppStore.getState().addTask({ ...defaults, ...task });
    },
    update: async (id, updates) => {
      useAppStore.getState().updateTask(id, updates);
    },
    delete: async (id) => {
      useAppStore.getState().deleteTask(id);
    },
  };
});
