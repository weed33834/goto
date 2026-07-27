// 日期工具 — 基于 date-fns 的统一封装。
//
// 历史:全应用有 11 处各自手写 `d.setHours(0,0,0,0)` + `padStart` 拼接 'YYYY-MM-DD',
// 以及手算 ISO 周一、手算天数差。本文件用 date-fns(tree-shakeable)统一实现,
// 对外暴露稳定 API,调用方不再各自维护。
//
// 时区策略:所有 key 用本地时区的 'yyyy-MM-dd'(对齐原 toDateKey 行为),
// 不用 toISOString() 避免 UTC 漂移。
import { format, startOfDay as dfStartOfDay, isSameDay as dfIsSameDay } from 'date-fns';
import { differenceInCalendarDays } from 'date-fns';
import { startOfWeek as dfStartOfWeek } from 'date-fns';

/** 返回 date 在本地时区的 'YYYY-MM-DD' 字符串(对齐原 toDateKey 行为)。 */
export function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** 别名:与 toDateKey 等价,习惯打卡/热力图场景用此名。 */
export const dateKey = toDateKey;

/** 返回 d 当天 00:00:00 的 Date(本地时区)。 */
export function startOfDay(d: Date): Date {
  return dfStartOfDay(d);
}

/** 两个日期是否同一天(本地时区)。 */
export function isSameDay(a: Date, b: Date): boolean {
  return dfIsSameDay(a, b);
}

/** from → to 的日历天数差(to 在前为负)。忽略时间部分。 */
export function daysBetween(from: Date, to: Date): number {
  return differenceInCalendarDays(to, from);
}

/** ISO 周一为首日(weekStartsOn: 1)的本周起始日。 */
export function startOfWeek(d: Date): Date {
  return dfStartOfWeek(d, { weekStartsOn: 1 });
}

/** Date → datetime-local input 用的字符串(yyyy-MM-ddTHH:mm),本地时区。 */
export function toDateTimeLocal(d: Date | null | undefined): string {
  if (!d) return '';
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/** Date → date input 用的字符串(yyyy-MM-dd)。 */
export function toDateInput(d: Date | null | undefined): string {
  if (!d) return '';
  return format(d, 'yyyy-MM-dd');
}
