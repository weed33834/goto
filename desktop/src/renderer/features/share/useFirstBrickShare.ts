/**
 * A19 分享单块砖 — 首次落砖检测 hook(§3.6 / §5 A19)
 *
 * 触发条件:
 * - 当前用户首次完成任务(completed 任务数从 0 → 1)
 * - 仅本次会话内触发一次(避免已完成多块的老用户被反复弹窗)
 *
 * 返回:
 * - shareTask: 当前应分享的任务(或 null)
 * - dismiss: 关闭分享 modal
 */

import { useEffect, useRef, useState } from 'react';
import type { Task } from '../../../shared/types';

const SESSION_FLAG = 'goto:shareModalShown';

interface UseFirstBrickShareResult {
  shareTask: Task | null;
  dismiss: () => void;
}

export function useFirstBrickShare(tasks: Task[]): UseFirstBrickShareResult {
  const [shareTask, setShareTask] = useState<Task | null>(null);
  const prevCompletedCount = useRef<number>(-1);
  const shownThisSession = useRef<boolean>(false);

  useEffect(() => {
    // 初始化标记:本次会话已弹过则不再触发
    if (typeof sessionStorage !== 'undefined') {
      shownThisSession.current = sessionStorage.getItem(SESSION_FLAG) === '1';
    }

    const completedTasks = tasks.filter((t) => t.completed);
    const currentCount = completedTasks.length;

    // 首次加载未完成初始化(prevCompletedCount = -1 表示首次)
    if (prevCompletedCount.current === -1) {
      prevCompletedCount.current = currentCount;
      return;
    }

    // 检测"0 → 1"跳变(且本会话未弹过)
    if (
      prevCompletedCount.current === 0 &&
      currentCount >= 1 &&
      !shownThisSession.current
    ) {
      // 取刚完成的最后一个(按 completedAt 倒序)
      const justCompleted = completedTasks
        .slice()
        .sort((a, b) => {
          const ta = a.completedAt?.getTime() ?? 0;
          const tb = b.completedAt?.getTime() ?? 0;
          return tb - ta;
        })[0];
      if (justCompleted) {
        setShareTask(justCompleted);
        shownThisSession.current = true;
        if (typeof sessionStorage !== 'undefined') {
          try {
            sessionStorage.setItem(SESSION_FLAG, '1');
          } catch {
            // sessionStorage 不可用则忽略
          }
        }
      }
    }

    prevCompletedCount.current = currentCount;
  }, [tasks]);

  const dismiss = () => setShareTask(null);

  return { shareTask, dismiss };
}
