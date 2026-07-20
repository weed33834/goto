import { create } from 'zustand';
import type { VaultItem } from '../../shared/types';
import { useAppStore } from '../../shared/store';

interface VaultState {
  items: VaultItem[];
  loading: boolean;
  fetch: () => Promise<void>;
  create: (item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  update: (id: string, updates: Partial<VaultItem>) => Promise<void>;
  delete: (id: string) => Promise<void>;
  generatePassword: (length: number) => Promise<string>;
}

// 统一数据层:本 store 仅作为共享 store(useAppStore.vaultItems)的薄封装。
// 通过订阅 useAppStore 使 items 始终与 loadData 读取的源保持一致。
//
// P0-3 修复:写操作改走 useAppStore.getState().addVaultItem/updateVaultItem/deleteVaultItem,
// 激活 vaultSlice 已有的 notification + undo 逻辑(与 tasksSlice 行为一致)。
export const useVaultStore = create<VaultState>((set, get) => {
  useAppStore.subscribe((state) => {
    if (state.vaultItems !== get().items) set({ items: state.vaultItems });
  });

  return {
    items: useAppStore.getState().vaultItems,
    loading: false,
    fetch: async () => {
      set({ loading: true });
      await useAppStore.getState().loadData();
      set({ items: useAppStore.getState().vaultItems, loading: false });
    },
    create: async (item) => {
      useAppStore.getState().addVaultItem(item);
    },
    update: async (id, updates) => {
      useAppStore.getState().updateVaultItem(id, updates);
    },
    delete: async (id) => {
      useAppStore.getState().deleteVaultItem(id);
    },
    generatePassword: async (length) => {
      return window.gotoAPI.vault.generatePassword(length);
    },
  };
});
