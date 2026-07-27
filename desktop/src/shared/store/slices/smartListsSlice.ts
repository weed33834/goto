// SmartLists Slice — 智能列表状态(DSL 查询的命名保存)
//
// 与 searchHistory 不同:smartLists 是用户主动命名并保存的 DSL 查询,
// 用于反复访问"今天且优先级 P1 且带 @work 标签"这类复合视图。
//
// 不接 API 同步:智能列表是 UI 偏好,跨设备同步走 E2EE syncRecordApplier
// 已覆盖的 'smart_lists' 表(若未来需要);当前仅本地持久化。
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { SmartList } from '../../types';
import { generateId } from '../constants';

export interface SmartListsSlice {
  smartLists: SmartList[];
  /** 添加智能列表,返回新 id。name 空字符串会被拒绝(返 null)。 */
  addSmartList: (params: { name: string; query: string }) => string | null;
  updateSmartList: (id: string, updates: Partial<Pick<SmartList, 'name' | 'query'>>) => void;
  deleteSmartList: (id: string) => void;
}

export const createSmartListsSlice: StateCreator<AppStore, [], [], SmartListsSlice> = (set, get) => ({
  smartLists: [],

  addSmartList: ({ name, query }) => {
    const trimmedName = name.trim();
    const trimmedQuery = query.trim();
    if (!trimmedName || !trimmedQuery) return null;

    const id = generateId();
    const now = new Date();
    // order = 当前最大 order + 1,保证新加的在末尾
    const maxOrder = get().smartLists.reduce((m, s) => Math.max(m, s.order), 0);
    const newList: SmartList = {
      id,
      name: trimmedName,
      query: trimmedQuery,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({ smartLists: [...state.smartLists, newList] }));
    get().saveData();
    return id;
  },

  updateSmartList: (id, updates) => {
    set((state) => ({
      smartLists: state.smartLists.map((s) =>
        s.id === id
          ? {
              ...s,
              ...updates,
              // 过滤掉空名 / 空 query 后再写,避免保存成空对象
              name: updates.name !== undefined ? updates.name.trim() || s.name : s.name,
              query: updates.query !== undefined ? updates.query.trim() || s.query : s.query,
              updatedAt: new Date(),
            }
          : s,
      ),
    }));
    get().saveData();
  },

  deleteSmartList: (id) => {
    set((state) => ({
      smartLists: state.smartLists.filter((s) => s.id !== id),
    }));
    get().saveData();
  },
});
