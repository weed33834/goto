import { create } from 'zustand';
import type { SecuritySettings } from '../../shared/types';

const DEFAULT_SETTINGS: SecuritySettings = {
  lockMethod: 'password',
  autoLockMinutes: 5,
  clipboardClearSeconds: 30,
  screenshotProtection: true,
  privacyModeEnabled: false,
};

interface SecuritySettingsState extends SecuritySettings {
  isLoading: boolean;
  fetch: () => Promise<void>;
  update: (updates: Partial<SecuritySettings>) => Promise<void>;
}

export const useSecuritySettingsStore = create<SecuritySettingsState>((set) => ({
  ...DEFAULT_SETTINGS,
  isLoading: true,
  fetch: async () => {
    const settings = await window.gotoAPI.security.getSettings();
    set({ ...settings, isLoading: false });
  },
  update: async (updates) => {
    const { lockMethod, autoLockMinutes, clipboardClearSeconds, screenshotProtection, privacyModeEnabled } =
      useSecuritySettingsStore.getState();
    const next: SecuritySettings = {
      lockMethod,
      autoLockMinutes,
      clipboardClearSeconds,
      screenshotProtection,
      privacyModeEnabled,
      ...updates,
    };
    await window.gotoAPI.security.setSettings(next);
    set(next);
  },
}));
