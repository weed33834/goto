// KeyboardShortcutsHelp — `?` 触发的快捷键浮层。
//
// P1-1 修复:之前 App.tsx 注册了 5 个全局快捷键(mod+l/n/k/b、`/`、`?`),
// 但用户根本发现不了,设置页也没有任何文档。本组件:
// - 订阅 uiSlice.activeModal === 'shortcuts-help' 显示
// - 渲染当前已注册的全局快捷键列表(数据源与本组件同级维护,与 App.tsx 注册保持一致)
// - 支持 Esc 关闭(走 useKeyboardShortcuts,但浮层自身也监听一次以防漏)
// - 移动端全屏卡片,桌面端居中卡片
import { useEffect } from 'react';
import { useAppStore } from '../../../shared/store';

interface ShortcutEntry {
  combo: string;
  description: string;
  group: '全局' | '导航' | '编辑';
}

// 实际生效的全局快捷键列表(与 App.tsx useKeyboardShortcuts 注册同步)
// 注意:macOS 上 mod = Cmd,Windows/Linux 上 mod = Ctrl
const SHORTCUTS: ShortcutEntry[] = [
  { combo: '?', description: '显示本快捷键帮助', group: '全局' },
  { combo: 'Mod + L', description: '锁定应用(立即返回锁屏)', group: '全局' },
  { combo: 'Mod + B', description: '折叠 / 展开侧栏', group: '全局' },
  { combo: 'Mod + K', description: '打开命令面板(跳页 / 操作 / 搜任务)', group: '导航' },
  { combo: '/', description: '跳到搜索(轻量入口,与命令面板互补)', group: '导航' },
  { combo: 'Mod + N', description: '跳到今日任务并自动聚焦新建输入框', group: '导航' },
  { combo: 'Esc', description: '关闭弹层 / 取消编辑', group: '全局' },
];

const GROUP_ORDER: ShortcutEntry['group'][] = ['全局', '导航', '编辑'];

export function KeyboardShortcutsHelp() {
  const activeModal = useAppStore((s) => s.activeModal);
  const setActiveModal = useAppStore((s) => s.setActiveModal);

  const isOpen = activeModal === 'shortcuts-help';

  // Esc 关闭:虽然 useKeyboardShortcuts 没注册 esc,但浮层打开时直接监听一次更稳。
  // 还监听 backdrop 点击关闭。
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setActiveModal(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, setActiveModal]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="键盘快捷键"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => setActiveModal(null)}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800 sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            键盘快捷键
          </h2>
          <button
            type="button"
            data-touch-target
            aria-label="关闭"
            onClick={() => setActiveModal(null)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:border-slate-600 dark:bg-slate-700">Mod</kbd>{' '}
          在 macOS 上是 <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:border-slate-600 dark:bg-slate-700">⌘ Cmd</kbd>,
          在 Windows / Linux 上是 <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:border-slate-600 dark:bg-slate-700">Ctrl</kbd>。
        </p>

        <div className="space-y-5">
          {GROUP_ORDER.map((group) => {
            const entries = SHORTCUTS.filter((s) => s.group === group);
            if (entries.length === 0) return null;
            return (
              <div key={group}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {group}
                </h3>
                <ul className="space-y-1.5">
                  {entries.map((s) => (
                    <li
                      key={s.combo}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <span className="text-sm text-slate-700 dark:text-slate-200">
                        {s.description}
                      </span>
                      <kbd className="shrink-0 rounded border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                        {s.combo}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="mt-5 border-t border-slate-200 pt-3 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
          小贴士:在输入框中时,只有 <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[10px] dark:border-slate-600 dark:bg-slate-700">Esc</kbd> 与带 <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[10px] dark:border-slate-600 dark:bg-slate-700">Mod</kbd> 的组合仍生效,单字符快捷键(如 <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[10px] dark:border-slate-600 dark:bg-slate-700">/</kbd>、<kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[10px] dark:border-slate-600 dark:bg-slate-700">?</kbd>)会被屏蔽以免影响输入。
        </p>
      </div>
    </div>
  );
}
