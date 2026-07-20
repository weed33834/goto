// @vitest-environment jsdom
/**
 * Onboarding hook & 标记函数测试(§7.8 v3.2)
 *
 * 测试目标:
 * - isOnboardingDone / markOnboardingDone 读写 localStorage 标记
 * - useOnboarding 首次启动延迟 500ms 显示
 * - 已完成则不显示
 * - complete() 关闭浮层
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  isOnboardingDone,
  markOnboardingDone,
  useOnboarding,
  ONBOARDING_KEY,
} from './Onboarding';

describe('Onboarding — localStorage 标记', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('未标记时 isOnboardingDone() 返回 false', () => {
    expect(isOnboardingDone()).toBe(false);
  });

  it('markOnboardingDone() 后 isOnboardingDone() 返回 true', () => {
    markOnboardingDone();
    expect(isOnboardingDone()).toBe(true);
    expect(localStorage.getItem(ONBOARDING_KEY)).toBe('1');
  });

  it('markOnboardingDone() 在 localStorage 不可用时静默失败', () => {
    const original = globalThis.localStorage;
    // 模拟 setItem 抛错
    const failingStorage = {
      ...original,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: failingStorage,
      configurable: true,
    });
    expect(() => markOnboardingDone()).not.toThrow();
    Object.defineProperty(globalThis, 'localStorage', {
      value: original,
      configurable: true,
    });
  });
});

describe('Onboarding — useOnboarding hook', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('未完成 onboarding 时,延迟 500ms 后显示', () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.showOnboarding).toBe(false);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.showOnboarding).toBe(false);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.showOnboarding).toBe(true);
  });

  it('已完成 onboarding 时不显示', () => {
    markOnboardingDone();
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.showOnboarding).toBe(false);
  });

  it('complete() 关闭浮层', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.showOnboarding).toBe(true);

    act(() => {
      result.current.complete();
    });
    expect(result.current.showOnboarding).toBe(false);
  });
});
