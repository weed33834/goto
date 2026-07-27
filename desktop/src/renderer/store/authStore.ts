import { create } from 'zustand';

// P0-2: 密码错误次数限制 + cooldown(§0.4.1 #8 要求 3 次错锁 30s)
const MAX_FAILED_ATTEMPTS = 3;
const COOLDOWN_MS = 30_000;

interface AuthState {
  isUnlocked: boolean;
  isLoading: boolean;
  failedAttempts: number;
  lockedUntil: number | null; // 时间戳;null 表示未锁定
  unlock: (password: string) => Promise<boolean>;
  setupMasterPassword: (password: string) => Promise<boolean>;
  changePassword: (
    oldPassword: string,
    newPassword: string,
  ) => Promise<{ success: boolean; message: string }>;
  lock: () => Promise<void>;
  checkStatus: () => Promise<void>;
  /** 当前剩余 cooldown 秒数;0 表示未锁定 */
  cooldownRemaining: () => number;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isUnlocked: false,
  isLoading: true,
  failedAttempts: 0,
  lockedUntil: null,

  unlock: async (password) => {
    // cooldown 期间直接拒绝,不调用 verifyPassword(避免离线攻击者绕过)
    const now = Date.now();
    const lockedUntil = get().lockedUntil;
    if (lockedUntil && now < lockedUntil) {
      return false;
    }
    // 过期锁定清零
    if (lockedUntil && now >= lockedUntil) {
      set({ lockedUntil: null, failedAttempts: 0 });
    }

    const success = await window.gotoAPI.auth.unlock(password);
    if (success) {
      set({ isUnlocked: true, failedAttempts: 0, lockedUntil: null });
    } else {
      const next = get().failedAttempts + 1;
      if (next >= MAX_FAILED_ATTEMPTS) {
        set({
          failedAttempts: next,
          lockedUntil: Date.now() + COOLDOWN_MS,
        });
      } else {
        set({ failedAttempts: next });
      }
    }
    return success;
  },

  setupMasterPassword: async (password) => {
    const success = await window.gotoAPI.auth.setupMasterPassword(password);
    if (success) {
      set({ isUnlocked: true, failedAttempts: 0, lockedUntil: null });
    }
    return success;
  },

  changePassword: async (oldPassword, newPassword) => {
    // 走 webAPI 校验旧密码 + 写入新 verifier,失败计数不累计(cooldown
    // 是解锁路径的防爆破措施,这里旧密码错误已由 webAPI 显式返回 message)。
    const result = await window.gotoAPI.auth.changePassword(oldPassword, newPassword);
    return result;
  },

  lock: async () => {
    // 等待主进程完成锁定(清理密钥、关闭保险库句柄等)后再更新 UI 状态,
    // 否则 IPC 失败时 UI 已显示锁定但主进程仍持有密钥(L-1)
    await window.gotoAPI.auth.lock();
    set({ isUnlocked: false, failedAttempts: 0, lockedUntil: null });
  },

  checkStatus: async () => {
    const unlocked = await window.gotoAPI.auth.isUnlocked();
    set({ isUnlocked: unlocked, isLoading: false });
  },

  cooldownRemaining: () => {
    const lockedUntil = get().lockedUntil;
    if (!lockedUntil) return 0;
    const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  },
}));
