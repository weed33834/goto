/**
 * EmptyState — 统一的空状态组件(P1-2)
 *
 * 用于任务/项目/分类/标签/保险库/搜索结果等列表为空时的展示。
 * 提供清晰的 icon + 标题 + 提示文案 + 可选行动按钮,避免用户面对空白区域。
 *
 * 设计原则:
 * - 不指责用户("你还没有创建任何任务"),改用中性/鼓励性文案("今天没有任务,享受片刻空闲")
 * - 给出下一步行动建议(按钮或文字指引)
 * - 视觉简洁,不喧宾夺主
 */
import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** 视觉图标(emoji 或 SVG),建议 4-6 字符 */
  icon?: ReactNode;
  /** 主标题,简短(2-8 字) */
  title: string;
  /** 描述文案或行动指引(可空) */
  hint?: string;
  /** 可选行动按钮文字 */
  actionLabel?: string;
  /** 行动按钮回调 */
  onAction?: () => void;
  /** 紧凑模式(用于内联列表) */
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  hint,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  if (compact) {
    return (
      <div className="py-6 text-center">
        {icon && <div className="mb-2 text-2xl opacity-40">{icon}</div>}
        <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
        {hint && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center sm:py-16">
      {icon && (
        <div className={`mb-3 opacity-30 ${compact ? 'text-3xl' : 'text-4xl sm:text-5xl'}`}>
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300 sm:text-base">{title}</p>
      {hint && (
        <p className="mt-2 max-w-xs text-xs text-slate-400 dark:text-slate-500 sm:text-sm">
          {hint}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          data-touch-target
          onClick={onAction}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
