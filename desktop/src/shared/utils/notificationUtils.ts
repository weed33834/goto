// 共享通知工具 — 提取自各 slice 中重复的 pushNotification。
// 所有 slice 统一调用此函数，避免 5 份拷贝。
import type { AppStore } from '../store/types';
import type { Notification } from '../types';
import { generateId } from '../store/constants';

export interface PushNotificationParams {
  type: Notification['type'];
  title: string;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * 向 store 推送一条用户可见通知。Toaster 组件会自动渲染并定时消失。
 *
 * @param get   Zustand getter，slice 内用 get() 传入。
 * @param params 通知参数；data 可选，不传时默认为空对象。
 */
export function pushNotification(
  get: () => AppStore,
  params: PushNotificationParams,
): void {
  const notification: Notification = {
    id: `n-${generateId()}`,
    type: params.type,
    title: params.title,
    message: params.message ?? '',
    data: params.data ?? {},
    isRead: false,
    isArchived: false,
    actionUrl: null,
    createdAt: new Date(),
  };
  get().addNotification(notification);
}
