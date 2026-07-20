import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../../shared/store';

/**
 * MobileHeader — 移动端顶部栏(< md 显示)
 *
 * 内容:
 * - 左:汉堡菜单按钮(打开 Sidebar 抽屉)
 * - 中:Goto logo
 * - 右:快速添加任务按钮(P1-8)+ 快速锁定按钮
 *
 * 桌面端隐藏(md:hidden),桌面端用 Sidebar 的内置折叠按钮
 */
export function MobileHeader() {
  const { lock } = useAuthStore();
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const navigate = useNavigate();

  // P1-8:移动端快速添加任务 — 一键跳到 /today,TaskEditor 在顶部 autofocus
  // 之前移动端加任务要 3 步:打开菜单 → 点今日任务 → 滚到顶部 TaskEditor
  const handleQuickAdd = () => {
    navigate('/today');
    // 用 hash 锚点让浏览器滚到 TaskEditor(顶部)
    requestAnimationFrame(() => {
      const editor = document.querySelector('input[placeholder*="任务"], textarea[placeholder*="任务"]');
      if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
        editor.focus();
        editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  };

  return (
    <header className="safe-area-top flex h-14 items-center justify-between border-b border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-800 md:hidden">
      <button
        onClick={() => setSidebarOpen(true)}
        aria-label="打开菜单"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
          <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
        </svg>
      </button>
      <span className="text-base font-semibold text-slate-800 dark:text-slate-100">Goto</span>
      <div className="flex items-center gap-1">
        <button
          onClick={handleQuickAdd}
          aria-label="快速添加任务"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={lock}
          aria-label="锁定"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </button>
      </div>
    </header>
  );
}
