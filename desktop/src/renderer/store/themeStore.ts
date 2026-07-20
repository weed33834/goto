import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  init: () => () => void;
}

const STORAGE_KEY = 'taskflow-theme';

function getStoredMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode: ThemeMode): 'light' | 'dark' {
  const resolved = resolveMode(mode);
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  return resolved;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'system',
  resolved: 'light',
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    const resolved = applyTheme(mode);
    set({ mode, resolved });
  },
  init: () => {
    const mode = getStoredMode();
    const resolved = applyTheme(mode);
    set({ mode, resolved });

    const listener = (event: MediaQueryListEvent) => {
      const currentMode = useThemeStore.getState().mode;
      if (currentMode === 'system') {
        const newResolved = event.matches ? 'dark' : 'light';
        applyTheme('system');
        set({ resolved: newResolved });
      }
    };

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', listener);

    return () => {
      mediaQuery.removeEventListener('change', listener);
    };
  },
}));
