// useVimShortcuts — TaskList 的 vim 风格键盘导航(Phase 1.9)
//
// 绑定的按键(仅在 list 容器 focus 或全局无 input 聚焦时生效):
//   j / ↓  : 选中下一个任务
//   k / ↑  : 选中上一个任务
//   enter  : 编辑当前选中任务
//   e      : 编辑当前选中任务(同 enter)
//   x      : 切换当前选中任务的完成状态
//   d      : 删除当前选中任务(带 undo 提示)
//   #      : 给当前选中任务加标签(打开标签输入)
//   gg     : 跳到第一个(双击 g)
//   G      : 跳到最后一个
//   /      : 跳转到搜索页
//
// 不在 input / textarea / select 聚焦时触发,避免误拦截打字。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '../types';

export interface VimActions {
  /** 编辑任务(打开 TaskEditor inline) */
  editTask: (id: string) => void;
  /** 切换任务完成状态 */
  toggleComplete: (id: string) => void;
  /** 删除任务(store 内部会推 undo) */
  deleteTask: (id: string) => void;
  /** 跳到搜索页 */
  goSearch?: () => void;
}

export function useVimShortcuts(tasks: Task[], actions: VimActions) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // 选中索引越界时自动校正
  const safeIndex = useCallback(
    (idx: number): number => {
      if (tasks.length === 0) return -1;
      if (idx < 0) return 0;
      if (idx >= tasks.length) return tasks.length - 1;
      return idx;
    },
    [tasks.length],
  );

  const selectByIndex = useCallback(
    (idx: number) => {
      const i = safeIndex(idx);
      if (i >= 0) setSelectedId(tasks[i].id);
    },
    [safeIndex, tasks],
  );

  // tasks 列表变化时,如果当前 selectedId 不在新列表中,清空选中
  useEffect(() => {
    if (selectedId && !tasks.some((t) => t.id === selectedId)) {
      setSelectedId(null);
    }
  }, [tasks, selectedId]);

  // 双击 g 状态记录
  const lastGRef = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 在 input / textarea / select / contenteditable 内不触发
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (target?.isContentEditable) return;
      // 任何修饰键(ctrl/cmd/alt)都不算 vim 单键
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key;
      const tasksList = tasks;
      if (tasksList.length === 0) return;
      const currentIdx = selectedId
        ? tasksList.findIndex((t) => t.id === selectedId)
        : -1;

      switch (key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          selectByIndex(currentIdx < 0 ? 0 : currentIdx + 1);
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          selectByIndex(currentIdx < 0 ? 0 : currentIdx - 1);
          break;
        case 'G':
          e.preventDefault();
          selectByIndex(tasksList.length - 1);
          break;
        case 'g': {
          // 双击 g 跳到第一个
          const now = Date.now();
          if (now - lastGRef.current < 500) {
            e.preventDefault();
            selectByIndex(0);
            lastGRef.current = 0;
          } else {
            lastGRef.current = now;
          }
          break;
        }
        case 'Enter':
        case 'e': {
          if (!selectedId) return;
          e.preventDefault();
          actionsRef.current.editTask(selectedId);
          break;
        }
        case 'x': {
          if (!selectedId) return;
          e.preventDefault();
          actionsRef.current.toggleComplete(selectedId);
          break;
        }
        case 'd': {
          if (!selectedId) return;
          e.preventDefault();
          actionsRef.current.deleteTask(selectedId);
          break;
        }
        case '/': {
          e.preventDefault();
          actionsRef.current.goSearch?.();
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tasks, selectedId, selectByIndex]);

  return { selectedId, setSelectedId };
}
