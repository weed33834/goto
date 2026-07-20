/**
 * A10 时间织锦 Mosaic — 类型定义(§3.2 / §7.1)
 *
 * 设计:
 * - 每个已完成任务 = 一块"砖"(MosaicTile)
 * - 砖的位置由 completedAt 决定(时间轴)
 * - 砖的色相由 emotion(Phase A 用 priority 近似)决定
 * - 砖的形状由 category 决定(不同分类不同几何)
 *
 * v3.2 §3.2 P0 核心机制:时间织锦 MVP
 */

import type { Priority, TaskStatus } from '../types';

/** 砖块情绪标签(Phase A 用 priority 映射,Phase B' 起接 emotion 字段) */
export type MosaicEmotion = 'focus' | 'steady' | 'urgent' | 'joy' | 'rest';

/** 砖块形状(由 category 派生,无 category 用圆角矩形) */
export type MosaicShape = 'rect' | 'hex' | 'diamond' | 'circle' | 'triangle';

/**
 * MosaicTile — 织锦上的一块砖
 *
 * 不存储在 IndexedDB,而是从 tasks 派生(completedAt + priority + categoryId)。
 * 这样保证数据单一来源,且加密同步只需同步 Task,织锦自动重算。
 */
export interface MosaicTile {
  /** 对应 Task.id */
  taskId: string;
  /** 任务标题(本机清晰渲染;分享/导出时不渲染,见 §7.1) */
  title: string;
  /** 完成时间(epoch ms) */
  completedAt: number;
  /** 派生情绪(Phase A 从 priority 映射) */
  emotion: MosaicEmotion;
  /** 派生形状(从 categoryId 哈希到形状池) */
  shape: MosaicShape;
  /** 派生色相(从 emotion 映射到 8 色调色板) */
  color: string;
  /** 网格坐标(由 completedAt 决定,日为单位) */
  gridX: number;
  gridY: number;
  /** 砖块尺寸(默认 1x1,Phase C 起支持 2x1 横砖表长任务) */
  spanX: number;
  spanY: number;
}

/** Priority → Emotion 映射(Phase A 近似,Phase B' 起由用户主动选) */
export function priorityToEmotion(p: Priority): MosaicEmotion {
  switch (p) {
    case 'urgent':
    case 'critical':
      return 'urgent';
    case 'high':
      return 'focus';
    case 'medium':
      return 'steady';
    case 'low':
      return 'rest';
  }
}

/** Emotion → 8 色调色板映射(对齐 §7.3)
 *
 * P1 修复:joy 与 focus 原本同为 #E8C56C,无法区分。
 * joy 改为更亮的暖金 #F5D88A,与 focus 的 #E8C56C 拉开色差。
 */
export function emotionToColor(e: MosaicEmotion): string {
  switch (e) {
    case 'focus':
      return '#E8C56C'; // 暖金 — 专注投入
    case 'steady':
      return '#7B8B3D'; // 橄榄 — 平稳推进
    case 'urgent':
      return '#C75D4F'; // 印章红 — 紧迫突破
    case 'joy':
      return '#F5D88A'; // 亮暖金 — 愉悦(与 focus 拉开色差)
    case 'rest':
      return '#3D7B8B'; // 蓝绿 — 静养恢复
  }
}

/** categoryId → 形状池(稳定哈希,同分类同形状) */
export function categoryToShape(categoryId: string | null): MosaicShape {
  if (!categoryId) return 'rect';
  let h = 0;
  for (let i = 0; i < categoryId.length; i += 1) {
    h = (h * 31 + categoryId.charCodeAt(i)) >>> 0;
  }
  const shapes: MosaicShape[] = ['rect', 'hex', 'diamond', 'circle', 'triangle'];
  return shapes[h % shapes.length];
}

/**
 * completedAt → 网格坐标
 *
 * MVP 规则:每天一列(gridX = 天数偏移),当天最多 8 块砖(gridY 0-7),
 * 超过 8 块自动堆叠到下一列。日界线用本地 00:00。
 */
export function completedAtToGrid(
  completedAt: number,
  firstBrickAt: number,
): { gridX: number; gridY: number } {
  const dayMs = 24 * 60 * 60 * 1000;
  const dayStart = new Date(completedAt);
  dayStart.setHours(0, 0, 0, 0);
  const firstStart = new Date(firstBrickAt);
  firstStart.setHours(0, 0, 0, 0);
  const gridX = Math.max(
    0,
    Math.floor((dayStart.getTime() - firstStart.getTime()) / dayMs),
  );
  return { gridX, gridY: 0 }; // gridY 由 mosaicSlice 内根据已有砖数决定
}

/** 任务状态白名单:只有 completed=true 且有 completedAt 才落砖 */
export function isBrickEligible(task: {
  status: TaskStatus;
  completed: boolean;
  completedAt: Date | null;
}): boolean {
  return task.completed && !!task.completedAt;
}
