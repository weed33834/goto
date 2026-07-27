/**
 * A10 时间织锦 Mosaic — 页面(§3.2 P0 核心机制)
 *
 * 路由:/mosaic
 * 入口:Sidebar 主导航首项(替代 Today 成为 P0)
 *
 * 功能:
 * - 主体:Canvas 织锦视图(本机永远清晰,砖块按时间网格排列)
 * - 核心数字:总砖数 / 连续天数 / 今日砖数(快速概览)
 * - b3 可视化洞察:14 天活跃热力图 + 情绪分布条 + 形状图例
 *   替代原先孤立的 3 个数字,让用户看到趋势与构成
 * - 空态引导:无砖时提示"完成第一个任务"
 */

import { useMemo } from 'react';
import { useTaskStore } from '../store/taskStore';
import { MosaicView } from '../components/mosaic/MosaicView';
import { MosaicInsights } from '../components/mosaic/MosaicInsights';
import { deriveMosaicTiles, deriveMosaicStats } from '../../shared/mosaic/deriveMosaic';

export function MosaicPage() {
  const tasks = useTaskStore((s) => s.tasks);

  const tiles = useMemo(() => deriveMosaicTiles(tasks), [tasks]);
  const stats = useMemo(() => deriveMosaicStats(tiles), [tiles]);

  return (
    <div>
      <header className="mb-4 sm:mb-6">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-paper sm:text-2xl">
          时间织锦
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          每完成一个任务,织锦上就多一块砖。这是你的私人时间资产。
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900 sm:p-4">
        <MosaicView tiles={tiles} stats={stats} />
      </div>

      {/* 核心数字:快速概览 */}
      <section className="mt-4 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">总砖数</div>
          <div className="mt-1 text-2xl font-semibold text-gold sm:mt-2 sm:text-3xl">{stats.totalBricks}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">当前连续</div>
          <div className="mt-1 text-2xl font-semibold text-olive sm:mt-2 sm:text-3xl">{stats.currentStreak} 天</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">今日</div>
          <div className="mt-1 text-2xl font-semibold text-teal sm:mt-2 sm:text-3xl">{stats.todayBricks} 块</div>
        </div>
      </section>

      {/* b3:可视化洞察区 — 热力图 + 情绪分布 + 形状图例 */}
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:mt-6 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:mb-4">
          洞察
        </h2>
        <MosaicInsights tiles={tiles} />
      </section>
    </div>
  );
}
