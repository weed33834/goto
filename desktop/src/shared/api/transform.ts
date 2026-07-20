type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

function camelToSnakeKey(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function camelToSnake(obj: unknown): unknown {
  if (isDate(obj)) {
    return obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(camelToSnake);
  }
  if (isPlainObject(obj)) {
    const result: PlainObject = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      result[camelToSnakeKey(key)] = camelToSnake(value);
    }
    return result;
  }
  return obj;
}

export function snakeToCamel(obj: unknown): unknown {
  if (isDate(obj)) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(snakeToCamel);
  }
  if (isPlainObject(obj)) {
    const result: PlainObject = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      const camelKey = snakeToCamelKey(key);
      result[camelKey] = snakeToCamel(value);
    }
    return result;
  }
  return obj;
}

export function parseDates(obj: PlainObject): PlainObject {
  const dateFields = [
    'createdAt',
    'updatedAt',
    'dueDate',
    'startDate',
    'endDate',
    'reminderDate',
    'completedAt',
    'deletedAt',
    'joinedAt',
    'startedAt',
  ];

  const result = { ...obj };
  for (const field of dateFields) {
    const value = result[field];
    if (value !== null && value !== undefined) {
      result[field] = new Date(value as string | Date);
    }
  }
  return result;
}

/**
 * 把后端 snake_case + ISO 日期响应转换为前端 camelCase + Date 类型。
 * 供 api/tasks、api/categories、api/projects、api/tags 复用。
 */
export function convertResponse<T>(value: unknown): T {
  return parseDates(snakeToCamel(value) as PlainObject) as unknown as T;
}
