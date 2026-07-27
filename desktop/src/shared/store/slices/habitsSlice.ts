// Habits Slice — 习惯追踪状态(s3)
//
// 设计:
// - habits 数组持久化到 STORAGE_KEYS.HABITS(已留 key)。
// - toggleHabitEntry(date) 切换某日打卡:已打卡则取消,未打卡则补上,去重保序。
// - 完成日期用 'YYYY-MM-DD' 字符串,避免时区漂移(见 Habit.completedDates 注释)。
// - 不走 E2EE 同步;习惯是设备本地行为数据。
// - 删除走真实删除(用户主动操作),非归档;归档通过 updateHabit({ archived: true })。
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { Habit, Notification } from '../../types';
import { generateId } from '../constants';
import { pushUndo, undoDeleteHabit } from '../../hooks/useUndo';

const HABIT_COLORS = ['#5B6CFF', '#34D399', '#F59E0B', '#FF6B9D', '#9D7BFF', '#0EA5E9'];

function pickColor(index: number): string {
  return HABIT_COLORS[index % HABIT_COLORS.length]!;
}

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

export interface HabitsSlice {
  habits: Habit[];
  addHabit: (input: { name: string; description?: string; cadence: 'daily' | 'weekly' }) => string;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  /** 切换某日的打卡状态:已打卡则取消,未打卡则补上。dateStr='YYYY-MM-DD'。 */
  toggleHabitEntry: (habitId: string, dateStr: string) => void;
}

export const createHabitsSlice: StateCreator<AppStore, [], [], HabitsSlice> = (set, get) => ({
  habits: [],

  addHabit: (input) => {
    const id = generateId();
    const now = new Date().toISOString();
    const newHabit: Habit = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      cadence: input.cadence,
      color: pickColor(get().habits.length),
      createdAt: now,
      updatedAt: now,
      archived: false,
      completedDates: [],
    };
    set((state) => ({ habits: [...state.habits, newHabit] }));
    get().saveData();
    return id;
  },

  updateHabit: (id, updates) => {
    set((state) => ({
      habits: state.habits.map((h) =>
        h.id === id
          ? {
              ...h,
              ...updates,
              id,
              // name/description 若传入,trim 一次
              name: updates.name !== undefined ? updates.name.trim() : h.name,
              description:
                updates.description !== undefined
                  ? updates.description.trim() || undefined
                  : h.description,
              updatedAt: new Date().toISOString(),
            }
          : h,
      ),
    }));
    get().saveData();
  },

  deleteHabit: (id) => {
    const deleted = get().habits.find((h) => h.id === id);
    set((state) => ({ habits: state.habits.filter((h) => h.id !== id) }));
    get().saveData();
    if (deleted) {
      pushUndo({
        type: 'habit',
        data: deleted,
        message: `已删除习惯"${deleted.name}"`,
        undo: () => undoDeleteHabit(deleted),
      });
      pushNotification(get, {
        type: 'system',
        title: '已删除习惯',
        message: deleted.name,
      });
    }
  },

  toggleHabitEntry: (habitId, dateStr) => {
    set((state) => ({
      habits: state.habits.map((h) => {
        if (h.id !== habitId) return h;
        const has = h.completedDates.includes(dateStr);
        const completedDates = has
          ? h.completedDates.filter((d) => d !== dateStr)
          : [...h.completedDates, dateStr].sort();
        return { ...h, completedDates, updatedAt: new Date().toISOString() };
      }),
    }));
    get().saveData();
  },
});
