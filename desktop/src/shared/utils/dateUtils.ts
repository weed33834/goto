/**
 * 日期工具：统一"本地日期 key"生成。
 *
 * 全应用习惯打卡、热力图、分析趋势等场景一律以 `toDateKey(date)` 产出的
 * 'YYYY-MM-DD' 字符串作为日期 key，规避 toDateString() 的 locale 依赖与
 * toISOString() 的 UTC 时区偏移，保证写入与查询的 key 格式一致。
 */

/** 返回 date 在本地时区的 'YYYY-MM-DD' 字符串。 */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
