import { lazy, Suspense, useMemo, useState } from 'react';
import { TaskList, type TaskFilter } from '../components/task/TaskList';
import { useTaskStore } from '../store/taskStore';
import { useFirstBrickShare } from '../features/share/useFirstBrickShare';

// A19: 分享 modal 懒加载(只在首次落砖时载入,不污染首屏 chunk)
const ShareBrickModal = lazy(() =>
  import('../features/share/ShareBrickModal').then((m) => ({
    default: m.ShareBrickModal,
  })),
);

function ShareModalFallback() {
  return null;
}

const FILTER_TABS: { key: TaskFilter; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'overdue', label: '逾期' },
  { key: 'upcoming', label: '即将' },
  { key: 'all', label: '全部' },
];

export function TodayPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const { shareTask, dismiss } = useFirstBrickShare(tasks);
  const [filter, setFilter] = useState<TaskFilter>('today');
  // useMemo 避免每次渲染都跑 filter(任务数大时有性能损失)
  const brickCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);

  // 每个过滤标签的计数(用于在 tab 上显示徽章)
  const counts = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    let today = 0, overdue = 0, upcoming = 0;
    for (const t of tasks) {
      if (t.completed) continue;
      const due = t.dueDate ? new Date(t.dueDate) : null;
      const created = t.createdAt ? new Date(t.createdAt) : null;
      if (due && due >= todayStart && due < todayEnd) today++;
      else if (!due && created && created >= todayStart && created < todayEnd) today++;
      if (due && due < todayStart) overdue++;
      if (due && due >= todayEnd) upcoming++;
    }
    return { today, overdue, upcoming, all: tasks.filter((t) => !t.completed).length };
  }, [tasks]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-6 sm:text-2xl">今日任务</h1>

      {/* P1-4:过滤标签 — 让用户快速切换 today/overdue/upcoming/all 视图 */}
      <div
        role="tablist"
        aria-label="任务过滤"
        className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800 sm:mb-6"
      >
        {FILTER_TABS.map((tab) => {
          const isActive = filter === tab.key;
          const count = counts[tab.key];
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(tab.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs ${
                    tab.key === 'overdue' && count > 0
                      ? 'bg-danger/15 text-danger'
                      : isActive
                        ? 'bg-primary/15 text-primary'
                        : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <TaskList filter={filter} />

      {/* 仅在 shareTask 存在时挂载,避免进入 TodayPage 就触发 lazy chunk 加载 */}
      {shareTask && (
        <Suspense fallback={<ShareModalFallback />}>
          <ShareBrickModal
            task={shareTask}
            brickCount={brickCount}
            onClose={dismiss}
          />
        </Suspense>
      )}
    </div>
  );
}
