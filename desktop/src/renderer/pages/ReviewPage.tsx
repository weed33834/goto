// ReviewPage — 每周回顾(Phase 2.3)
//
// 工作流(GTD 周回顾的简化版):
//   1. 上周完成清单 — 让用户感受到"事情在推进"
//   2. 上周新建但未完成的任务 — 暴露"挂着没动"的烂尾
//   3. 逾期任务 — 必须重新安排 dueDate 或删除
//   4. 本周到期任务 — 提前看到本周节奏
//   5. 反思区 — 自由文本,本地保存(存到 preferences 里 reviewNotes 字段)
//   6. 一键"清理"操作 — 把 30 天前已完成任务标记 isArchived=true(仍可搜索,但不出现在主列表)
//
// 设计取舍:
//   - 不强制周一开始,默认展示"过去 7 天 + 未来 7 天",用户可手动调偏移
//   - 反思用 localStorage 持久化(后续 phase 再考虑接入 store)
//   - 不做"评分 / 报告导出"等复杂功能,保持轻量

import { useMemo, useState } from 'react';
import { useAppStore } from '../../shared/store';
import { useTaskStore } from '../store/taskStore';
import { Button } from '../components/common/Button';
import { TaskCard } from '../components/task/TaskCard';
import { startOfDay } from '../../shared/utils/dateUtils';

const STORAGE_KEY = 'goto.reviewNotes';
const ARCHIVE_THRESHOLD_DAYS = 30;

function loadNotes(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveNotes(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    /* 静默失败 — 隐私模式或 quota 满 */
  }
}

export function ReviewPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const update = useTaskStore((s) => s.update);
  const projects = useAppStore((s) => s.projects);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = 本周;-1 = 上周;1 = 下周
  const [notes, setNotes] = useState(loadNotes);

  const range = useMemo(() => {
    const today = startOfDay(new Date());
    // 周一开始的本周:1=Mon...7=Sun(getDay 0=Sun,1=Mon)
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek - 1) + weekOffset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { today, monday, sunday };
  }, [weekOffset]);

  const sections = useMemo(() => {
    // 复杂度优化:原来 4 次 tasks.filter 是 O(4n);改为单遍分桶到 4 个数组。
    // projectSummary 的项目统计也并入同一遍,用 Map 累加 done/total。
    const completedThisWeek: typeof tasks = [];
    const createdThisWeekIncomplete: typeof tasks = [];
    const overdue: typeof tasks = [];
    const upcomingThisWeek: typeof tasks = [];
    const projectStats = new Map<string, { done: number; total: number }>();

    for (const t of tasks) {
      // 项目摘要累加(排除已归档)
      if (t.projectId && !t.isArchived) {
        const s = projectStats.get(t.projectId) ?? { done: 0, total: 0 };
        s.total++;
        if (t.completed) s.done++;
        projectStats.set(t.projectId, s);
      }

      if (t.completed) {
        if (t.completedAt) {
          const c = new Date(t.completedAt);
          if (c >= range.monday && c <= range.sunday) completedThisWeek.push(t);
        }
        continue;
      }
      // 未完成
      const created = new Date(t.createdAt);
      if (created >= range.monday && created <= range.sunday) {
        createdThisWeekIncomplete.push(t);
      }
      if (t.dueDate) {
        const d = new Date(t.dueDate);
        // 保持原 4-filter 语义:overdue 与 upcoming 不互斥(本周内已过截止仍算逾期,
        // 也算本周 upcoming),独立判定。
        if (d < range.today) overdue.push(t);
        if (d >= range.monday && d <= range.sunday) upcomingThisWeek.push(t);
      }
    }

    const projectSummary = projects
      .map((p) => {
        const s = projectStats.get(p.id);
        if (!s || s.total === 0) return null;
        return { id: p.id, name: p.name, color: p.color, done: s.done, total: s.total };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return {
      completedThisWeek,
      createdThisWeekIncomplete,
      overdue,
      upcomingThisWeek,
      projectSummary,
    };
  }, [tasks, projects, range]);

  const handleArchiveOld = () => {
    const threshold = new Date(range.today);
    threshold.setDate(threshold.getDate() - ARCHIVE_THRESHOLD_DAYS);
    let count = 0;
    for (const t of tasks) {
      if (!t.completed || t.isArchived) continue;
      if (t.completedAt && new Date(t.completedAt) < threshold) {
        update(t.id, { isArchived: true });
        count++;
      }
    }
    if (count === 0) {
      window.alert(`没有 ${ARCHIVE_THRESHOLD_DAYS} 天前完成的任务需要归档`);
    } else {
      window.alert(`已归档 ${count} 个已完成任务(仍可通过搜索找到)`);
    }
  };

  const fmtDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const weekLabel = weekOffset === 0 ? '本周' : weekOffset === -1 ? '上周' : weekOffset === 1 ? '下周' : `${weekOffset > 0 ? '下' : '上'} ${Math.abs(weekOffset)} 周`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">每周回顾</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {weekLabel} · {fmtDate(range.monday)} – {fmtDate(range.sunday)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset((o) => o - 1)}>‹ 上一周</Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>本周</Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset((o) => o + 1)}>下一周 ›</Button>
        </div>
      </div>

      {/* 概要卡 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">本周完成</p>
          <p className="mt-1 text-2xl font-bold text-emerald-500">{sections.completedThisWeek.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">本周新建未完</p>
          <p className="mt-1 text-2xl font-bold text-amber-500">{sections.createdThisWeekIncomplete.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">逾期任务</p>
          <p className="mt-1 text-2xl font-bold text-danger">{sections.overdue.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">本周到期</p>
          <p className="mt-1 text-2xl font-bold text-primary">{sections.upcomingThisWeek.length}</p>
        </div>
      </div>

      {/* 已完成 */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span className="text-emerald-500">✓</span> 本周完成({sections.completedThisWeek.length})
        </h2>
        {sections.completedThisWeek.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400 dark:border-slate-700">
            本周还没有完成任务。完成第一个任务开启正反馈。
          </p>
        ) : (
          <div className="space-y-2">
            {sections.completedThisWeek.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>

      {/* 烂尾:本周新建但未完成 */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span className="text-amber-500">⏳</span> 本周新建但未完成({sections.createdThisWeekIncomplete.length})
        </h2>
        {sections.createdThisWeekIncomplete.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400 dark:border-slate-700">
            很好,本周新建的任务都已完成或归档。
          </p>
        ) : (
          <div className="space-y-2">
            {sections.createdThisWeekIncomplete.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>

      {/* 逾期 */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span className="text-danger">⚠</span> 逾期任务({sections.overdue.length})
        </h2>
        {sections.overdue.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400 dark:border-slate-700">
            没有逾期任务,继续推进。
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              建议为每个逾期任务重新安排 dueDate,或直接取消以释放心理负担。
            </p>
            <div className="space-y-2">
              {sections.overdue.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* 本周到期 */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span className="text-primary">📅</span> 本周到期({sections.upcomingThisWeek.length})
        </h2>
        {sections.upcomingThisWeek.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400 dark:border-slate-700">
            本周暂无到期任务,合理安排节奏。
          </p>
        ) : (
          <div className="space-y-2">
            {sections.upcomingThisWeek.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>

      {/* 项目进度 */}
      {sections.projectSummary.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">项目进度</h2>
          <div className="space-y-1.5">
            {sections.projectSummary.map((p) => {
              const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
              return (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="w-32 shrink-0 truncate text-slate-600 dark:text-slate-300">{p.name}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-700">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs text-slate-500">
                    {p.done}/{p.total} · {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 反思笔记 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">本周反思</h2>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            saveNotes(e.target.value);
          }}
          placeholder="做得好的 / 需要改进的 / 下周想尝试的…(本地保存,不上传)"
          rows={5}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <p className="mt-1 text-xs text-slate-400">笔记仅保存在浏览器 localStorage,清浏览器数据会丢失</p>
      </section>

      {/* 一键归档旧任务 */}
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">清理已完成任务</h2>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          将 {ARCHIVE_THRESHOLD_DAYS} 天前完成的任务标记为已归档,它们不再出现在主列表,但可搜索找到。
        </p>
        <Button variant="secondary" size="sm" onClick={handleArchiveOld}>
          归档 {ARCHIVE_THRESHOLD_DAYS} 天前的已完成任务
        </Button>
      </section>
    </div>
  );
}
