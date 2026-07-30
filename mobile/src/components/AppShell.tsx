import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, ListTodo, KanbanSquare, Lock, RefreshCw } from 'lucide-react';

// 移动端专属:底部 Tab 导航(替代桌面端侧边栏/多栏)。
// 固定底栏 + 安全区适配(env safe-area),内容区独立滚动。
const tabs = [
  { to: '/today', label: '今日', icon: CalendarDays },
  { to: '/tasks', label: '任务', icon: ListTodo },
  { to: '/board', label: '看板', icon: KanbanSquare },
  { to: '/vault', label: '保险库', icon: Lock },
  { to: '/sync', label: '同步', icon: RefreshCw },
];

export default function AppShell() {
  return (
    <div className="flex h-full flex-col bg-ink text-paper">
      <main className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-[calc(env(safe-area-inset-top)+1rem)]">
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-paper/10 bg-ink/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            data-testid={`tab-${label}`}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs-2 ${
                isActive ? 'text-gold' : 'text-paper/60'
              }`
            }
          >
            <Icon size={22} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
