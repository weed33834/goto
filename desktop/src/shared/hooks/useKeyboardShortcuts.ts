import { useEffect, useRef } from 'react';

type Handler = (e: KeyboardEvent) => void;

export interface ShortcutMap {
  [key: string]: Handler;
}

function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  const k = e.key.toLowerCase();
  if (!['meta', 'control', 'alt', 'shift'].includes(k)) parts.push(k);
  return parts.join('+');
}

/**
 * useKeyboardShortcuts - 注册键盘快捷键（仅 web 平台生效）
 * 移动端不会触发，useNativeDriver 不支持但 web 上 window.addEventListener 足够
 *
 * @example
 * useKeyboardShortcuts({
 *   'mod+k': () => openSearch(),
 *   'mod+n': () => openQuickAdd(),
 *   'escape': () => closeModal(),
 *   '/': () => focusSearch(),
 * });
 */
export function useKeyboardShortcuts(map: ShortcutMap, enabled: boolean = true) {
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  });

  useEffect(() => {
    // 浏览器恒为 web 平台,无需 Platform 判断
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const combo = eventToCombo(e);
      const handlerFn = mapRef.current[combo];
      if (handlerFn) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if ((combo === 'escape' || combo.startsWith('mod+')) || (!tag || (tag !== 'input' && tag !== 'textarea' && tag !== 'select'))) {
          e.preventDefault();
          handlerFn(e);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}

