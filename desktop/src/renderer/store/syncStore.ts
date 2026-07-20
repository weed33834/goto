import { create } from 'zustand';
import type { SyncState, SyncDeviceInfo, SyncPeerInfo, PeerState } from '../../shared/types';

interface PairingCodeInfo {
  code: string;
  expiresAt: number;
}

interface SyncStoreState extends SyncState {
  isLoading: boolean;
  pairingCode: PairingCodeInfo | null;
  dialogMode: 'none' | 'host' | 'join';
  error: string | null;
  peers: SyncPeerInfo[];
  fetch: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setRelayUrl: (url: string) => Promise<void>;
  syncNow: () => Promise<void>;
  generatePairingCode: () => Promise<void>;
  claimPairingCode: (code: string) => Promise<void>;
  removeDevice: (deviceId: string) => Promise<void>;
  setDialogMode: (mode: 'none' | 'host' | 'join') => void;
  clearError: () => void;
  setStateFromPush: (state: SyncState) => void;
  setPeers: (peers: SyncPeerInfo[]) => void;
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  enabled: false,
  relayUrl: '',
  devices: [],
  lastSyncAt: null,
  isLoading: true,
  pairingCode: null,
  dialogMode: 'none',
  error: null,
  peers: [],

  fetch: async () => {
    const state = await window.gotoAPI.sync.getState();
    const { lastError, ...rest } = state;
    set({ ...rest, isLoading: false, error: lastError ?? null });
  },

  setEnabled: async (enabled) => {
    await window.gotoAPI.sync.setEnabled(enabled);
    set({ enabled });
    await get().fetch();
  },

  setRelayUrl: async (url) => {
    await window.gotoAPI.sync.setRelayUrl(url);
    set({ relayUrl: url });
    await get().fetch();
  },

  syncNow: async () => {
    await window.gotoAPI.sync.syncNow();
  },

  generatePairingCode: async () => {
    try {
      set({ error: null });
      const result = await window.gotoAPI.sync.generatePairingCode();
      set({ pairingCode: result, dialogMode: 'host' });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  claimPairingCode: async (code) => {
    try {
      set({ error: null });
      const result = await window.gotoAPI.sync.claimPairingCode(code);
      if (result.success) {
        set({ dialogMode: 'none' });
        await get().fetch();
      } else {
        set({ error: result.message ?? '配对失败' });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  removeDevice: async (deviceId) => {
    await window.gotoAPI.sync.removeDevice(deviceId);
    await get().fetch();
  },

  setDialogMode: (mode) => {
    set({ dialogMode: mode, error: null, pairingCode: mode === 'none' ? null : get().pairingCode });
  },

  clearError: () => {
    set({ error: null });
  },

  setStateFromPush: (state) => {
    // 主进程推送的 state 可能携带 lastError（异步配对失败），
    // 映射到 store 的 error 字段供 PairingDialog 展示；无错时清空。
    const { lastError, ...rest } = state;
    set({ ...rest, isLoading: false, error: lastError ?? null });
  },

  setPeers: (peers) => {
    set({ peers });
  },
}));

export function formatLastSeen(timestamp: number | null): string {
  if (!timestamp) return '从未';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return `今天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export type { SyncDeviceInfo, SyncPeerInfo, PeerState };
