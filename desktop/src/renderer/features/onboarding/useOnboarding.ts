/**
 * Onboarding 状态管理 hook(独立于 Onboarding.tsx 组件)
 *
 * 拆分原因:Onboarding.tsx 静态 import 会拉入 framer-motion,破坏 App.tsx 的
 * lazy 加载。此 hook 文件零重依赖,可静态 import 而不影响首屏 chunk。
 */
import { useState, useEffect } from 'react';

export const ONBOARDING_KEY = 'goto:onboardingDone';

export function isOnboardingDone(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(ONBOARDING_KEY) === '1';
}

export function markOnboardingDone(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    // localStorage 不可用则忽略
  }
}

/**
 * Hook:首次进入时显示 onboarding
 *
 * 延迟 500ms 等 LockScreen 解锁后再决定是否显示。
 * 同会话内若用户在别处完成 onboarding(理论可能),setTimeout 内二次检查防止重复弹窗。
 */
export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!isOnboardingDone()) {
      const timer = setTimeout(() => {
        if (!isOnboardingDone()) {
          setShowOnboarding(true);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const complete = () => setShowOnboarding(false);

  return { showOnboarding, complete };
}
