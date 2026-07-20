// Toaster — 渲染 uiSlice.notifications 为可点击的右上角堆叠 toast。
//
// 之前 uiSlice.addNotification 写入 state 后无组件读取(0 渲染点),
// tasksSlice 错误时只 console.warn → 用户看不到任何反馈。
// 本组件:
// - 订阅 uiSlice.notifications(只显示最新 5 条,避免刷屏)
// - 5 秒自动消失(调 markNotificationRead 清除 unread 状态)
// - 支持 action 按钮 Undo / 跳转
// - 不阻塞交互:固定 pointer-events-none 容器 + 子元素 pointer-events-auto
import { useEffect } from 'react';
import { useAppStore } from '../../../shared/store';
import type { Notification } from '../../../shared/types';

const VISIBLE_COUNT = 5;
const AUTO_DISMISS_MS = 5000;

function NotificationItem({ n }: { n: Notification }) {
  const markRead = useAppStore((s) => s.markNotificationRead);

  useEffect(() => {
    const t = setTimeout(() => markRead(n.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [n.id, markRead]);

  const tone =
    n.type === 'system' || n.type === 'reminder'
      ? 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-100'
      : 'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

  const action = (n.data?.actionLabel as string | undefined) ?? null;
  const actionFn = (n.data?.actionFn as (() => void) | undefined) ?? null;

  return (
    <div
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-md ${tone}`}
      role="status"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{n.title}</p>
        {n.message && (
          <p className="mt-0.5 break-words text-xs opacity-80">{n.message}</p>
        )}
      </div>
      {action && actionFn && (
        <button
          type="button"
          data-touch-target
          onClick={() => {
            try { actionFn(); } finally { markRead(n.id); }
          }}
          className="shrink-0 px-2 py-1 text-xs font-semibold text-primary hover:underline"
        >
          {action}
        </button>
      )}
      <button
        type="button"
        aria-label="关闭"
        data-touch-target
        onClick={() => markRead(n.id)}
        className="shrink-0 px-2 py-1 text-xs opacity-50 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Toaster — 挂在 App 顶层,订阅 notifications 并渲染。
 * 已读的通知从 unread 列表移除(下一帧渲染时消失)。
 */
export function Toaster() {
  const notifications = useAppStore((s) => s.notifications);
  // 只渲染未读 + 最近 N 条(避免历史通知全部弹出)
  const visible = notifications.filter((n) => !n.isRead).slice(0, VISIBLE_COUNT);

  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:p-0">
      {visible.map((n) => (
        <NotificationItem key={n.id} n={n} />
      ))}
    </div>
  );
}
