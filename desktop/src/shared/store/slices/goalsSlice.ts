// Goals Slice — OKR 目标管理(D4)
//
// 设计:
// - goals 数组持久化到 STORAGE_KEYS.GOALS(已留 key)。
// - 一个 Goal = 一个 Objective + 多个 KeyResult。
// - KR 进度:updateKeyResult 更新 current/done,goal 进度由 KR 自动汇总。
// - status=completed 时自动 archived=true,避免主列表污染。
// - 不走 E2EE 同步:目标是个人规划数据,本地优先即可。
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { Goal, KeyResult, Notification } from '../../types';
import { generateId } from '../constants';

function pushNotification(
  get: () => AppStore,
  params: { type: Notification['type']; title: string; message?: string },
): void {
  const notification: Notification = {
    id: `n-${generateId()}`,
    type: params.type,
    title: params.title,
    message: params.message ?? '',
    isRead: false,
    isArchived: false,
    actionUrl: null,
    data: {},
    createdAt: new Date(),
  };
  get().addNotification(notification);
}

export interface GoalsSlice {
  goals: Goal[];
  addGoal: (input: {
    title: string;
    description?: string;
    period: string;
    keyResults?: Array<Omit<KeyResult, 'id'>>;
  }) => string;
  updateGoal: (id: string, updates: Partial<Omit<Goal, 'id' | 'createdAt'>>) => void;
  deleteGoal: (id: string) => void;
  /** 新增 KR 到指定 goal。返回新 KR 的 id。 */
  addKeyResult: (goalId: string, input: Omit<KeyResult, 'id'>) => string | null;
  /** 更新 KR(current/done/target 等)。 */
  updateKeyResult: (goalId: string, krId: string, updates: Partial<Omit<KeyResult, 'id'>>) => void;
  /** 删除 KR。 */
  deleteKeyResult: (goalId: string, krId: string) => void;
}

export const createGoalsSlice: StateCreator<AppStore, [], [], GoalsSlice> = (set, get) => ({
  goals: [],

  addGoal: (input) => {
    const id = generateId();
    const now = new Date().toISOString();
    const newGoal: Goal = {
      id,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      period: input.period.trim(),
      status: 'active',
      keyResults: (input.keyResults ?? []).map((kr) => ({ ...kr, id: generateId() })),
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({ goals: [...state.goals, newGoal] }));
    get().saveData();
    return id;
  },

  updateGoal: (id, updates) => {
    set((state) => ({
      goals: state.goals.map((g) =>
        g.id === id
          ? {
              ...g,
              ...updates,
              id,
              title: updates.title !== undefined ? updates.title.trim() : g.title,
              description:
                updates.description !== undefined
                  ? updates.description.trim() || undefined
                  : g.description,
              period: updates.period !== undefined ? updates.period.trim() : g.period,
              updatedAt: new Date().toISOString(),
            }
          : g,
      ),
    }));
    get().saveData();
  },

  deleteGoal: (id) => {
    const deleted = get().goals.find((g) => g.id === id);
    if (!deleted) return;
    set((state) => ({ goals: state.goals.filter((g) => g.id !== id) }));
    get().saveData();
    pushNotification(get, {
      type: 'system',
      title: '已删除目标',
      message: deleted.title,
    });
  },

  addKeyResult: (goalId, input) => {
    const goal = get().goals.find((g) => g.id === goalId);
    if (!goal) return null;
    const newKr: KeyResult = { ...input, id: generateId() };
    set((state) => ({
      goals: state.goals.map((g) =>
        g.id === goalId
          ? { ...g, keyResults: [...g.keyResults, newKr], updatedAt: new Date().toISOString() }
          : g,
      ),
    }));
    get().saveData();
    return newKr.id;
  },

  updateKeyResult: (goalId, krId, updates) => {
    set((state) => ({
      goals: state.goals.map((g) =>
        g.id === goalId
          ? {
              ...g,
              keyResults: g.keyResults.map((kr) =>
                kr.id === krId ? { ...kr, ...updates, id: krId } : kr,
              ),
              updatedAt: new Date().toISOString(),
            }
          : g,
      ),
    }));

    // KR 更新后检查 goal 是否可自动标记完成:
    // 所有 KR 都满足(quantitative: current >= target;qualitative: done=true)→ status=completed
    const goal = get().goals.find((g) => g.id === goalId);
    if (goal && goal.status === 'active' && goal.keyResults.length > 0) {
      const allDone = goal.keyResults.every((kr) => {
        if (kr.type === 'quantitative') {
          return (kr.current ?? 0) >= (kr.target ?? Infinity);
        }
        return kr.done === true;
      });
      if (allDone) {
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId ? { ...g, status: 'completed', updatedAt: new Date().toISOString() } : g,
          ),
        }));
        pushNotification(get, {
          type: 'system',
          title: '目标已完成',
          message: goal.title,
        });
      }
    }

    get().saveData();
  },

  deleteKeyResult: (goalId, krId) => {
    set((state) => ({
      goals: state.goals.map((g) =>
        g.id === goalId
          ? {
              ...g,
              keyResults: g.keyResults.filter((kr) => kr.id !== krId),
              updatedAt: new Date().toISOString(),
            }
          : g,
      ),
    }));
    get().saveData();
  },
});
