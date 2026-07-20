import { useState, useEffect, useCallback } from 'react';

export function usePrivacyMode() {
  const [privacyMode, setPrivacyMode] = useState(false);

  useEffect(() => {
    const handler = () => setPrivacyMode((prev) => !prev);
    window.addEventListener('toggle-privacy', handler);
    return () => window.removeEventListener('toggle-privacy', handler);
  }, []);

  // 在渲染进程内监听 Escape 键切换隐私模式，替代原先的全局快捷键，
  // 避免拦截系统中其他应用的 Escape 行为。
  // 当存在打开的模态对话框（role="dialog"）时，Esc 交给对话框处理（如关闭弹窗），
  // 不切换隐私模式，避免关闭弹窗时误触发隐私模式。
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return;
      setPrivacyMode((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return privacyMode;
}
