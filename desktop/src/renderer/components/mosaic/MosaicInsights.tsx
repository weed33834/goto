/**
 * MosaicInsights — 时间织锦的可视化洞察区(b3)
 *
 * 替代 MosaicPage 底部原先 3 个孤立数字卡片,提供趋势可视化:
 * 1. 14 天活跃热力图:类似 GitHub contribution graph,直观看出哪几天空了
 * 2. 情绪分布条:水平堆叠条 + 图例,展示砖块的情绪构成
 * 3. 形状图例:说明不同分类对应不同几何形状
 *
 * 设计原则:
 * - 纯展示,无交互负担(hover 用原生 title 即可)
 * - 颜色与 Canvas 织锦保持一致(复用 emotionToColor)
 * - 空态友好:无砖时展示引导文案而非空白
 */
import type { MosaicTile, MosaicShape } from '../../../shared/mosaic/types';
import {
  deriveRecentActivity,
  deriveEmotionBreakdown,
  type DayActivity,
  type EmotionSlice,
} from '../../../shared/mosaic/deriveMosaic';

interface MosaicInsightsProps {
  tiles: MosaicTile[];
}

/** 热力图方格颜色:0 砖灰底,1+ 用金色不同透明度 */
function heatColor(count: number): string {
  if (count === 0) return 'rgba(148, 163, 184, 0.15)'; // slate-400/15
  if (count === 1) return 'rgba(232, 197, 108, 0.35)';
  if (count <= 3) return 'rgba(232, 197, 108, 0.6)';
  if (count <= 6) return 'rgba(232, 197, 108, 0.85)';
  return 'rgba(232, 197, 108, 1)';
}

/** 渲染单个形状样例(用于图例) */
function ShapeSample({ shape, color }: { shape: MosaicShape; color: string }) {
  const common = { width: 16, height: 16, fill: color };
  switch (shape) {
    case 'rect':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <rect x="2" y="2" width="12" height="12" rx="2" />
        </svg>
      );
    case 'hex':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <polygon points="8,1 14,4.5 14,11.5 8,15 2,11.5 2,4.5" />
        </svg>
      );
    case 'diamond':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <polygon points="8,1 15,8 8,15 1,8" />
        </svg>
      );
    case 'circle':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <circle cx="8" cy="8" r="6" />
        </svg>
      );
    case 'triangle':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <polygon points="8,2 14,14 2,14" />
        </svg>
      );
  }
}

const ALL_SHAPES: MosaicShape[] = ['rect', 'hex', 'diamond', 'circle', 'triangle'];

function HeatmapSection({ activities }: { activities: DayActivity[] }) {
  const maxCount = Math.max(1, ...activities.map((a) => a.count));
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        最近 14 天活跃
      </p>
      <div className="flex flex-wrap items-end gap-1">
        {activities.map((a, i) => (
          <div
            key={i}
            title={`${a.date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}: ${a.count} 块`}
            className={`h-7 w-5 rounded-sm transition-colors sm:h-8 sm:w-6 ${
              a.isToday ? 'ring-2 ring-teal-400 ring-offset-1 ring-offset-white dark:ring-offset-slate-800' : ''
            }`}
            style={{ backgroundColor: heatColor(a.count) }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>{activities[0]?.date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>
        <span className="flex items-center gap-1">
          少
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: heatColor(0) }} />
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: heatColor(2) }} />
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: heatColor(5) }} />
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: heatColor(8) }} />
          多
        </span>
        <span>今天</span>
      </div>
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
        最多的一天落了 {maxCount} 块砖
      </p>
    </div>
  );
}

function EmotionBarSection({ slices, total }: { slices: EmotionSlice[]; total: number }) {
  if (slices.length === 0) {
    return (
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">情绪分布</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">完成第一个任务后,这里会展示你的情绪构成。</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">情绪分布</p>
      {/* 堆叠条 */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        {slices.map((s) => (
          <div
            key={s.emotion}
            title={`${s.label}: ${s.count} 块`}
            style={{
              backgroundColor: s.color,
              width: `${(s.count / total) * 100}%`,
            }}
          />
        ))}
      </div>
      {/* 图例 */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {slices.map((s) => (
          <div key={s.emotion} className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
            <span>{s.label}</span>
            <span className="text-slate-400 dark:text-slate-500">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShapeLegendSection() {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">形状图例</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {ALL_SHAPES.map((shape) => (
          <div key={shape} className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <ShapeSample shape={shape} color="#94A3B8" />
            <span>
              {shape === 'rect' && '默认'}
              {shape === 'hex' && '分类 A'}
              {shape === 'diamond' && '分类 B'}
              {shape === 'circle' && '分类 C'}
              {shape === 'triangle' && '分类 D'}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
        形状由任务所属分类决定,同一分类的砖形状一致。
      </p>
    </div>
  );
}

export function MosaicInsights({ tiles }: MosaicInsightsProps) {
  const activities = deriveRecentActivity(tiles, 14);
  const slices = deriveEmotionBreakdown(tiles);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <HeatmapSection activities={activities} />
      <EmotionBarSection slices={slices} total={tiles.length} />
      <div className="sm:col-span-2">
        <ShapeLegendSection />
      </div>
    </div>
  );
}
