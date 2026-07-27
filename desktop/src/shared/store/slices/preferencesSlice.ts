// Preferences Slice — 用户偏好设置（持久化）
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type {
  UserPreferences,
  NotificationPreferences,
  DisplaySettings,
  PrivacySettings,
  PomodoroSettings,
} from '../../types';

export interface PreferencesSlice {
  userPreferences: UserPreferences;
  updateUserPreferences: (prefs: Partial<UserPreferences>) => void;
  updateNotificationSettings: (settings: Partial<NotificationPreferences>) => void;
  updateDisplaySettings: (settings: Partial<DisplaySettings>) => void;
  updatePrivacySettings: (settings: Partial<PrivacySettings>) => void;
  updatePomodoroSettings: (settings: Partial<PomodoroSettings>) => void;
}

export const createPreferencesSlice: StateCreator<AppStore, [], [], PreferencesSlice> = (set, get) => ({
  userPreferences: {
    defaultView: 'list' as const,
    defaultProject: null,
    defaultCategory: null,
    startDayOfWeek: 1,
    workHours: {
      enabled: false,
      startHour: 9,
      endHour: 18,
      days: [1, 2, 3, 4, 5],
      timezone: 'Asia/Shanghai',
    },
    notifications: {
      taskReminders: true,
      projectUpdates: true,
      comments: true,
      mentions: true,
      dailyDigest: true,
      weeklyReport: false,
      soundEnabled: true,
      vibrationEnabled: true,
      badgeEnabled: true,
      quietHours: {
        enabled: false,
        startTime: '22:00',
        endTime: '08:00',
        days: [0, 1, 2, 3, 4, 5, 6],
        timezone: 'Asia/Shanghai',
      },
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      notificationChannels: [],
    },
    integrations: {
      googleCalendar: false,
      appleCalendar: false,
      outlookCalendar: false,
      slack: false,
      teams: false,
      github: false,
      jira: false,
      notion: false,
      dropbox: false,
      onedrive: false,
      googleDrive: false,
    },
    shortcuts: {
      quickAdd: 'Ctrl+N',
      search: 'Ctrl+K',
      toggleSidebar: 'Ctrl+B',
      markComplete: 'Ctrl+Enter',
      newTask: 'Ctrl+T',
      newProject: 'Ctrl+P',
      settings: 'Ctrl+,',
      help: 'F1',
    },
    displaySettings: {
      compactMode: false,
      showAnimations: true,
      showTooltips: true,
      showAvatars: true,
      showTaskIcons: true,
      showCompletedTasks: true,
      showSubtasks: true,
      showAttachments: true,
      cardDensity: 'comfortable',
      colorScheme: 'light',
      accentColor: '#3B82F6',
      fontSize: 'medium',
      fontFamily: 'System',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h',
      firstDayOfWeek: 1,
    },
    privacySettings: {
      profileVisibility: 'private',
      showEmail: false,
      showPhone: false,
      showActivity: true,
      allowMentions: true,
      allowInvites: true,
      dataCollection: true,
      analytics: true,
      autoLockTimeout: 5,
    },
    languageSettings: {
      language: 'zh-CN',
      timezone: 'Asia/Shanghai',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h',
      firstDayOfWeek: 1,
      numberFormat: '1,000.00',
      currency: 'CNY',
    },
    accessibilitySettings: {
      screenReaderEnabled: false,
      highContrastMode: false,
      largeText: false,
      reduceMotion: false,
      colorBlindMode: false,
      keyboardNavigation: true,
      voiceControl: false,
      hapticFeedback: true,
    },
    pomodoroSettings: {
      enabled: true,
      focusDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      longBreakInterval: 4,
      dailyGoal: 4,
      autoStartBreaks: false,
      autoStartFocus: false,
      soundEnabled: true,
      vibrationEnabled: true,
    },
  },

  updateUserPreferences: (prefs) => {
    set((state) => ({
      userPreferences: { ...state.userPreferences, ...prefs },
    }));
    get().saveData();
  },

  updateNotificationSettings: (notifications) => {
    set((state) => ({
      userPreferences: {
        ...state.userPreferences,
        notifications: { ...state.userPreferences.notifications, ...notifications },
      },
    }));
    get().saveData();
  },

  updateDisplaySettings: (displaySettings) => {
    set((state) => ({
      userPreferences: {
        ...state.userPreferences,
        displaySettings: { ...state.userPreferences.displaySettings, ...displaySettings },
      },
    }));
    get().saveData();
  },

  updatePrivacySettings: (privacySettings) => {
    set((state) => ({
      userPreferences: {
        ...state.userPreferences,
        privacySettings: { ...state.userPreferences.privacySettings, ...privacySettings },
      },
    }));
    get().saveData();
  },

  updatePomodoroSettings: (pomodoroSettings) => {
    set((state) => ({
      userPreferences: {
        ...state.userPreferences,
        pomodoroSettings: { ...state.userPreferences.pomodoroSettings, ...pomodoroSettings },
      },
    }));
    get().saveData();
  },
});
