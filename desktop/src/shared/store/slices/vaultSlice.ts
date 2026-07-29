// Vault Slice — 加密保险库状态(Web 端密码/卡片/安全笔记)
// 与 tasksSlice 一致:所有状态集中在共享 store,经 saveData 持久化到统一的
// IndexedDB(goto-async-storage),消除原先 renderer vaultStore 直连独立
// IndexedDB(goto)导致的"双数据源"数据丢失问题。
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { VaultItem } from '../../types';
import { generateId } from '../constants';
import { pushUndo, undoDeleteVaultItem } from '../../hooks/useUndo';
import { pushNotification } from '../../utils/notificationUtils';

export interface VaultSlice {
  vaultItems: VaultItem[];
  addVaultItem: (item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateVaultItem: (id: string, updates: Partial<VaultItem>) => void;
  deleteVaultItem: (id: string) => void;
}

export const createVaultSlice: StateCreator<AppStore, [], [], VaultSlice> = (set, get) => ({
  vaultItems: [],

  addVaultItem: (item) => {
    const id = generateId();
    const now = new Date().toISOString();
    const newItem: VaultItem = { ...item, id, createdAt: now, updatedAt: now };
    set((state) => ({ vaultItems: [...state.vaultItems, newItem] }));
    get().saveData();
    return id;
  },

  updateVaultItem: (id, updates) => {
    set((state) => ({
      vaultItems: state.vaultItems.map((v) =>
        v.id === id ? { ...v, ...updates, id, updatedAt: new Date().toISOString() } : v,
      ),
    }));
    get().saveData();
  },

  deleteVaultItem: (id) => {
    const deletedItem = get().vaultItems.find((v) => v.id === id);
    set((state) => ({
      vaultItems: state.vaultItems.filter((v) => v.id !== id),
    }));
    get().saveData();

    // P0-3:推入 undo 栈 + 弹 toast 给"撤销"入口,与 tasksSlice 行为一致
    if (deletedItem) {
      pushUndo({
        type: 'vault',
        data: deletedItem,
        message: `已删除"${deletedItem.title}"`,
        undo: () => undoDeleteVaultItem(deletedItem),
      });
      pushNotification(get, {
        type: 'system',
        title: '已删除保险库项',
        message: deletedItem.title,
        data: {
          actionLabel: '撤销',
          actionFn: () => undoDeleteVaultItem(deletedItem),
        },
      });
    }
  },
});
