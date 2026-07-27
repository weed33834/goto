// HabitHeatmap — 习惯打卡热力图(s3)
//
// 设计要点:
// - completedDates 元素是 'YYYY-MM-DD' 字符串(本地时区),与 habitsSlice 对齐。
//   用本地时区生成日期 key,避免 UTC 边界漂移导致"昨天打卡却显示在今天"。
// - 默认渲染最近 30 天,每格 18×18。已打卡格用 habit.color,未打卡用浅灰。
// - onToggle 可选:传入则每格可点击切换打卡状态;不传则纯展示。
// - streak 只对 daily 计算(从今天往前数连续打卡天数);
//   weekly 改为展示"本周是否已打卡",因为周粒度下"连续天数"语义模糊。
import { useMemo } from 'react';
import type { Habit } from '../../../shared/types';
import { toDateKey as toDateStr, startOfWeek, startOfDay } from '../../../shared/utils/dateUtils';

interface HabitHeatmapProps {
  completedDates: Habit['completedDates'];
  color: string;
  cadence: Habit['cadence'];
  /** 渲染天数,默认 30。 */
  days?: number;
  /** 点击某日格回调,传入 'YYYY-MM-DD'。不传则纯展示。 */
  onToggle?: (dateStr: string) => void;
}

/** 返回最近 N 天的日期数组,从最早到最近(末尾为今天)。 */
function recentDays(n: number): Date[] {
  const out: Date[] = [];
  const today = startOfDay(new Date());
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(d);
  }
  return out;
}

/** daily 连续打卡数:从今天往前数,遇到第一个未打卡日即停。
 *  注意:今天若未打卡不算中断(用户今天还没结束),从昨天开始严格连续。 */
function dailyStreak(completedSet: Set<string>): number {
  let streak = 0;
  const today = startOfDay(new Date());
  // 今天已打卡算 +1,然后从昨天往前严格连续
  const todayStr = toDateStr(today);
  let cursor = new Date(today);
  if (!completedSet.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (completedSet.has(toDateStr(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function HabitHeatmap({
  completedDates,
  color,
  cadence,
  days = 30,
  onToggle,
}: HabitHeatmapProps) {
  const completedSet = useMemo(() => new Set(completedDates), [completedDates]);
  const dayList = useMemo(() => recentDays(days), [days]);

  // weekly:本周是否已打卡;daily:连续打卡天数
  const weekCompleted = useMemo(() => {
    if (cadence !== 'weekly') return false;
    const ws = toDateStr(startOfWeek(new Date()));
    return completedDates.some((d) => d >= ws);
  }, [cadence, completedDates]);

  const streak = useMemo(
    () => (cadence === 'daily' ? dailyStreak(completedSet) : 0),
    [cadence, completedSet],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          {cadence === 'daily' ? (
            <>连续打卡 <strong className="text-slate-800 dark:text-slate-100">{streak}</strong> 天</>
          ) : (
            <>
              本周{weekCompleted ? '已打卡' : '未打卡'}
            </>
          )}
        </span>
        <span>累计 <strong className="text-slate-800 dark:text-slate-100">{completedDates.length}</strong> 次</span>
      </div>

      <div
        className="flex flex-wrap gap-[3px]"
        role="grid"
        aria-label="习惯打卡热力图"
      >
        {dayList.map((d) => {
          const dateStr = toDateStr(d);
          const done = completedSet.has(dateStr);
          const isToday = dateStr === toDateStr(new Date());
          const interactive = Boolean(onToggle);
          return (
            <button
              key={dateStr}
              type="button"
              role="gridcell"
              aria-label={`${dateStr} ${done ? '已打卡' : '未打卡'}`}
              aria-selected={done}
              tabIndex={interactive ? 0 : -1}
              disabled={!interactive}
              onClick={interactive ? () => onToggle?.(dateStr) : undefined}
              title={`${dateStr}${done ? ' · 已打卡' : ''}`}
              className={`h-[18px] w-[18px] rounded-[3px] transition-colors ${
                done
                  ? ''
                  : 'bg-slate-100 dark:bg-slate-700/50'
              } ${interactive ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${
                isToday ? 'ring-1 ring-offset-1 ring-slate-400 dark:ring-slate-500 dark:ring-offset-slate-800' : ''
              }`}
              style={done ? { backgroundColor: color } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
