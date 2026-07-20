/**
 * UI 辅助工具：任务优先级 / 状态的颜色映射。
 *
 * AnalyticsScreen、CalendarScreen、TaskDetailScreen 共用同一套颜色表，
 * 避免在三个页面里各维护一份重复的 Record。
 */

/** 优先级颜色表：low → 绿 / medium → 黄 / high → 橙 / urgent → 红 / critical → 深红。 */
const PRIORITY_COLORS: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  urgent: '#ef4444',
  critical: '#dc2626',
};

/** 状态颜色表：覆盖 7 种 TaskStatus。 */
const STATUS_COLORS: Record<string, string> = {
  'todo': '#6b7280',
  'in-progress': '#3b82f6',
  'waiting': '#8b5cf6',
  'delegated': '#f59e0b',
  'completed': '#10b981',
  'cancelled': '#ef4444',
  'on-hold': '#6b7280',
};

/**
 * 返回任务优先级对应的颜色。
 * @param priority 优先级（low / medium / high / urgent / critical）
 * @param fallback 未知优先级时的回退色，默认 ''
 */
export function getPriorityColor(priority: string, fallback: string = ''): string {
  return PRIORITY_COLORS[priority] || fallback;
}

/**
 * 返回任务状态对应的颜色。
 * @param status 状态（todo / in-progress / waiting / delegated / completed / cancelled / on-hold）
 * @param fallback 未知状态时的回退色，默认 ''
 */
export function getStatusColor(status: string, fallback: string = ''): string {
  return STATUS_COLORS[status] || fallback;
}
