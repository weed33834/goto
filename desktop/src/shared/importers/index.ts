// 导入器统一入口 —— 根据 filename 自动检测格式并分发到对应解析器。
//
// 用法:
//   const result = await importTasksFromFile(file);
//   result.tasks.forEach(t => addTask(t));
//   result.errors.forEach(e => console.warn(e));

import { importTodoistCsv } from './todoistCsvImporter';
import { importTickTickJson } from './tickTickJsonImporter';
import type { ImportResult } from './todoistCsvImporter';

export type { ImportResult } from './todoistCsvImporter';
export { importTodoistCsv } from './todoistCsvImporter';
export { importTickTickJson } from './tickTickJsonImporter';
export { parseCsv, rowToObject } from './csvParser';
export type { ParsedCsv } from './csvParser';

/** 支持的导入格式。 */
export type ImportFormat = 'todoist-csv' | 'ticktick-json' | 'unknown';

/** 根据文件名 + 内容嗅探格式。 */
export function detectFormat(filename: string, content: string): ImportFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return 'todoist-csv';
  if (lower.endsWith('.json')) return 'ticktick-json';

  // 无后缀或未知后缀:看内容
  const trimmed = content.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return 'ticktick-json';
  }
  // 第一行包含 TYPE,TITLE 等 Todoist 列名 → todoist-csv
  const firstLine = trimmed.split('\n')[0]?.toUpperCase() ?? '';
  if (firstLine.includes('TYPE') && firstLine.includes('TITLE')) {
    return 'todoist-csv';
  }
  return 'unknown';
}

/**
 * 解析 File 对象为 Goto Task 列表。
 * 自动检测格式,分发到对应导入器。
 *
 * @param file 用户通过 <input type="file"> 选择的文件
 * @returns { format, ...ImportResult }
 */
export async function importTasksFromFile(file: File): Promise<ImportResult & { format: ImportFormat }> {
  const text = await file.text();
  const format = detectFormat(file.name, text);

  switch (format) {
    case 'todoist-csv': {
      const result = importTodoistCsv(text);
      return { format, ...result };
    }
    case 'ticktick-json': {
      const result = importTickTickJson(text);
      return { format, ...result };
    }
    case 'unknown':
    default:
      return {
        format: 'unknown',
        tasks: [],
        errors: [{ row: 0, message: `无法识别文件格式: ${file.name}` }],
        skipped: 0,
      };
  }
}
