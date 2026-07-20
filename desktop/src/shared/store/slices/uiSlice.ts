// UI Slice — 界面状态管理（主题、侧边栏、弹窗、通知等）
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { ThemePreset, Theme, Notification } from '../../types';
import { defaultTheme, darkTheme } from '../constants';

export interface UISlice {
  theme: ThemePreset;
  sidebarOpen: boolean;
  activeModal: string | null;
  activeTab: string;
  searchQuery: string;
  isSearchOpen: boolean;
  notifications: Notification[];
  unreadNotificationCount: number;
  setTheme: (theme: ThemePreset | { type: Theme }) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveModal: (modal: string | null) => void;
  setActiveTab: (tab: string) => void;
  setSearchQuery: (query: string) => void;
  toggleSearch: () => void;
  addNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
}

export const createUISlice: StateCreator<AppStore, [], [], UISlice> = (set, get) => ({
  theme: defaultTheme,
  sidebarOpen: true,
  activeModal: null,
  activeTab: 'tasks',
  searchQuery: '',
  isSearchOpen: false,
  notifications: [],
  unreadNotificationCount: 0,

  setTheme: (theme) => {
    if ('type' in theme && theme.type === 'dark') {
      set({ theme: darkTheme });
      get().saveData();
    } else if ('type' in theme && theme.type === 'light') {
      set({ theme: defaultTheme });
      get().saveData();
    } else if ('type' in theme && theme.type === 'system') {
      // Web 端用 matchMedia 检测系统配色偏好,替代 RN 的 Appearance.getColorScheme()
      const prefersDark =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      set({ theme: prefersDark ? darkTheme : defaultTheme });
      get().saveData();
    } else {
      set({ theme: { ...get().theme, ...(theme as Partial<ThemePreset>) } as ThemePreset });
      get().saveData();
    }
  },

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
    get().saveData();
  },

  setActiveModal: (modal) => set({ activeModal: modal }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadNotificationCount: state.unreadNotificationCount + 1,
    }));
  },

  markNotificationRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
      unreadNotificationCount: Math.max(0, state.unreadNotificationCount - 1),
    }));
  },

  clearNotifications: () => set({ notifications: [], unreadNotificationCount: 0 }),
});
