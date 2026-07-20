import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

// 自动锁定间隔的合法范围（分钟）。低于最小值等同于关闭，超过最大值视为异常输入并夹紧，
// 防止外部传入 NaN / 负数 / 极大值导致 setTimeout 行为异常（TF2-009）。
const MIN_AUTOLOCK_MINUTES = 0; // 0 表示关闭自动锁定
const MAX_AUTOLOCK_MINUTES = 24 * 60; // 最多 24 小时

// P2-2:mousemove 高频事件节流间隔。
// mousemove 在用户移动鼠标时每秒可触发 60+ 次,原实现每次都 clearTimeout + setTimeout,
// 让浏览器 timer 队列持续高频调度。1 秒 throttle 不影响"活动检测"语义(锁定阈值是分钟级),
// 但能把 timer 操作降到 ≤1 次/秒。
const MOUSEMOVE_THROTTLE_MS = 1000;

function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  if (minutes <= MIN_AUTOLOCK_MINUTES) return 0;
  if (minutes > MAX_AUTOLOCK_MINUTES) return MAX_AUTOLOCK_MINUTES;
  return minutes;
}

export function useAutoLock(minutes: number) {
  const { lock } = useAuthStore();
  const safeMinutes = clampMinutes(minutes);

  useEffect(() => {
    if (safeMinutes <= 0) return;

    let timeout: ReturnType<typeof setTimeout>;
    let lastMouseMoveAt = 0;

    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => lock(), safeMinutes * 60 * 1000);
    };

    // mousemove 节流:超过 MOUSEMOVE_THROTTLE_MS 才真正 reset timer,
    // 否则只更新 lastMouseMoveAt 记录(避免每次移动都触发 timer 重排)
    const onMouseMove = () => {
      const now = Date.now();
      if (now - lastMouseMoveAt >= MOUSEMOVE_THROTTLE_MS) {
        lastMouseMoveAt = now;
        resetTimer();
      }
    };

    const events: Array<[string, () => void]> = [
      ['mousedown', resetTimer],
      ['keydown', resetTimer],
      ['mousemove', onMouseMove],
    ];
    events.forEach(([event, handler]) => window.addEventListener(event, handler));
    resetTimer();

    return () => {
      clearTimeout(timeout);
      events.forEach(([event, handler]) => window.removeEventListener(event, handler));
    };
  }, [safeMinutes, lock]);
}
