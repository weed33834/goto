// usePomodoro — 番茄钟状态机 hook(s2)
//
// 设计:
// - phase: idle(未启动) / focus / short-break / long-break
// - secondsRemaining: 当前 phase 剩余秒数,每秒递减
// - completedFocusCount: 今日累计完成的 focus 段数(仅内存,重启清零;后续可接持久化)
// - 配置从 userPreferences.pomodoroSettings 读取;每次 phase 切换取最新配置
//   (用户中途改 focusDuration,正在进行的 phase 不变,下个 phase 才生效)
//
// 行为:
// - start(): idle 启动 focus;running 中 no-op;paused 状态下恢复
// - pause(): isRunning=false(保留 secondsRemaining)
// - reset(): 当前 phase 回到初始秒数,并暂停
// - skip(): 跳过当前 phase,直接进入下一 phase(按 autoStart* 决定是否自动启动)
// - stop(): 完全停止,回 idle,清空 secondsRemaining
//
// phase 切换规则:
//   focus 结束 → completedFocusCount++;若 count % longBreakInterval == 0 → long-break
//                否则 → short-break
//   break 结束 → focus
//   autoStartBreaks / autoStartFocus 控制下一 phase 是否自动启动
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../shared/store';

export type PomodoroPhase = 'idle' | 'focus' | 'short-break' | 'long-break';

export interface UsePomodoroState {
  phase: PomodoroPhase;
  secondsRemaining: number;
  isRunning: boolean;
  completedFocusCount: number;
}

export interface UsePomodoroActions {
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  stop: () => void;
}

export interface UsePomodoroResult extends UsePomodoroState, UsePomodoroActions {
  /** 当前 phase 总秒数(用于进度环渲染);idle 时返回 focusDuration*60。 */
  phaseTotalSeconds: number;
}

const PHASE_TO_DURATION_KEY = {
  focus: 'focusDuration',
  'short-break': 'shortBreakDuration',
  'long-break': 'longBreakDuration',
} as const;

function getPhaseSeconds(
  phase: Exclude<PomodoroPhase, 'idle'>,
  settings: { focusDuration: number; shortBreakDuration: number; longBreakDuration: number },
): number {
  const key = PHASE_TO_DURATION_KEY[phase];
  const minutes = settings[key];
  return Math.max(1, Math.floor(minutes)) * 60;
}

export function usePomodoro(): UsePomodoroResult {
  const pomodoroSettings = useAppStore((s) => s.userPreferences.pomodoroSettings);

  const [phase, setPhase] = useState<PomodoroPhase>('idle');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(
    () => Math.max(1, Math.floor(pomodoroSettings.focusDuration)) * 60,
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [completedFocusCount, setCompletedFocusCount] = useState<number>(0);

  // 配置可能在 hook 生命周期内变化;tick 内部不直接读 state(pomodoroSettings)避免闭包陈旧,
  // 改用 ref 同步最新配置。
  const settingsRef = useRef(pomodoroSettings);
  useEffect(() => {
    settingsRef.current = pomodoroSettings;
  }, [pomodoroSettings]);

  // 切换到指定 phase:重置 secondsRemaining 并按 shouldRun 决定是否自动启动。
  // 在 setPhase/setSecondsRemaining/setIsRunning 三个 setState 一并触发,React 18 自动 batch。
  const transitionTo = useCallback(
    (next: Exclude<PomodoroPhase, 'idle'>, shouldRun: boolean) => {
      const total = getPhaseSeconds(next, settingsRef.current);
      setPhase(next);
      setSecondsRemaining(total);
      setIsRunning(shouldRun);
    },
    [],
  );

  // tick:每秒 -1;到 0 时根据当前 phase 计算下一 phase。
  useEffect(() => {
    if (!isRunning) return;
    if (phase === 'idle') return;
    const id = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev > 1) return prev - 1;
        // prev === 1,下一秒将归零,在此触发 phase 切换。
        // 用 setTimeout 脱离 setState 回调,避免在 setState updater 中再调 setState 引发警告。
        window.setTimeout(() => {
          const s = settingsRef.current;
          if (phase === 'focus') {
            const newCount = completedFocusCount + 1;
            setCompletedFocusCount(newCount);
            const isLongBreak = newCount % Math.max(1, s.longBreakInterval) === 0;
            transitionTo(isLongBreak ? 'long-break' : 'short-break', s.autoStartBreaks);
          } else {
            // break 结束 → focus
            transitionTo('focus', s.autoStartFocus);
          }
        }, 0);
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRunning, phase, completedFocusCount, transitionTo]);

  const start = useCallback(() => {
    if (phase === 'idle') {
      transitionTo('focus', true);
    } else if (!isRunning) {
      setIsRunning(true);
    }
  }, [phase, isRunning, transitionTo]);

  const pause = useCallback(() => {
    if (isRunning) setIsRunning(false);
  }, [isRunning]);

  const reset = useCallback(() => {
    if (phase === 'idle') return;
    const total = getPhaseSeconds(phase as Exclude<PomodoroPhase, 'idle'>, settingsRef.current);
    setSecondsRemaining(total);
    setIsRunning(false);
  }, [phase]);

  const skip = useCallback(() => {
    if (phase === 'idle') return;
    const s = settingsRef.current;
    if (phase === 'focus') {
      // 跳过 focus 不计入完成数(用户主动放弃,不算"完成"一个番茄)
      const isLongBreak = (completedFocusCount + 1) % Math.max(1, s.longBreakInterval) === 0;
      transitionTo(isLongBreak ? 'long-break' : 'short-break', s.autoStartBreaks);
    } else {
      transitionTo('focus', s.autoStartFocus);
    }
  }, [phase, completedFocusCount, transitionTo]);

  const stop = useCallback(() => {
    setPhase('idle');
    setIsRunning(false);
    setSecondsRemaining(Math.max(1, Math.floor(settingsRef.current.focusDuration)) * 60);
  }, []);

  const phaseTotalSeconds =
    phase === 'idle'
      ? Math.max(1, Math.floor(pomodoroSettings.focusDuration)) * 60
      : getPhaseSeconds(phase, pomodoroSettings);

  return {
    phase,
    secondsRemaining,
    isRunning,
    completedFocusCount,
    phaseTotalSeconds,
    start,
    pause,
    reset,
    skip,
    stop,
  };
}
