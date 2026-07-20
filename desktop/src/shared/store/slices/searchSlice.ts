// Search Slice — 搜索历史状态
// 搜索历史保存在 store 中（而非 local useState），以便在屏幕卸载后仍然保留。
// 最多保留 10 条记录以限制存储增长。
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';

export interface SearchSlice {
  searchHistory: string[];
  addSearchToHistory: (query: string) => void;
  clearSearchHistory: () => void;
}

export const createSearchSlice: StateCreator<AppStore, [], [], SearchSlice> = (set, get) => ({
  searchHistory: [],

  addSearchToHistory: (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    set((state) => {
      const filtered = state.searchHistory.filter((q) => q !== trimmed);
      return { searchHistory: [trimmed, ...filtered].slice(0, 10) };
    });
    get().saveData();
  },

  clearSearchHistory: () => {
    set({ searchHistory: [] });
    get().saveData();
  },
});
