// @vitest-environment jsdom
/**
 * usePomodoro 测试(s2)
 *
 * 覆盖状态机关键路径:
 * - 初始:idle,secondsRemaining=focusDuration*60,isRunning=false
 * - start():idle → focus,isRunning=true
 * - pause()/start() 切换 running 状态而不重置 phase
 * - reset():回到当前 phase 初始秒数 + 暂停
 * - skip():focus → short-break(默认 autoStartBreaks=false 暂停)
 * - skip() 第 N 次 focus(longBreakInterval)后 → long-break
 * - stop():回 idle
 *
 * 用 fake timers 推进时间验证 tick。
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '../../shared/store';
import { usePomodoro } from './usePomodoro';

beforeEach(() => {
  vi.useFakeTimers();
  // 重置 store 到默认 pomodoroSettings(focus 25 / short 5 / long 15 / interval 4)
  useAppStore.setState({
    userPreferences: {
      ...useAppStore.getState().userPreferences,
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
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePomodoro', () => {
  it('初始状态:idle, secondsRemaining=25*60, isRunning=false', () => {
    const { result } = renderHook(() => usePomodoro());
    expect(result.current.phase).toBe('idle');
    expect(result.current.secondsRemaining).toBe(25 * 60);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.completedFocusCount).toBe(0);
  });

  it('start() 从 idle 启动 focus, isRunning=true', () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => result.current.start());
    expect(result.current.phase).toBe('focus');
    expect(result.current.isRunning).toBe(true);
    expect(result.current.secondsRemaining).toBe(25 * 60);
  });

  it('pause() 暂停但保留 secondsRemaining 与 phase', () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => result.current.start());
    // 推进 10 秒
    act(() => { vi.advanceTimersByTime(10_000); });
    const before = result.current.secondsRemaining;
    expect(before).toBeLessThan(25 * 60);
    act(() => result.current.pause());
    expect(result.current.isRunning).toBe(false);
    expect(result.current.phase).toBe('focus');
    expect(result.current.secondsRemaining).toBe(before);
  });

  it('paused 状态再 start() 恢复运行,不重置 secondsRemaining', () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(10_000); });
    const before = result.current.secondsRemaining;
    act(() => result.current.pause());
    act(() => result.current.start());
    expect(result.current.isRunning).toBe(true);
    expect(result.current.secondsRemaining).toBe(before);
  });

  it('每秒 tick:secondsRemaining 递减', () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(result.current.secondsRemaining).toBe(25 * 60 - 3);
  });

  it('reset():当前 phase 回到初始秒数并暂停', () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(30_000); });
    act(() => result.current.reset());
    expect(result.current.secondsRemaining).toBe(25 * 60);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.phase).toBe('focus');
  });

  it('focus 结束(secondsRemaining→0):completedFocusCount++, phase→short-break, 默认暂停', () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => result.current.start());
    // 把时间推到 focus 结束(25*60 秒)
    act(() => { vi.advanceTimersByTime(25 * 60 * 1000); });
    // phase 切换在 setTimeout(0) 中执行,需再推进一次 macro task
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.phase).toBe('short-break');
    expect(result.current.completedFocusCount).toBe(1);
    expect(result.current.isRunning).toBe(false); // autoStartBreaks=false
    expect(result.current.secondsRemaining).toBe(5 * 60);
  });

  it('focus 结束:autoStartBreaks=true 时自动启动 short-break', () => {
    useAppStore.setState({
      userPreferences: {
        ...useAppStore.getState().userPreferences,
        pomodoroSettings: {
          ...useAppStore.getState().userPreferences.pomodoroSettings,
          autoStartBreaks: true,
        },
      },
    });
    const { result } = renderHook(() => usePomodoro());
    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(25 * 60 * 1000); });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.phase).toBe('short-break');
    expect(result.current.isRunning).toBe(true);
  });

  it('完成 longBreakInterval 次 focus 后切到 long-break', () => {
    const { result } = renderHook(() => usePomodoro());
    // 完成 4 个 focus(longBreakInterval=4)。每个 focus 结束后会切到 short-break(暂停),
    // 需 skip() 跳过 break 进入下一个 focus;第 4 次 focus 结束后切到 long-break。
    for (let i = 0; i < 4; i++) {
      act(() => result.current.start());                              // 启动 focus
      act(() => { vi.advanceTimersByTime(25 * 60 * 1000); });         // 跑完 focus
      act(() => { vi.advanceTimersByTime(0); });                      // 触发 phase 切换 setTimeout
      if (i < 3) {
        act(() => result.current.skip());                             // 跳过 short-break 进下一个 focus
      }
    }
    expect(result.current.completedFocusCount).toBe(4);
    expect(result.current.phase).toBe('long-break');
    expect(result.current.secondsRemaining).toBe(15 * 60);
  });

  it('skip():focus 直接跳到 short-break,不计入完成数', () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => result.current.start());
    act(() => result.current.skip());
    expect(result.current.phase).toBe('short-break');
    expect(result.current.completedFocusCount).toBe(0); // skip 不算完成
  });

  it('skip() 在第 N 次 focus 后切到 long-break', () => {
    const { result } = renderHook(() => usePomodoro());
    // 完成 3 次 focus 后 phase=short-break;skip() 进第 4 个 focus;
    // 再 skip 第 4 个 focus 应触发 long-break(因为 (3+1) % 4 == 0)。
    for (let i = 0; i < 3; i++) {
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(25 * 60 * 1000); });
      act(() => { vi.advanceTimersByTime(0); });
      act(() => result.current.skip());   // 跳过 short-break 进下一个 focus
    }
    // 此时 phase=focus(第 4 个),completedFocusCount=3
    expect(result.current.phase).toBe('focus');
    expect(result.current.completedFocusCount).toBe(3);
    // 再 skip focus,应是第 4 次完成(longBreakInterval=4)→ long-break
    act(() => result.current.skip());
    expect(result.current.phase).toBe('long-break');
  });

  it('stop():回 idle, secondsRemaining 重置为 focusDuration*60', () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(10_000); });
    act(() => result.current.stop());
    expect(result.current.phase).toBe('idle');
    expect(result.current.isRunning).toBe(false);
    expect(result.current.secondsRemaining).toBe(25 * 60);
  });

  it('phaseTotalSeconds 反映当前 phase 的总秒数', () => {
    const { result } = renderHook(() => usePomodoro());
    expect(result.current.phaseTotalSeconds).toBe(25 * 60); // idle
    act(() => result.current.start());
    expect(result.current.phaseTotalSeconds).toBe(25 * 60); // focus
    act(() => result.current.skip());
    expect(result.current.phaseTotalSeconds).toBe(5 * 60); // short-break
  });
});
