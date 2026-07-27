/**
 * A10 时间织锦 Mosaic — 派生选择器(§3.2)
 *
 * 不修改 store,只从 tasks 派生 MosaicTile[]。
 * 用 memoize 避免每次渲染重算。
 *
 * b3 扩展:新增 deriveRecentActivity(14 天热力图)与 deriveEmotionBreakdown(情绪分布),
 * 让首页不止 3 个孤立数字,而是可视化趋势。
 */

import type { Task } from '../types';
import {
  type MosaicTile,
  type MosaicEmotion,
  priorityToEmotion,
  emotionToColor,
  categoryToShape,
  isBrickEligible,
} from './types';

/**
 * 从 tasks 派生织锦砖块数组
 *
 * 规则:
 * - 只取 completed=true 且有 completedAt 的任务
 * - 按 completedAt 升序排列
 * - 第一块砖的完成日 = gridX=0
 * - 同一天的多块砖 gridY 递增(0,1,2...),最多 8 块,超过则挤到下一列
 */
export function deriveMosaicTiles(tasks: Task[]): MosaicTile[] {
  const eligible = tasks
    .filter(isBrickEligible)
    .slice()
    .sort((a, b) => {
      const ta = a.completedAt?.getTime() ?? 0;
      const tb = b.completedAt?.getTime() ?? 0;
      return ta - tb;
    });

  if (eligible.length === 0) return [];

  const firstBrickAt = eligible[0].completedAt!.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const firstDayStart = new Date(firstBrickAt);
  firstDayStart.setHours(0, 0, 0, 0);
  const firstDayMs = firstDayStart.getTime();

  // 同一天砖计数器
  const dayCounters = new Map<number, number>();

  return eligible.map((task) => {
    const completedAt = task.completedAt!.getTime();
    const dayStart = new Date(completedAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayOffset = Math.max(
      0,
      Math.floor((dayStart.getTime() - firstDayMs) / dayMs),
    );

    const gridY = dayCounters.get(dayOffset) ?? 0;
    dayCounters.set(dayOffset, gridY + 1);

    const emotion = priorityToEmotion(task.priority);
    return {
      taskId: task.id,
      title: task.title,
      completedAt,
      emotion,
      shape: categoryToShape(task.categoryId),
      color: emotionToColor(emotion),
      gridX: dayOffset,
      // P1 修复:不再用 Math.min(gridY, 7) 堆叠,gridY 自然递增。
      // 当天完成 >8 块时,砖块向下延伸(MosaicView canvasHeight 动态扩展)。
      // 原 Math.min 行为会让第 9 块及之后全堆叠到 gridY=7,视觉上无法区分。
      gridY,
      spanX: 1,
      spanY: 1,
    } satisfies MosaicTile;
  });
}

/**
 * 统计指标(用于织锦页头部)
 */
export interface MosaicStats {
  /** 总砖数 */
  totalBricks: number;
  /** 当前连续落砖天数(以本地日界为准) */
  currentStreak: number;
  /** 最长连续落砖天数 */
  longestStreak: number;
  /** 今日已落砖数 */
  todayBricks: number;
}

export function deriveMosaicStats(tiles: MosaicTile[]): MosaicStats {
  if (tiles.length === 0) {
    return {
      totalBricks: 0,
      currentStreak: 0,
      longestStreak: 0,
      todayBricks: 0,
    };
  }

  // 收集所有出现过的天(gridX)
  const daySet = new Set<number>();
  const perDayCount = new Map<number, number>();
  for (const t of tiles) {
    daySet.add(t.gridX);
    perDayCount.set(t.gridX, (perDayCount.get(t.gridX) ?? 0) + 1);
  }

  const sortedDays = Array.from(daySet).sort((a, b) => a - b);

  // 计算连续天数
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sortedDays.length; i += 1) {
    if (sortedDays[i] === sortedDays[i - 1] + 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  // 当前连续:从最后一天倒推
  const lastDay = sortedDays[sortedDays.length - 1];
  let streakFromEnd = 1;
  for (let i = sortedDays.length - 2; i >= 0; i -= 1) {
    if (sortedDays[i] === sortedDays[i + 1] - 1) {
      streakFromEnd += 1;
    } else {
      break;
    }
  }

  // 今日砖数:对比今天的 gridX
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const firstTileDay = new Date(tiles[0].completedAt);
  firstTileDay.setHours(0, 0, 0, 0);
  const todayOffset = Math.floor(
    (today.getTime() - firstTileDay.getTime()) / 86400000,
  );

  return {
    totalBricks: tiles.length,
    currentStreak: streakFromEnd,
    longestStreak: longest,
    todayBricks: perDayCount.get(todayOffset) ?? 0,
    // 若最后一天不是今天,当前连续 = 0
    ...(todayOffset !== lastDay ? { currentStreak: 0 } : {}),
  };
}

// ─── b3:可视化扩展派生 ──────────────────────────────────────────────────

/** 单日活跃度(用于 14 天热力图) */
export interface DayActivity {
  /** 当天本地 00:00 的 Date */
  date: Date;
  /** 当天落砖数 */
  count: number;
  /** 是否今天(用于热力图高亮) */
  isToday: boolean;
}

/**
 * 派生最近 N 天的每日落砖数(含 0 砖的天)。
 *
 * 与 gridX 不同:gridX 是从第一块砖起算的偏移,断档天不占位;
 * 热力图需要连续日历(含 0 砖天),才能直观看出"哪几天空了"。
 *
 * @param tiles 已派生的砖块数组
 * @param days  向前回溯的天数(含今天),默认 14
 */
export function deriveRecentActivity(tiles: MosaicTile[], days = 14): DayActivity[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 86400000;

  // 按"天起始 epoch ms"索引砖数,避免重复 setHours
  const countByDayStart = new Map<number, number>();
  for (const t of tiles) {
    const d = new Date(t.completedAt);
    d.setHours(0, 0, 0, 0);
    const key = d.getTime();
    countByDayStart.set(key, (countByDayStart.get(key) ?? 0) + 1);
  }

  const result: DayActivity[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dayStart = new Date(today.getTime() - i * dayMs);
    const key = dayStart.getTime();
    result.push({
      date: dayStart,
      count: countByDayStart.get(key) ?? 0,
      isToday: i === 0,
    });
  }
  return result;
}

/** 情绪分布切片(用于分布条) */
export interface EmotionSlice {
  emotion: MosaicEmotion;
  /** 情绪对应的砖色 */
  color: string;
  /** 中文标签 */
  label: string;
  /** 砖数 */
  count: number;
}

const EMOTION_LABELS: Record<MosaicEmotion, string> = {
  focus: '专注',
  steady: '平稳',
  urgent: '突破',
  joy: '愉悦',
  rest: '静养',
};

/** 情绪固定展示顺序(从高强度到低强度) */
const EMOTION_ORDER: MosaicEmotion[] = ['urgent', 'focus', 'joy', 'steady', 'rest'];

/**
 * 派生情绪分布:按 emotion 分组计数,返回带 label/color 的切片数组。
 *
 * 仅返回 count > 0 的情绪(空切片不渲染,避免分布条出现 0 宽度色块)。
 * 顺序固定为 urgent → focus → joy → steady → rest,与调色板从强到弱一致。
 */
export function deriveEmotionBreakdown(tiles: MosaicTile[]): EmotionSlice[] {
  const counts = new Map<MosaicEmotion, number>();
  for (const t of tiles) {
    counts.set(t.emotion, (counts.get(t.emotion) ?? 0) + 1);
  }
  return EMOTION_ORDER
    .filter((e) => (counts.get(e) ?? 0) > 0)
    .map((e) => ({
      emotion: e,
      color: emotionToColor(e),
      label: EMOTION_LABELS[e],
      count: counts.get(e) ?? 0,
    }));
}
