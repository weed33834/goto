// useReminders — 提醒系统 hook
//
// Phase 1.1:把 Task.reminderDate 字段真正接通浏览器 Notification API。
// s3 扩展:扫描 habits,在每日首次扫描时为"今日未打卡的活跃习惯"推一条汇总提醒。
//
// 工作原理:
//   1. 应用启动时请求 Notification 权限(若未授权)
//   2. 每 30 秒扫描一次 tasks,找出 reminderDate 在"过去 0-60s 之间"且未提醒过的任务
//   3. 触发浏览器 Notification,推 toast,记录已提醒 id 避免重复
//   4. 习惯提醒:每个本地日历日只推一次,汇总"今日还有 N 个习惯未打卡"
//
// 不依赖 Service Worker 也能工作 — 浏览器原生 Notification 在页面打开时即可触发。
// Service Worker 推送(后台/锁屏时)留给 Phase 4。
//
// 注意:
//   - 通知权限被拒绝时静默降级,只用应用内 toast
//   - 任务的 reminderDate === null 时不提醒
//   - 已完成的任务不提醒
//   - 已提醒过的 id 记在 ref,避免同一条 30 秒内重复触发

import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import type { Notification } from '../types';
import { toDateKey as toDateStr, startOfWeek } from '../utils/dateUtils';

const REMINDER_SCAN_INTERVAL_MS = 30_000;
const REMINDER_TRIGGER_WINDOW_MS = 60_000; // 提醒 0-60s 内到期的任务
const HABIT_REMINDER_HOUR = 20; // 习惯每日汇总提醒触发时点:20:00 之后首次扫描

/** 静默时间(quiet hours)判定:返回 true 表示当前在静默时间内,不触发通知。 */
function isInQuietHours(start: string, end: string): boolean {
  if (!start || !end) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [sH, sM] = start.split(':').map(Number);
  const [eH, eM] = end.split(':').map(Number);
  const startMin = sH * 60 + sM;
  const endMin = eH * 60 + eM;
  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return currentMinutes >= startMin && currentMinutes < endMin;
  }
  // 跨夜:22:00 - 08:00
  return currentMinutes >= startMin || currentMinutes < endMin;
}

/** 请求通知权限。用户已授权 / 已拒绝时无副作用。 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied';
    }
  }
  return Notification.permission;
}

/**
 * useReminders — 在应用根挂载一次即可。
 *
 * 订阅 tasks 列表,30s 周期扫描 reminderDate 到期任务,触发通知。
 * 同时支持首次挂载立即扫一次(避免应用启动时错过已到期提醒)。
 */
export function useReminders(): void {
  const remindedIdsRef = useRef<Set<string>>(new Set());
  const lastScanRef = useRef<number>(Date.now());
  // 习惯提醒:记录上次推送的本地日历日,避免同一天重复推送
  const lastHabitReminderDayRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;

    const scan = () => {
      if (cancelled) return;

      const state = useAppStore.getState();
      const tasks = state.tasks;
      const notifPrefs = state.userPreferences.notifications;
      const now = Date.now();
      const windowStart = lastScanRef.current;
      const windowEnd = now + REMINDER_TRIGGER_WINDOW_MS;

      // 静默时间降级:只跳过浏览器通知,应用内 toast 仍然推
      const inQuiet = notifPrefs.quietHoursEnabled && isInQuietHours(notifPrefs.quietHoursStart, notifPrefs.quietHoursEnd);

      // 用户在 prefs 里关了 taskReminders 总开关 → 完全跳过任务提醒
      if (notifPrefs.taskReminders) {
        for (const task of tasks) {
          if (task.completed) continue;
          if (!task.reminderDate) continue;
          if (remindedIdsRef.current.has(task.id)) continue;

          const reminderMs = task.reminderDate.getTime();
          // 触发条件:提醒时间在 [windowStart, windowEnd] 之间
          // 即上次扫描后到现在 + 60s 内到期的任务
          if (reminderMs < windowStart || reminderMs > windowEnd) continue;

          remindedIdsRef.current.add(task.id);

          const title = `提醒:${task.title}`;
          const body = task.dueDate
            ? `截止 ${task.dueDate.toLocaleString()}`
            : '点击查看详情';

          // 浏览器 Notification(非静默时间)
          if (!inQuiet && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              const n = new Notification(title, {
                body,
                tag: task.id,
                icon: '/icon.svg',
                badge: '/icon.svg',
                data: { taskId: task.id },
              });
              n.onclick = () => {
                window.focus();
                // HashRouter 跳转到今日任务
                if (window.location.hash !== '#/today') {
                  window.location.hash = '#/today';
                }
                n.close();
              };
            } catch (e) {
              console.warn('Notification trigger failed:', e);
            }
          }

          // 应用内 toast(总是推,即使静默时间也留记录)
          const toast: Notification = {
            id: `reminder-${task.id}-${now}`,
            type: 'reminder',
            title,
            message: body,
            data: { taskId: task.id },
            isRead: false,
            isArchived: false,
            actionUrl: '/today',
            createdAt: new Date(),
          };
          state.addNotification(toast);
        }
      }

      // ── 习惯每日汇总提醒(s3 扩展) ──────────────────────────────────
      // 触发条件:
      //   1. 当前本地时间 ≥ 20:00(用户已到晚上,该盘点今日习惯)
      //   2. 今天还没推过(lastHabitReminderDayRef !== todayStr)
      //   3. 存在"活跃且今日未打卡"的习惯
      // 不走 taskReminders 开关 — 习惯提醒归 dailyDigest 一类,这里走系统通知,
      // 与"每日盘点"语义一致;用户关 taskReminders 不应顺带关掉习惯盘点。
      scanHabitReminders(state, inQuiet, lastHabitReminderDayRef);

      lastScanRef.current = now;
    };

    // 首次挂载扫一次(应用启动时)
    scan();

    const intervalId = window.setInterval(scan, REMINDER_SCAN_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  // 权限请求:挂载后异步请求(不阻塞 UI)
  useEffect(() => {
    requestNotificationPermission().catch(() => {
      // 静默失败 — 用户可后续在 Settings 里手动开启
    });
  }, []);
}

/**
 * 扫描 habits,在晚 8 点后首次扫描时推送"今日未打卡习惯汇总"。
 *
 * 设计取舍:
 *   - 每日一次:用 lastHabitReminderDayRef 记录本地日历日,跨日才允许再推
 *   - weekly 习惯:本周一为起点,本周内有打卡即视为已完成
 *   - 不为每个 habit 单独推一条,避免通知泛滥;汇总成一条
 */
function scanHabitReminders(
  state: ReturnType<typeof useAppStore.getState>,
  inQuiet: boolean,
  lastDayRef: React.MutableRefObject<string>,
): void {
  const now = new Date();
  // 20:00 前不触发,避免在白天反复打断用户
  if (now.getHours() < HABIT_REMINDER_HOUR) return;

  const todayKey = toDateStr(now);
  if (lastDayRef.current === todayKey) return;

  const activeHabits = state.habits.filter((h) => !h.archived);
  if (activeHabits.length === 0) return;

  const todayStr = toDateStr(now);
  const weekStartStr = toDateStr(startOfWeek(now));

  const pending = activeHabits.filter((h) => {
    if (h.cadence === 'daily') return !h.completedDates.includes(todayStr);
    // weekly:本周内任意一天已打卡即视为完成
    return !h.completedDates.some((d) => d >= weekStartStr);
  });

  if (pending.length === 0) return;

  lastDayRef.current = todayKey;

  const title = `还有 ${pending.length} 个习惯今日未打卡`;
  const body = pending.slice(0, 3).map((h) => h.name).join('、') + (pending.length > 3 ? ' 等' : '');

  if (!inQuiet && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, {
        body,
        tag: `habits-${todayKey}`,
        icon: '/icon.svg',
        badge: '/icon.svg',
        data: { habits: true },
      });
      n.onclick = () => {
        window.focus();
        if (window.location.hash !== '#/habits') {
          window.location.hash = '#/habits';
        }
        n.close();
      };
    } catch (e) {
      console.warn('Habit notification trigger failed:', e);
    }
  }

  const toast: Notification = {
    id: `habit-reminder-${todayKey}-${Date.now()}`,
    type: 'reminder',
    title,
    message: body,
    data: { habits: true },
    isRead: false,
    isArchived: false,
    actionUrl: '/habits',
    createdAt: new Date(),
  };
  state.addNotification(toast);
}

/**
 * 清理已提醒 id 缓存 — 在任务被删除时调用,避免 set 无限增长。
 * 当前实现使用 Set,长期运行后可能积累;简单起见暂不主动清理,
 * 任务量 < 10k 时 Set 内存占用可忽略。
 */
export function clearRemindedTaskId(taskId: string): void {
  // 通过模块级 ref 暴露清理接口(暂未使用,留作未来扩展)
  void taskId;
}
