/**
 * A10 时间织锦 Mosaic — Canvas 渲染视图(§3.2 / §7.1)
 *
 * 设计(对齐 §7.1 加密可视化语言):
 * - 本机永远清晰:砖块完整渲染项目色 + 形状 + 物理动画
 * - 砖块按 gridX/gridY 网格排列
 * - 落砖动画:新砖从上方下落 + 弹性 ease(framer-motion 风格,但 Canvas 内手写)
 * - 鼠标悬停高亮 + 显示标题 tooltip
 * - 响应 prefers-reduced-motion(直接渲染,不动画)
 *
 * v3.2 review 修复:
 * - 新砖进入时只对新砖播动画,已就位的砖不再重播
 * - mouseMove 用 ref + rAF 节流,避免每次 mousemove 触发 React re-render
 * - render 回调不再依赖 hoveredTile(useRef),避免 rAF 循环重启
 * - tooltip 位置夹紧视口边缘
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { MosaicTile, MosaicShape } from '../../../shared/mosaic/types';
import type { MosaicStats } from '../../../shared/mosaic/deriveMosaic';

interface MosaicViewProps {
  tiles: MosaicTile[];
  stats: MosaicStats;
}

const CELL_SIZE = 44; // 单砖尺寸(px)
const CELL_GAP = 6;
const ROWS_PER_COL = 8;
const HEADER_H = 80;
const LEFT_PAD = 24;
const TOP_PAD = HEADER_H + 24;
const TOOLTIP_OFFSET = 12;
const TOOLTIP_MAX_WIDTH = 240; // max-w-xs
const TOOLTIP_EST_HEIGHT = 80;

/** 绘制单个砖块(按 shape) */
function drawBrick(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  shape: MosaicShape,
  color: string,
  alpha: number = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;

  const half = size / 2;
  ctx.beginPath();
  switch (shape) {
    case 'rect':
      ctx.roundRect(cx - half, cy - half, size, size, 6);
      break;
    case 'hex': {
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const x = cx + half * Math.cos(a);
        const y = cy + half * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 'diamond':
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx + half, cy);
      ctx.lineTo(cx, cy + half);
      ctx.lineTo(cx - half, cy);
      ctx.closePath();
      break;
    case 'circle':
      ctx.arc(cx, cy, half, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx + half, cy + half);
      ctx.lineTo(cx - half, cy + half);
      ctx.closePath();
      break;
  }
  ctx.fill();
  ctx.restore();
}

interface BrickRenderState {
  tile: MosaicTile;
  x: number;
  y: number;
  // 落砖动画:0(顶部)→ 1(就位)
  animProgress: number;
}

export function MosaicView({ tiles, stats }: MosaicViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // hoveredTile 仍用 state,因为 React 需要它来渲染 tooltip;
  // 但 mousePos 用 ref 避免每次 mousemove 触发 re-render
  const [hoveredTile, setHoveredTile] = useState<MosaicTile | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const bricksRef = useRef<BrickRenderState[]>([]);
  const rafRef = useRef<number>(0);
  const reducedMotion = useRef<boolean>(false);
  const hoveredTileIdRef = useRef<string | null>(null);
  // render 时的 hovered tileId 通过 ref 读取,避免 render callback 重建
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // 鼠标移动节流:每帧最多触发一次 tooltip 更新
  const mouseMoveRafRef = useRef<number>(0);

  // 计算画布尺寸
  const maxGridX = tiles.reduce((m, t) => Math.max(m, t.gridX), 0);
  // P1 修复:canvasHeight 根据 maxGridY 动态扩展,不再固定 ROWS_PER_COL=8。
  // 当天完成 >8 块时,砖块向下延伸,画布自动变高。
  const maxGridY = tiles.reduce((m, t) => Math.max(m, t.gridY), 0);
  const effectiveRows = Math.max(ROWS_PER_COL, maxGridY + 1);
  const canvasWidth = Math.max(
    600,
    LEFT_PAD * 2 + (maxGridX + 1) * (CELL_SIZE + CELL_GAP),
  );
  const canvasHeight = TOP_PAD + effectiveRows * (CELL_SIZE + CELL_GAP) + 40;

  // 初始化 / 增量更新砖块状态:仅新砖从 animProgress=0 开始,已就位的保留
  useEffect(() => {
    reducedMotion.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const existing = bricksRef.current;
    const existingMap = new Map(existing.map((b) => [b.tile.taskId, b]));
    bricksRef.current = tiles.map((tile) => {
      const prev = existingMap.get(tile.taskId);
      const x = LEFT_PAD + tile.gridX * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
      const y = TOP_PAD + tile.gridY * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
      if (prev) {
        // 已存在的砖保留动画进度,仅更新坐标(tile 内容可能变化)
        return { tile, x, y, animProgress: prev.animProgress };
      }
      // 新砖从顶部开始下落
      return { tile, x, y, animProgress: reducedMotion.current ? 1 : 0 };
    });
  }, [tiles]);

  // 渲染循环 — 不依赖 hoveredTile,改用 ref 读取
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 高 DPI
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== canvasWidth * dpr || canvas.height !== canvasHeight * dpr) {
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;
      ctx.scale(dpr, dpr);
    }

    // 背景(墨靛)
    ctx.fillStyle = '#0E1117';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 网格基线(微弱)— 行数跟随 canvasHeight 动态扩展(支持 >8 块/天)
    ctx.strokeStyle = 'rgba(232, 197, 108, 0.04)';
    ctx.lineWidth = 1;
    const totalRows = Math.max(
      ROWS_PER_COL,
      Math.floor((canvasHeight - TOP_PAD - 40) / (CELL_SIZE + CELL_GAP)),
    );
    for (let row = 0; row < totalRows; row += 1) {
      const y = TOP_PAD + row * (CELL_SIZE + CELL_GAP);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    // 头部统计
    ctx.fillStyle = '#E8C56C';
    ctx.font = '600 18px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`已落下 ${stats.totalBricks} 块砖`, LEFT_PAD, 36);

    ctx.fillStyle = 'rgba(248, 250, 252, 0.7)';
    ctx.font = '400 13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(
      `当前连续 ${stats.currentStreak} 天 · 最长 ${stats.longestStreak} 天 · 今日 ${stats.todayBricks} 块`,
      LEFT_PAD,
      58,
    );

    // 当前 hovered tileId(ref 读取,不进 deps)
    const hoveredId = hoveredTileIdRef.current;

    // 砖块
    let needRaf = false;
    for (const brick of bricksRef.current) {
      // 落砖动画:ease-out + 轻微回弹
      if (brick.animProgress < 1) {
        brick.animProgress = Math.min(1, brick.animProgress + 0.06);
        needRaf = true;
      }
      const p = brick.animProgress;
      const easedP = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const yOffset = (1 - easedP) * -120; // 从上方 120px 落下
      const alpha = easedP;

      const isHovered = hoveredId === brick.tile.taskId;
      drawBrick(
        ctx,
        brick.x,
        brick.y + yOffset,
        CELL_SIZE - 4,
        brick.tile.shape,
        brick.tile.color,
        alpha * (isHovered ? 1 : 0.85),
      );

      if (isHovered) {
        // 高亮描边
        ctx.save();
        ctx.strokeStyle = '#F8FAFC';
        ctx.lineWidth = 2;
        ctx.shadowColor = brick.tile.color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(brick.x, brick.y, CELL_SIZE / 2 + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (needRaf) {
      rafRef.current = requestAnimationFrame(render);
    } else {
      // P2-1:动画结束 / 无动画时清空 rafRef,让悬停重绘逻辑能正确判断"无挂起 rAF"。
      // 否则 rafRef.current 保留已完成的 rAF id(非 0),hover 触发的重绘会被 `!rafRef.current` 误判跳过。
      rafRef.current = 0;
    }
  }, [canvasWidth, canvasHeight, stats]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  // 鼠标交互 — 用 rAF 节流,避免高频率 setHoveredTile / setTooltipPos
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mousePosRef.current = { x, y };

    if (mouseMoveRafRef.current) return; // 已有挂起的 rAF
    mouseMoveRafRef.current = requestAnimationFrame(() => {
      mouseMoveRafRef.current = 0;
      const { x: px, y: py } = mousePosRef.current;

      // 命中检测
      let hit: MosaicTile | null = null;
      for (const brick of bricksRef.current) {
        const dx = px - brick.x;
        const dy = py - brick.y;
        if (dx * dx + dy * dy < (CELL_SIZE / 2) * (CELL_SIZE / 2)) {
          hit = brick.tile;
          break;
        }
      }

      const prevHoveredId = hoveredTileIdRef.current;
      const nextHoveredId = hit?.taskId ?? null;
      // 更新 ref(canvas 绘制时读取)
      hoveredTileIdRef.current = nextHoveredId;

      // 只在 hovered tile 变化时 setHoveredTile(减少 React re-render)
      setHoveredTile((prev) => (prev?.taskId === hit?.taskId ? prev : hit));

      // P2-1 修复:悬停高亮重绘。
      // render 循环只在动画进行中(needRaf=true)持续跑,所有砖就位后停止。
      // 此时若不主动触发重绘,虽然 hoveredTileIdRef 已更新,canvas 仍显示旧画面,
      // 用户看不到高亮描边。这里在 hover 状态变化时主动 requestAnimationFrame(render)。
      // 不在 rafRef 已挂起时重复挂(避免一个帧内挂两次)。
      if (prevHoveredId !== nextHoveredId && !rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          render();
        });
      }

      // 计算夹紧后的 tooltip 位置
      if (hit) {
        const container = containerRef.current;
        const containerW = container?.clientWidth ?? canvasWidth;
        const containerH = container?.clientHeight ?? canvasHeight;
        const tooltipX = Math.min(
          px + TOOLTIP_OFFSET,
          Math.max(0, containerW - TOOLTIP_MAX_WIDTH - TOOLTIP_OFFSET),
        );
        const tooltipY = Math.min(
          py + TOOLTIP_OFFSET,
          Math.max(0, containerH - TOOLTIP_EST_HEIGHT - TOOLTIP_OFFSET),
        );
        setTooltipPos((prev) =>
          prev.x === tooltipX && prev.y === tooltipY ? prev : { x: tooltipX, y: tooltipY },
        );
      }
    });
  };

  const handleMouseLeave = () => {
    if (mouseMoveRafRef.current) {
      cancelAnimationFrame(mouseMoveRafRef.current);
      mouseMoveRafRef.current = 0;
    }
    const hadHovered = hoveredTileIdRef.current !== null;
    hoveredTileIdRef.current = null;
    setHoveredTile(null);
    // P2-1:离开时也需要重绘一次,清掉高亮描边
    if (hadHovered && !rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        render();
      });
    }
  };

  // 触摸交互:tap 显示 tooltip(移动端无 hover),再次 tap 空白处关闭
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const touch = e.touches[0];
    if (!touch) return;
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    let hit: MosaicTile | null = null;
    for (const brick of bricksRef.current) {
      const dx = x - brick.x;
      const dy = y - brick.y;
      if (dx * dx + dy * dy < (CELL_SIZE / 2) * (CELL_SIZE / 2)) {
        hit = brick.tile;
        break;
      }
    }

    const prevHoveredId = hoveredTileIdRef.current;
    hoveredTileIdRef.current = hit?.taskId ?? null;
    setHoveredTile((prev) => (prev?.taskId === hit?.taskId ? null : hit));

    // P2-1:触摸 tap 也需要触发重绘以显示/清除高亮
    if (prevHoveredId !== hoveredTileIdRef.current && !rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        render();
      });
    }

    if (hit) {
      const container = containerRef.current;
      const containerW = container?.clientWidth ?? canvasWidth;
      const containerH = container?.clientHeight ?? canvasHeight;
      const tooltipX = Math.min(
        x + TOOLTIP_OFFSET,
        Math.max(0, containerW - TOOLTIP_MAX_WIDTH - TOOLTIP_OFFSET),
      );
      const tooltipY = Math.min(
        y + TOOLTIP_OFFSET,
        Math.max(0, containerH - TOOLTIP_EST_HEIGHT - TOOLTIP_OFFSET),
      );
      setTooltipPos({ x: tooltipX, y: tooltipY });
    }
  };

  // 清理 rAF on unmount
  useEffect(() => {
    return () => {
      if (mouseMoveRafRef.current) {
        cancelAnimationFrame(mouseMoveRafRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="overflow-x-auto overflow-y-hidden">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          className="block rounded-lg border border-gold/10"
          style={{ background: '#0E1117', touchAction: 'pan-x' }}
        />
      </div>
      {hoveredTile && (
        <div
          className="pointer-events-none absolute z-10 max-w-[16rem] rounded-lg border border-gold/30 bg-ink/95 px-3 py-2 text-xs shadow-lg sm:max-w-xs"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
          }}
        >
          <div className="font-medium text-paper">{hoveredTile.title}</div>
          <div className="mt-1 text-slate-400">
            {new Date(hoveredTile.completedAt).toLocaleString('zh-CN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: hoveredTile.color }}
            />
            <span className="text-slate-400">{hoveredTile.emotion}</span>
          </div>
        </div>
      )}
      {tiles.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
          <div className="mb-3 text-4xl opacity-30">◇</div>
          <p className="text-sm">还没有砖</p>
          <p className="mt-1 text-xs opacity-70">完成第一个任务,你的织锦就开始生长</p>
        </div>
      )}
    </div>
  );
}
