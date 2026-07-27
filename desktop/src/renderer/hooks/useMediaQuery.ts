import { useEffect, useState } from 'react';

/**
 * useMediaQuery — 订阅 matchMedia 响应式断点。
 *
 * 基于 CSS media query 而非 window.innerWidth 轮询,
 * 避免与 Tailwind 默认断点(sm:640/md:768/lg:1024/xl:1280)口径不一致的问题。
 *
 * 用法:
 *   const isMobile = useMediaQuery('(max-width: 767px)');     // <md
 *   const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
 *   const isDesktop = useMediaQuery('(min-width: 1024px)');    // >=lg
 *   const isTouch = useMediaQuery('(pointer: coarse)');        // 触摸设备
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    // 立即同步一次(初始 useState 可能在 SSR 或早期 matchMedia 未就绪)
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** 移动端断点:< 768px(md) */
export const MOBILE_QUERY = '(max-width: 767px)';
/** 平板断点:768px - 1023px */
export const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023px)';
/** 桌面断点:>= 1024px(lg) */
export const DESKTOP_QUERY = '(min-width: 1024px)';
/** 触摸设备(pointer: coarse) */
export const TOUCH_QUERY = '(pointer: coarse)';
