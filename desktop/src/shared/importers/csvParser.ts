// 简易 CSV 解析器 —— 支持 RFC 4180 基本语法。
// 不依赖外部库(papaparse 等),~60 行覆盖 Todoist 导出格式。
//
// 支持:
//   - 字段用双引号包裹(允许内含逗号、换行)
//   - 引号内转义引号:"" → "
//   - 字段无引号时,逗号/换行作为分隔符
//   - 自动识别 \r\n / \r / \n 换行
//   - 首行作为 header,返回 { headers, rows } 结构
//
// 不支持(超出 Todoist 导出需求):
//   - 自定义分隔符(写死逗号)
//   - 注释行
//   - 字段类型推断(全部返回 string)

export interface ParsedCsv {
  headers: string[];
  /** 每行是 headers 对应的字符串数组,长度与 headers 一致。 */
  rows: string[][];
}

/**
 * 解析 CSV 字符串为 { headers, rows }。
 * 空字符串返回 { headers: [], rows: [] }。
 * 行尾多余空行被忽略(避免 Todoist 导出末尾空行)。
 */
export function parseCsv(input: string): ParsedCsv {
  if (!input || !input.trim()) {
    return { headers: [], rows: [] };
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  // 统一换行符:\r\n / \r → \n
  const text = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        // 双引号转义:"" → "
        if (text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        // 单引号闭合
        inQuotes = false;
        i++;
        continue;
      }
      // 引号内任意字符(含换行)原样保留
      currentField += char;
      i++;
      continue;
    }

    // 非引号状态
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
      i++;
      continue;
    }
    if (char === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }
    currentField += char;
    i++;
  }

  // 处理最后一行(无尾换行的情况)
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // 过滤完全空行(Todoist 导出末尾常有空行)
  const nonEmptyRows = rows.filter((r) => r.some((f) => f.trim() !== ''));
  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = nonEmptyRows[0].map((h) => h.trim());
  // 数据行跳过 header,但保留长度不足的行(用空串补齐)
  const dataRows = nonEmptyRows.slice(1).map((row) => {
    if (row.length === headers.length) return row;
    // 长度不匹配:补齐或截断
    const padded = [...row];
    while (padded.length < headers.length) padded.push('');
    return padded.slice(0, headers.length);
  });

  return { headers, rows: dataRows };
}

/**
 * 把一行字符串数组转为 { [header]: value } 对象。
 * 重复 header 时后者覆盖前者(罕见,但 Todoist 不会出现)。
 */
export function rowToObject(headers: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = row[i] ?? '';
  }
  return obj;
}
