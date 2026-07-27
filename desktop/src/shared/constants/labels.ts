// 标签常量中心 — 优先级 / 状态 / 能量 / 上下文 / 重复规则的本地化文案。
//
// 之前 PRIORITY_LABELS / STATUS_LABELS 在 TaskEditor / TaskCard / InsightsPage /
// TemplatePage / GoalPage 等 5+ 文件各自重定义(单复数还不一致),维护时容易漂移。
// 本文件作为唯一权威,所有 UI 一律从此导入。
//
// 命名约定:统一复数(LABELS),顺序数组用 _ORDER 后缀。
import type {
  Priority,
  TaskStatus,
  EnergyLevel,
  TaskContext,
  RecurrenceType,
  RecurrenceEndType,
} from '../types';

export const PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high', 'urgent', 'critical'];
export const STATUS_ORDER: TaskStatus[] = [
  'todo', 'in-progress', 'waiting', 'delegated', 'completed', 'cancelled', 'on-hold',
];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
  critical: '关键',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  'todo': '待办',
  'in-progress': '进行中',
  'waiting': '等待',
  'delegated': '已委派',
  'completed': '已完成',
  'cancelled': '已取消',
  'on-hold': '暂停',
};

export const ENERGY_LABELS: Record<EnergyLevel, string> = {
  low: '低能量',
  medium: '中能量',
  high: '高能量',
};

export const CONTEXT_LABELS: Record<TaskContext, string> = {
  '@home': '@家',
  '@office': '@办公',
  '@phone': '@电话',
  '@computer': '@电脑',
  '@errands': '@外出',
  '@anywhere': '@任意',
};

export const RECURRENCE_TYPE_LABELS: Record<RecurrenceType, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

export const RECURRENCE_END_LABELS: Record<RecurrenceEndType, string> = {
  never: '永不',
  date: '到指定日期',
  count: '到指定次数',
};

/** 周一为首日(ISO 8601),索引 0=日 … 6=六(对齐 Date.getDay)。 */
export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
