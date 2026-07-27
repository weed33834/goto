// Insights Engine — 本地建议引擎(D5)
//
// 设计:
// - 纯本地计算,不引入 WebLLM / 远程 LLM。所有"建议"都是从 tasks/habits/goals
//   派生出的规则化提示,与"AI 洞察"营销词分开 —— 这里就叫"建议",不蹭 AI。
// - 输入:tasks / habits / goals(只读),输出:InsightSuggestion[] 按优先级排序。
// - 每条建议:severity(info/warn/critical) + title + detail + 可选 action(导航目标)。
// - 引擎是纯函数,可单测;InsightsPage 调用并渲染顶部建议卡片区。
//
// 规则覆盖:
//   1. 逾期任务过多 → 建议优先处理或重排截止日期
//   2. 高优先级任务积压(urgent+critical 未完成 ≥ 5) → 建议拆分或委派
//   3. 14 天完成趋势下滑(近 7 天 < 前 7 天的 60%) → 建议回顾节奏
//   4. 长期未完成任务(创建超过 30 天未完成) → 建议归档或拆分
//   5. 今日待办过多(≥ 8) → 建议分批
//   6. 习惯打卡中断(有习惯 3 天未打卡) → 建议恢复
//   7. 实际 vs 预估时长偏差大(实际 / 预估 > 1.5 且样本 ≥ 5) → 建议调整预估
//   8. 目标进度停滞(active goal 7 天无 KR 更新) → 建议复盘
//
// 不做的事:
// - 不做"番茄钟建议""日程建议"等需更多上下文的推断;留给后续迭代。
// - 不写"鼓励性"废话(如"你今天表现很棒"),只给可操作的改进项。
import type { Task, Habit, Goal } from '../types';
import { startOfDay, dateKey, daysBetween } from './dateUtils';

export type InsightSeverity = 'info' | 'warn' | 'critical';

export interface InsightSuggestion {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  /** 可选行动:跳转到某页面(/today, /habits 等)。空则纯展示。 */
  actionLabel?: string;
  actionUrl?: string;
}

interface EngineInput {
  tasks: Task[];
  habits: Habit[];
  goals: Goal[];
}

/**
 * 生成建议列表。纯函数,输入只读,无副作用。
 * 顺序按 severity(critical → warn → info)排序,同级按业务重要性。
 *
 * 容错:tasks/habits/goals 为 undefined 时退化为空数组,避免上游 store
 * 未初始化时调用崩溃。引擎规则全是"有则提示,无则跳过",空输入不会误报。
 */
export function generateInsights(input: EngineInput): InsightSuggestion[] {
  const tasks = input.tasks ?? [];
  const habits = input.habits ?? [];
  const goals = input.goals ?? [];
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const active = tasks.filter((t) => !t.isArchived && !t.isDeleted);
  const incomplete = active.filter((t) => !t.completed);
  const completed = active.filter((t) => t.completed);

  const suggestions: InsightSuggestion[] = [];

  // ─── 规则 1:逾期任务 ────────────────────────────────────────────────
  const overdue = incomplete.filter((t) => t.dueDate && new Date(t.dueDate) < todayStart);
  if (overdue.length >= 5) {
    suggestions.push({
      id: 'overdue',
      severity: 'critical',
      title: `${overdue.length} 个任务已逾期`,
      detail: '逾期任务堆积会持续消耗注意力。建议今天先处理 1-2 个最紧急的,其余重新评估截止日期 —— 不做就别假装会做。',
      actionLabel: '去今日任务',
      actionUrl: '/today',
    });
  } else if (overdue.length > 0) {
    suggestions.push({
      id: 'overdue',
      severity: 'warn',
      title: `${overdue.length} 个任务已逾期`,
      detail: '尽快完成或重新排期,避免占用心理带宽。',
      actionLabel: '去今日任务',
      actionUrl: '/today',
    });
  }

  // ─── 规则 2:高优先级积压 ────────────────────────────────────────────
  const highPriorityBacklog = incomplete.filter(
    (t) => t.priority === 'urgent' || t.priority === 'critical',
  );
  if (highPriorityBacklog.length >= 5) {
    suggestions.push({
      id: 'high-priority-backlog',
      severity: 'warn',
      title: `${highPriorityBacklog.length} 个紧急/关键任务未完成`,
      detail: '高优先级任务积压通常意味着:1) 优先级通胀(什么都标紧急);2) 任务过大未拆分。建议把每条拆成 30 分钟内可启动的子任务,或重新分级。',
    });
  }

  // ─── 规则 3:完成趋势下滑 ────────────────────────────────────────────
  // 复杂度优化:原来 14 天循环 × 每天全量 filter 是 O(14n);
  // 改为单遍构建 Map<dateKey, count>(O(n)),再 14 天 O(1) 查表。
  const dailyCount = new Map<string, number>();
  for (const t of completed) {
    if (!t.completedAt) continue;
    const k = dateKey(startOfDay(new Date(t.completedAt)));
    dailyCount.set(k, (dailyCount.get(k) ?? 0) + 1);
  }
  const last14: number[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    last14.push(dailyCount.get(dateKey(d)) ?? 0);
  }
  const first7Sum = last14.slice(0, 7).reduce((s, n) => s + n, 0);
  const last7Sum = last14.slice(7).reduce((s, n) => s + n, 0);
  // 前 7 天有完成量(避免冷启动误判),且近 7 天明显下滑
  if (first7Sum >= 3 && last7Sum < first7Sum * 0.6) {
    suggestions.push({
      id: 'trend-down',
      severity: 'warn',
      title: '近 7 天完成节奏下滑',
      detail: `前 7 天完成 ${first7Sum} 个,近 7 天仅 ${last7Sum} 个。回顾一下是不是被某类任务卡住,或精力被分散到低价值事情上了。`,
      actionLabel: '看每周回顾',
      actionUrl: '/review',
    });
  }

  // ─── 规则 4:长期未完成任务 ──────────────────────────────────────────
  const stale = incomplete.filter((t) => {
    const created = new Date(t.createdAt);
    return daysBetween(created, now) > 30;
  });
  if (stale.length >= 3) {
    suggestions.push({
      id: 'stale-tasks',
      severity: 'info',
      title: `${stale.length} 个任务创建超 30 天未完成`,
      detail: '长期挂在列表上的任务会变成"视觉噪音"。逐条问自己:还要做吗?要做就拆小;不做就归档或删除。',
    });
  }

  // ─── 规则 5:今日待办过多 ────────────────────────────────────────────
  const todayTodo = incomplete.filter((t) => {
    const due = t.dueDate ? new Date(t.dueDate) : null;
    if (due && due >= todayStart && due < todayEnd) return true;
    return false;
  });
  if (todayTodo.length >= 8) {
    suggestions.push({
      id: 'today-overload',
      severity: 'warn',
      title: `今天安排了 ${todayTodo.length} 个任务`,
      detail: '一日清单超 7 项基本注定完不成。挑出今天"非做不可"的 3 个,其余挪到明天或下周 —— 别让长清单消磨完成感。',
      actionLabel: '去今日任务',
      actionUrl: '/today',
    });
  }

  // ─── 规则 6:习惯打卡中断 ────────────────────────────────────────────
  const brokenHabits = habits.filter((h) => {
    if (h.archived || h.cadence !== 'daily') return false;
    const dates = [...h.completedDates].sort();
    if (dates.length === 0) return false;
    const last = dates[dates.length - 1]!;
    // 最近一次打卡距今 ≥ 3 天
    const lastDate = new Date(last);
    return daysBetween(lastDate, now) >= 3;
  });
  if (brokenHabits.length > 0) {
    const names = brokenHabits.slice(0, 2).map((h) => h.name).join('、');
    suggestions.push({
      id: 'habit-broken',
      severity: 'warn',
      title: `${brokenHabits.length} 个习惯已中断 3 天以上`,
      detail: `中断的习惯:${names}${brokenHabits.length > 2 ? ' 等' : ''}。连续打卡中断后越拖越难重启,建议今天先做最小版本(如"读 1 页")重建链路。`,
      actionLabel: '去习惯追踪',
      actionUrl: '/habits',
    });
  }

  // ─── 规则 7:预估时长偏差 ────────────────────────────────────────────
  const withBoth = completed.filter((t) => t.estimatedTime != null && t.estimatedTime > 0 && t.actualTime != null && t.actualTime > 0);
  if (withBoth.length >= 5) {
    const totalEst = withBoth.reduce((s, t) => s + (t.estimatedTime ?? 0), 0);
    const totalActual = withBoth.reduce((s, t) => s + (t.actualTime ?? 0), 0);
    const ratio = totalActual / totalEst;
    if (ratio > 1.5) {
      suggestions.push({
        id: 'estimate-low',
        severity: 'info',
        title: '实际耗时持续高于预估',
        detail: `最近 ${withBoth.length} 个已完成任务实际/预估 ≈ ${ratio.toFixed(1)}x。预估偏低会让你排过满的一天。下次估时先 ×1.5 试试。`,
      });
    } else if (ratio < 0.5) {
      suggestions.push({
        id: 'estimate-high',
        severity: 'info',
        title: '实际耗时持续低于预估',
        detail: `最近 ${withBoth.length} 个已完成任务实际/预估 ≈ ${ratio.toFixed(1)}x。预估偏高会让清单看起来过满,可以更激进地安排。`,
      });
    }
  }

  // ─── 规则 8:目标进度停滞 ────────────────────────────────────────────
  const staleGoals = goals.filter((g) => {
    if (g.status !== 'active') return false;
    if (g.keyResults.length === 0) return false;
    const updated = new Date(g.updatedAt);
    return daysBetween(updated, now) >= 7;
  });
  if (staleGoals.length > 0) {
    suggestions.push({
      id: 'goal-stale',
      severity: 'info',
      title: `${staleGoals.length} 个目标 7 天未更新进度`,
      detail: 'OKR 不是设了就自动达成。给每个停滞目标至少推进一个 KR,哪怕 +1 也算。',
      actionLabel: '去 OKR 目标',
      actionUrl: '/goals',
    });
  }

  // ─── 排序:critical → warn → info ───────────────────────────────────
  const order: Record<InsightSeverity, number> = { critical: 0, warn: 1, info: 2 };
  return suggestions.sort((a, b) => order[a.severity] - order[b.severity]);
}
