import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../../shared/store';
import { useMediaQuery, MOBILE_QUERY } from '../../hooks/useMediaQuery';
import { Button } from '../common/Button';

interface SidebarProps {
  privacyMode?: boolean;
}

interface NavItem {
  id: string;
  label: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: '时间',
    items: [
      { id: 'mosaic', label: '时间织锦' },
    ],
  },
  {
    title: '任务',
    items: [
      { id: 'today', label: '今日任务' },
      { id: 'kanban', label: '看板' },
      { id: 'calendar', label: '日历' },
      { id: 'projects', label: '项目' },
      { id: 'categories', label: '分类' },
      { id: 'tags', label: '标签' },
    ],
  },
  {
    title: '洞察',
    items: [
      { id: 'insights', label: '统计仪表' },
      { id: 'review', label: '每周回顾' },
    ],
  },
  {
    title: '工具',
    items: [
      { id: 'search', label: '搜索' },
    ],
  },
  {
    title: '系统',
    items: [
      { id: 'vault', label: '保险库' },
      { id: 'settings', label: '设置' },
    ],
  },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50'
  }`;

export function Sidebar({ privacyMode }: SidebarProps) {
  const { lock } = useAuthStore();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const location = useLocation();

  // 路由切换时关闭移动端抽屉(桌面端不受影响)
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile, setSidebarOpen]);

  // 抽屉打开时锁定 body 滚动(仅移动端)
  useEffect(() => {
    if (isMobile && sidebarOpen) {
      document.body.classList.add('sidebar-drawer-open');
      return () => document.body.classList.remove('sidebar-drawer-open');
    }
    document.body.classList.remove('sidebar-drawer-open');
  }, [isMobile, sidebarOpen]);

  // ESC 键关闭抽屉(移动端)
  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMobile, sidebarOpen, setSidebarOpen]);

  const handleLock = () => {
    setSidebarOpen(false);
    lock();
  };

  // ─── 移动端:抽屉 + 遮罩 ────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {/* 遮罩层:抽屉打开时显示,点击关闭 */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-normal"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white transition-transform duration-normal ease-standard dark:border-slate-700 dark:bg-slate-800 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } ${privacyMode ? 'opacity-50' : ''}`}
          aria-label="主导航"
          aria-hidden={!sidebarOpen}
        >
          <div className="safe-area-top flex items-center justify-between p-4">
            <span className="text-lg font-semibold text-slate-800 dark:text-slate-100">Goto</span>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="关闭菜单"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
            {navGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {group.title}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavLink key={item.id} to={`/${item.id}`} className={navLinkClass}>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="safe-area-bottom p-3">
            <Button variant="ghost" className="w-full justify-start" onClick={handleLock}>
              锁定
            </Button>
          </div>
        </aside>
      </>
    );
  }

  // ─── 桌面端:固定 sidebar,可折叠(mod+b / mod 按钮切换) ──────────────────
  return (
    <aside
      className={`flex flex-col border-r border-slate-200 bg-white transition-all duration-normal ease-standard dark:border-slate-700 dark:bg-slate-800 ${
        sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'
      } ${privacyMode ? 'opacity-50' : ''}`}
      aria-label="主导航"
    >
      <div className="flex w-56 items-center justify-between p-4">
        <span className="text-lg font-semibold text-slate-800 dark:text-slate-100">Goto</span>
        <button
          onClick={() => setSidebarOpen(false)}
          aria-label="折叠侧栏"
          title="折叠侧栏 (Ctrl/Cmd+B)"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {navGroups.map((group) => (
          <div key={group.title}>
            <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {group.title}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink key={item.id} to={`/${item.id}`} className={navLinkClass}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-3">
        <Button variant="ghost" className="w-full justify-start" onClick={handleLock}>
          锁定
        </Button>
      </div>
    </aside>
  );
}
