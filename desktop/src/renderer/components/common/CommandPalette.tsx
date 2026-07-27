// CommandPalette — Cmd+K 命令面板(b2)
//
// 用户场景:任务量上来后,鼠标在侧栏翻找页面变慢;快捷键又记不住。
// 一个 Cmd+K 浮层能覆盖"跳页 + 执行操作 + 搜任务"三类高频意图,
// 是本地优先应用相比 SaaS 仍需补齐的基础体验。
//
// 设计:
// - 唤起:App.tsx 注册 mod+k → setActiveModal('command-palette')
// - 输入框:实时过滤命令(标题/副标题/关键词,大小写不敏感)
// - 列表:静态命令(导航+操作)+ 动态任务命令(最多 5 条)
// - 键盘:↑↓ 选择、Enter 执行、Esc / backdrop 关闭
// - 任务命中:选中后跳 /search?q=title,由 SearchPage 预填并展示
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../shared/store';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';

type CommandGroup = '导航' | '操作' | '任务';

interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  subtitle?: string;
  /** 额外搜索关键词(不展示,仅参与匹配) */
  keywords?: string;
  icon?: string;
  action: () => void;
}

const MAX_TASK_HITS = 5;

export function CommandPalette() {
  const activeModal = useAppStore((s) => s.activeModal);
  const setActiveModal = useAppStore((s) => s.setActiveModal);
  const tasks = useAppStore((s) => s.tasks);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const { lock } = useAuthStore();
  const setThemeMode = useThemeStore((s) => s.setMode);
  const themeMode = useThemeStore((s) => s.mode);

  const isOpen = activeModal === 'command-palette';
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 打开时聚焦输入框并重置状态;关闭时清空 query(下次打开是干净状态)
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      // nextTick 聚焦,确保 input 已挂载
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [isOpen]);

  // 构建静态命令(导航 + 操作)。每次渲染重建,因为闭包捕获了最新的 navigate/lock 等。
  // 命令数量 ~20,重建成本可忽略,避免 useCallback 引入的依赖管理复杂度。
  const staticCommands = useMemo<Command[]>(() => {
    const close = () => setActiveModal(null);
    const nav: Command[] = [
      { id: 'nav-mosaic', title: '时间织锦', group: '导航', icon: '🧱', keywords: 'mosaic home 首页', action: () => { close(); navigate('/mosaic'); } },
      { id: 'nav-today', title: '今日任务', group: '导航', icon: '☀️', keywords: 'today today今日', action: () => { close(); navigate('/today'); } },
      { id: 'nav-kanban', title: '看板', group: '导航', icon: '📋', keywords: 'kanban board', action: () => { close(); navigate('/kanban'); } },
      { id: 'nav-calendar', title: '日历', group: '导航', icon: '📅', keywords: 'calendar', action: () => { close(); navigate('/calendar'); } },
      { id: 'nav-projects', title: '项目', group: '导航', icon: '📁', keywords: 'projects', action: () => { close(); navigate('/projects'); } },
      { id: 'nav-categories', title: '分类', group: '导航', icon: '🗂️', keywords: 'categories', action: () => { close(); navigate('/categories'); } },
      { id: 'nav-tags', title: '标签', group: '导航', icon: '🏷️', keywords: 'tags', action: () => { close(); navigate('/tags'); } },
      { id: 'nav-templates', title: '任务模板', group: '导航', icon: '📋', keywords: 'templates 模板', action: () => { close(); navigate('/templates'); } },
      { id: 'nav-insights', title: '统计仪表', group: '导航', icon: '📊', keywords: 'insights stats 统计', action: () => { close(); navigate('/insights'); } },
      { id: 'nav-goals', title: 'OKR 目标', group: '导航', icon: '🎯', keywords: 'goals okr objective kr 目标', action: () => { close(); navigate('/goals'); } },
      { id: 'nav-review', title: '每周回顾', group: '导航', icon: '🔍', keywords: 'review 回顾', action: () => { close(); navigate('/review'); } },
      { id: 'nav-search', title: '搜索', group: '导航', icon: '🔎', keywords: 'search', action: () => { close(); navigate('/search'); } },
      { id: 'nav-smart-lists', title: '智能列表', group: '导航', icon: '🎯', keywords: 'smart filter dsl', action: () => { close(); navigate('/smart-lists'); } },
      { id: 'nav-pomodoro', title: '番茄钟', group: '导航', icon: '🍅', keywords: 'pomodoro focus timer 专注', action: () => { close(); navigate('/pomodoro'); } },
      { id: 'nav-habits', title: '习惯追踪', group: '导航', icon: '🌱', keywords: 'habits 习惯 streak 打卡', action: () => { close(); navigate('/habits'); } },
      { id: 'nav-vault', title: '保险库', group: '导航', icon: '🔒', keywords: 'vault', action: () => { close(); navigate('/vault'); } },
      { id: 'nav-time-capsule', title: '时间胶囊', group: '导航', icon: '✉️', keywords: 'time capsule letter 未来', action: () => { close(); navigate('/time-capsule'); } },
      { id: 'nav-plugins', title: '插件 / Skill', group: '导航', icon: '🧩', keywords: 'plugins skill 插件 auto-tag 自动标签', action: () => { close(); navigate('/plugins'); } },
      { id: 'nav-settings', title: '设置', group: '导航', icon: '⚙️', keywords: 'settings', action: () => { close(); navigate('/settings'); } },
    ];
    const ops: Command[] = [
      { id: 'op-lock', title: '锁定应用', group: '操作', icon: '🔐', keywords: 'lock 锁定', action: () => { close(); lock(); } },
      { id: 'op-toggle-sidebar', title: '折叠 / 展开侧栏', group: '操作', icon: '📐', keywords: 'sidebar 侧栏', action: () => { close(); toggleSidebar(); } },
      {
        id: 'op-theme-light',
        title: '切换到浅色主题',
        group: '操作',
        icon: '🌞',
        keywords: 'theme light 浅色',
        subtitle: themeMode === 'light' ? '当前' : undefined,
        action: () => { close(); setThemeMode('light'); },
      },
      {
        id: 'op-theme-dark',
        title: '切换到深色主题',
        group: '操作',
        icon: '🌙',
        keywords: 'theme dark 深色',
        subtitle: themeMode === 'dark' ? '当前' : undefined,
        action: () => { close(); setThemeMode('dark'); },
      },
      {
        id: 'op-theme-system',
        title: '跟随系统主题',
        group: '操作',
        icon: '🖥️',
        keywords: 'theme system 系统',
        subtitle: themeMode === 'system' ? '当前' : undefined,
        action: () => { close(); setThemeMode('system'); },
      },
      { id: 'op-shortcuts', title: '显示快捷键帮助', group: '操作', icon: '⌨️', keywords: 'shortcuts help 快捷键', action: () => { setActiveModal('shortcuts-help'); } },
    ];
    return [...nav, ...ops];
  }, [navigate, lock, toggleSidebar, setThemeMode, themeMode, setActiveModal]);

  // 输入非空时,把 tasks 也作为命令候选(最多 MAX_TASK_HITS 条)
  const taskCommands = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const close = () => setActiveModal(null);
    return tasks
      .filter((t) => t.title.toLowerCase().includes(q))
      .slice(0, MAX_TASK_HITS)
      .map((t) => ({
        id: `task-${t.id}`,
        title: t.title,
        group: '任务' as const,
        subtitle: '跳转到搜索查看',
        icon: '✓',
        action: () => {
          close();
          navigate(`/search?q=${encodeURIComponent(t.title)}`);
        },
      }));
  }, [query, tasks, navigate, setActiveModal]);

  // 过滤 + 排序:输入为空时返回全部静态命令;非空时模糊匹配静态+任务命令
  const filtered = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staticCommands;
    const matched: Array<{ cmd: Command; score: number }> = [];
    for (const cmd of [...staticCommands, ...taskCommands]) {
      const title = cmd.title.toLowerCase();
      const keywords = (cmd.keywords ?? '').toLowerCase();
      const subtitle = (cmd.subtitle ?? '').toLowerCase();
      let score = -1;
      if (title.startsWith(q)) score = 100;
      else if (title.includes(q)) score = 80;
      else if (keywords.includes(q)) score = 60;
      else if (subtitle.includes(q)) score = 40;
      if (score >= 0) matched.push({ cmd, score });
    }
    matched.sort((a, b) => b.score - a.score);
    return matched.map((m) => m.cmd);
  }, [query, staticCommands, taskCommands]);

  // 选中索引越界保护:过滤结果变化时,activeIndex 可能超出范围
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered.length, activeIndex]);

  // 滚动当前选中项到可见区域(↑↓ 切换时)。
  // 可选链调用:jsdom 等非浏览器环境未实现 scrollIntoView,跳过即可。
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-index="${activeIndex}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  const handleClose = () => setActiveModal(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) cmd.action();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  // 分组渲染:保持原始顺序(导航 → 操作 → 任务),但只渲染有命中的组
  const groupOrder: CommandGroup[] = ['导航', '操作', '任务'];
  let runningIndex = 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-start sm:p-4 sm:pt-[10vh]"
      onClick={handleClose}
    >
      <div
        className="flex max-h-[80vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800 sm:rounded-2xl sm:max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 输入框 */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 dark:border-slate-700">
          <span className="text-slate-400 dark:text-slate-500">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="跳转到页面、执行操作或搜索任务…"
            className="flex-1 bg-transparent py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            autoComplete="off"
            spellCheck={false}
            aria-label="命令搜索"
          />
          <kbd className="shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400">
            Esc
          </kbd>
        </div>

        {/* 命令列表 */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              没有匹配的命令
            </div>
          ) : (
            groupOrder.map((group) => {
              const items = filtered.filter((c) => c.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="mb-1">
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {group}
                  </p>
                  {items.map((cmd) => {
                    const idx = runningIndex++;
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        data-cmd-index={idx}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => cmd.action()}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        {cmd.icon && <span className="w-5 text-center">{cmd.icon}</span>}
                        <span className="flex-1 truncate">{cmd.title}</span>
                        {cmd.subtitle && (
                          <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                            {cmd.subtitle}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* 底部提示 */}
        <div className="border-t border-slate-200 px-3 py-1.5 text-[10px] text-slate-400 dark:border-slate-700 dark:text-slate-500">
          <span className="mr-3">↑↓ 选择</span>
          <span className="mr-3">↵ 执行</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
