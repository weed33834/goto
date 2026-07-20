import { useMemo, useState, useEffect } from 'react';

export const BREAKPOINTS = {
  xs: 360,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export function useResponsiveLayout() {
  // Web 端用 window.innerWidth/innerHeight + resize 监听替代 RN 的 useWindowDimensions
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);
  const [height, setHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 0);
  // 浏览器恒为 web 平台
  const isWeb = true;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return useMemo(() => {
    const isXSmall = width < BREAKPOINTS.xs;
    const isSmall = width < BREAKPOINTS.sm;
    const isMedium = width >= BREAKPOINTS.sm && width < BREAKPOINTS.lg;
    const isLarge = width >= BREAKPOINTS.lg;
    const isXLarge = width >= BREAKPOINTS.xl;

    const screenPadding = isWeb
      ? isLarge
        ? 28
        : isMedium
        ? 22
        : 18
      : isXSmall
      ? 12
      : isSmall
      ? 14
      : 16;

    const sectionSpacing = isWeb ? 18 : 12;
    const cardSpacing = isWeb ? 12 : 8;

    const contentMaxWidth = isWeb
      ? isLarge
        ? 1100
        : isMedium
        ? 720
        : undefined
      : undefined;

    const tabBarHeight = isWeb ? 68 : isXSmall ? 56 : 64;
    const tabBarBottomOffset = isWeb ? 12 : isXSmall ? 8 : 10;
    const tabBarHorizontalInset = isWeb
      ? isLarge
        ? Math.max(16, Math.min(48, (width - (contentMaxWidth || width)) / 2 + 16))
        : 16
      : isXSmall
      ? 8
      : 12;

    const headerHeight = isWeb ? 56 : 52;

    return {
      width,
      height,
      isWeb,
      isXSmall,
      isSmall,
      isMedium,
      isLarge,
      isXLarge,
      screenPadding,
      sectionSpacing,
      cardSpacing,
      contentMaxWidth,
      tabBarHeight,
      tabBarBottomOffset,
      tabBarHorizontalInset,
      headerHeight,
      bottomInset: tabBarHeight + tabBarBottomOffset * 3 + (isWeb ? 40 : 24),
    };
  }, [width, height, isWeb]);
}
