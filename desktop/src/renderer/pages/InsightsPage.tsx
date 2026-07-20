// InsightsPage — 统计仪表盘(Phase 2.2)
//
// 展示:
//   - 顶部 4 张统计卡(总任务 / 已完成 / 今日待办 / 逾期)
//   - 完成趋势(近 14 天每日完成数 — 简易条形图)
//   - 按优先级分布(横条)
//   - 按状态分布(横条)
//   - 按项目分布(横条)
//   - 能量 / 上下文分布(可选轻量显示)
//
// 设计取舍:纯 SVG + Tailwind,不引图表库;数据全部从 useAppStore.tasks 派生,无后端依赖。
// Karma 分数(类 Todoist)展示在顶部 — 用 7 日完成数加权算出一个 0-1000 的相对分数。

import { useMemo } from 'react';
import { useAppStore } from '../../shared/store';
import { useTaskStore } from '../store/taskStore';
import type { Priority, TaskStatus } from '../../shared/types';

const PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high', 'urgent', 'critical'];
const PRIORITY_LABEL: Record<Priority, string> = {
  low: '低', medium: '中', high: '高', urgent: '紧急', critical: '关键',
};
const PRIORITY_COLOR: Record<Priority, string> = {
  low: 'bg-slate-300 dark:bg-slate-600',
  medium: 'bg-blue-400',
  high: 'bg-amber-400',
  urgent: 'bg-orange-500',
  critical: 'bg-rose-500',
};

const STATUS_ORDER: TaskStatus[] = ['todo', 'in-progress', 'waiting', 'delegated', 'completed', 'cancelled', 'on-hold'];
const STATUS_LABEL: Record<TaskStatus, string> = {
  'todo': '待办', 'in-progress': '进行中', 'waiting': '等待', 'delegated': '已委派',
  'completed': '已完成', 'cancelled': '已取消', 'on-hold': '暂停',
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'primary' | 'danger' | 'success';
}) {
  const toneClass = {
    default: 'text-slate-800 dark:text-slate-100',
    primary: 'text-primary',
    danger: 'text-danger',
    success: 'text-emerald-500',
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function BarRow({
  label,
  value,
  total,
  colorClass,
}: {
  label: string;
  value: number;
  total: number;
  colorClass: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-16 shrink-0 text-slate-600 dark:text-slate-300">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-700">
        <div className={`flex h-full items-center justify-end px-1.5 text-xs text-white ${colorClass}`} style={{ width: `${Math.max(pct, 4)}%` }}>
          {value > 0 && value}
        </div>
      </div>
      <span className="w-10 shrink-0 text-right text-xs text-slate-500">{pct}%</span>
    </div>
  );
}

export function InsightsPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useAppStore((s) => s.projects);

  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const active = tasks.filter((t) => !t.isArchived && !t.isDeleted);
    const completedAll = active.filter((t) => t.completed);
    const todayTodo = active.filter((t) => {
      if (t.completed) return false;
      const due = t.dueDate ? new Date(t.dueDate) : null;
      if (due && due >= todayStart && due < todayEnd) return true;
      if (!due && t.createdAt && isSameDay(new Date(t.createdAt), now)) return true;
      return false;
    });
    const overdue = active.filter((t) => {
      if (t.completed) return false;
      return t.dueDate ? new Date(t.dueDate) < todayStart : false;
    });

    // 近 14 天每日完成数
    const last14Days: { key: string; label: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      last14Days.push({
        key: dateKey(d),
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        count: 0,
      });
    }
    const map = new Map(last14Days.map((x) => [x.key, x]));
    for (const t of completedAll) {
      if (!t.completedAt) continue;
      const key = dateKey(startOfDay(new Date(t.completedAt)));
      const entry = map.get(key);
      if (entry) entry.count++;
    }
    const maxDaily = Math.max(1, ...last14Days.map((d) => d.count));

    // 按优先级 / 状态 / 项目分布(基于 active 任务)
    const byPriority = PRIORITY_ORDER.map((p) => ({
      key: p,
      label: PRIORITY_LABEL[p],
      count: active.filter((t) => t.priority === p).length,
      color: PRIORITY_COLOR[p],
    }));
    const byStatus = STATUS_ORDER.map((s) => ({
      key: s,
      label: STATUS_LABEL[s],
      count: active.filter((t) => t.status === s).length,
    }));
    const byProject = projects.map((p) => ({
      key: p.id,
      label: p.name,
      color: p.color,
      count: active.filter((t) => t.projectId === p.id).length,
    }));
    const noProject = active.filter((t) => !t.projectId).length;

    // Karma:7 日完成数 × 10 + 14 日完成数 × 5,封顶 1000
    const last7Sum = last14Days.slice(7).reduce((s, d) => s + d.count, 0);
    const last14Sum = last14Days.reduce((s, d) => s + d.count, 0);
    const karma = Math.min(1000, last7Sum * 10 + last14Sum * 5);

    // 估计总时长(分钟)
    const totalEstimated = active.reduce((s, t) => s + (t.estimatedTime ?? 0), 0);
    const totalActual = active.reduce((s, t) => s + (t.actualTime ?? 0), 0);

    return {
      total: active.length,
      completed: completedAll.length,
      todayTodo: todayTodo.length,
      overdue: overdue.length,
      last14Days,
      maxDaily,
      byPriority,
      byStatus,
      byProject,
      noProject,
      karma,
      totalEstimated,
      totalActual,
    };
  }, [tasks, projects]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">统计仪表</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          全部数据来自本地任务,实时计算。Karma 分数反映你近 14 天的完成节奏。
        </p>
      </div>

      {/* 顶部统计卡 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard label="活跃任务" value={stats.total} hint="未归档" />
        <StatCard label="已完成" value={stats.completed} hint={`占 ${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%`} tone="success" />
        <StatCard label="今日待办" value={stats.todayTodo} tone="primary" />
        <StatCard label="逾期" value={stats.overdue} hint={stats.overdue > 0 ? '需要尽快处理' : '一切顺利'} tone={stats.overdue > 0 ? 'danger' : 'default'} />
      </div>

      {/* Karma 分数 + 时长 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:col-span-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Karma 分数</p>
          <p className="mt-1 text-3xl font-bold text-primary">{stats.karma}</p>
          <p className="mt-1 text-xs text-slate-400">满分 1000,基于 7 / 14 日完成数</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">预估总时长</p>
          <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {Math.floor(stats.totalEstimated / 60)}<span className="text-base font-normal"> 时</span> {stats.totalEstimated % 60}<span className="text-base font-normal"> 分</span>
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">实际总时长</p>
          <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {Math.floor(stats.totalActual / 60)}<span className="text-base font-normal"> 时</span> {stats.totalActual % 60}<span className="text-base font-normal"> 分</span>
          </p>
        </div>
      </div>

      {/* 14 天完成趋势 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">近 14 天完成趋势</h2>
        <div className="flex h-32 items-end gap-1.5">
          {stats.last14Days.map((d) => {
            const heightPct = (d.count / stats.maxDaily) * 100;
            return (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-primary/70 transition-all hover:bg-primary"
                    style={{ height: `${Math.max(heightPct, d.count > 0 ? 8 : 2)}%` }}
                    title={`${d.label}: ${d.count} 个`}
                  />
                </div>
                <span className="text-[10px] text-slate-400">{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {/* 按优先级 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">按优先级分布</h2>
          <div className="space-y-1.5">
            {stats.byPriority.map((p) => (
              <BarRow
                key={p.key}
                label={p.label}
                value={p.count}
                total={stats.total}
                colorClass={p.color}
              />
            ))}
          </div>
        </div>

        {/* 按状态 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">按状态分布</h2>
          <div className="space-y-1.5">
            {stats.byStatus.map((s) => (
              <BarRow
                key={s.key}
                label={s.label}
                value={s.count}
                total={stats.total}
                colorClass="bg-primary"
              />
            ))}
          </div>
        </div>
      </div>

      {/* 按项目分布 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">按项目分布</h2>
        {stats.byProject.length === 0 && stats.noProject === 0 ? (
          <p className="text-sm text-slate-400">暂无任务</p>
        ) : (
          <div className="space-y-1.5">
            {stats.byProject.map((p) => (
              <BarRow
                key={p.key}
                label={p.label}
                value={p.count}
                total={stats.total}
                colorClass="bg-primary"
              />
            ))}
            {stats.noProject > 0 && (
              <BarRow
                label="无项目"
                value={stats.noProject}
                total={stats.total}
                colorClass="bg-slate-300 dark:bg-slate-600"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
