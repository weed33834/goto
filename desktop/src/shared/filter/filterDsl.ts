// Filter DSL —— Todoist 风格的任务过滤表达式。
//
// 语法(递归下降,AND 优先于 OR):
//   expr     := orExpr
//   orExpr   := andExpr ('|' andExpr)*
//   andExpr  := notExpr ('&' notExpr | notExpr)*    // & 可省略,空格分隔默认 AND
//   notExpr  := '!' notExpr | primary
//   primary  := '(' expr ')' | predicate
//
// 谓词:
//   today / tomorrow / overdue         日期窗口
//   completed / uncompleted             状态
//   starred / archived / recurring      标记位
//   p1 / p2 / p3 / p4                   优先级(urgent/high/medium/low)
//   @name                               标签名(模糊匹配 Tag.name,大小写不敏感)
//   #name                               项目名(模糊匹配 Project.name)
//   /name                               分类名(模糊匹配 Category.name)
//
// 设计原则:
// - 纯函数,无 React/store 依赖 → 可在 Node / Vitest / Web Worker 直接跑
// - 解析失败抛 ParseError,携带 1-based 列号;matcher 不抛,只返 boolean
// - 不重写 filterTasks —— 那是 Filter[] 的旧路径,本 DSL 走独立 eval 路径
// - 标签名匹配走 ctx.tagNameToIds,避免 task.tags 存 id 导致用户写 @work 不工作

import type { Task, Priority } from '../types';

/** 解析上下文:把用户可读的名字解析成 store 中的 id。 */
export interface FilterContext {
  /** tag 名(小写)→ tag id 列表(同名 tag 可能多条,虽然 UI 通常唯一)。 */
  tagNameToIds: Map<string, string[]>;
  /** project 名(小写)→ project id。 */
  projectNameToIds: Map<string, string[]>;
  /** category 名(小写)→ category id。 */
  categoryNameToIds: Map<string, string[]>;
  /** "今天"的零点时刻(便于测试注入固定日期)。 */
  now: Date;
}

/** AST 节点。 */
export type FilterNode =
  | { kind: 'and'; children: FilterNode[] }
  | { kind: 'or'; children: FilterNode[] }
  | { kind: 'not'; child: FilterNode }
  | { kind: 'predicate'; predicate: Predicate };

export type Predicate =
  | { type: 'today' }
  | { type: 'tomorrow' }
  | { type: 'overdue' }
  | { type: 'completed' }
  | { type: 'uncompleted' }
  | { type: 'starred' }
  | { type: 'archived' }
  | { type: 'recurring' }
  | { type: 'priority'; level: Priority }
  | { type: 'tag'; name: string }
  | { type: 'project'; name: string }
  | { type: 'category'; name: string };

/** 解析错误,携带 1-based 列号便于 UI 高亮。 */
export class ParseError extends Error {
  readonly column: number;
  constructor(message: string, column: number) {
    super(message);
    this.name = 'ParseError';
    this.column = column;
  }
}

/** 解析结果:成功返 ast,失败返 errors 列表(允许部分恢复后继续报多条)。 */
export interface ParseResult {
  ast: FilterNode | null;
  errors: ParseError[];
}

// ===== Tokenizer =====

type TokenType = 'amp' | 'pipe' | 'bang' | 'lparen' | 'rparen' | 'word';
interface Token {
  type: TokenType;
  value: string;
  column: number; // 1-based
}

const OPERATOR_CHARS: Record<string, TokenType> = {
  '&': 'amp',
  '|': 'pipe',
  '!': 'bang',
  '(': 'lparen',
  ')': 'rparen',
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    // 空白跳过
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    const opType = OPERATOR_CHARS[ch];
    if (opType) {
      tokens.push({ type: opType, value: ch, column: i + 1 });
      i++;
      continue;
    }
    // 谓词 token:连续读非分隔字符。@ # / 也算 word 的一部分(由 parsePredicate 解释前缀)。
    // 中文 tag 名也允许,所以只把 ()&|! 与空白当作分隔。
    const startCol = i + 1;
    let buf = '';
    while (i < input.length) {
      const c = input[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || OPERATOR_CHARS[c]) break;
      buf += c;
      i++;
    }
    // 走到这里 buf 一定非空(外层已挡运算符与空白)
    tokens.push({ type: 'word', value: buf, column: startCol });
  }
  return tokens;
}

// ===== Parser (recursive descent) =====

class Parser {
  private pos = 0;
  private readonly errors: ParseError[] = [];

  constructor(private readonly tokens: Token[]) {}

  parse(): FilterNode | null {
    if (this.tokens.length === 0) return null;
    const node = this.parseOr();
    if (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos];
      this.errors.push(new ParseError(`未预期的 token "${t.value}"`, t.column));
    }
    return node;
  }

  getErrors(): ParseError[] {
    return this.errors;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private parseOr(): FilterNode | null {
    let left = this.parseAnd();
    if (!left) return null;
    while (this.peek()?.type === 'pipe') {
      this.consume();
      const right = this.parseAnd();
      if (!right) break;
      // 合并相邻 or 节点,避免深嵌套
      if (left.kind === 'or') {
        left.children.push(right);
      } else {
        left = { kind: 'or', children: [left, right] };
      }
    }
    return left;
  }

  private parseAnd(): FilterNode | null {
    let left = this.parseNot();
    if (!left) return null;
    // 显式 AND(&)或隐式 AND(空格分隔的 word/lparen/bang)持续合并。
    // 用 for(;;) 而非 while(true) 以避开 no-constant-condition 警告。
    for (;;) {
      const t = this.peek();
      if (!t) break;
      // & 显式 AND,或 word/lparen/bang 隐式 AND(空格分隔)
      if (t.type === 'amp') {
        this.consume();
      } else if (t.type === 'pipe' || t.type === 'rparen') {
        break;
      }
      const right = this.parseNot();
      if (!right) {
        // & 后无表达式 → 报错
        if (t.type === 'amp') {
          this.errors.push(new ParseError(`"&" 后缺少表达式`, t.column));
        }
        break;
      }
      if (left.kind === 'and') {
        left.children.push(right);
      } else {
        left = { kind: 'and', children: [left, right] };
      }
    }
    return left;
  }

  private parseNot(): FilterNode | null {
    const t = this.peek();
    if (!t) return null;
    if (t.type === 'bang') {
      this.consume();
      const child = this.parseNot();
      if (!child) {
        this.errors.push(new ParseError(`"!" 后缺少表达式`, t.column));
        return null;
      }
      return { kind: 'not', child };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FilterNode | null {
    const t = this.peek();
    if (!t) return null;
    if (t.type === 'lparen') {
      this.consume();
      const inner = this.parseOr();
      const close = this.peek();
      if (close?.type !== 'rparen') {
        this.errors.push(new ParseError(`缺少右括号 ")"`, t.column));
        return inner;
      }
      this.consume();
      return inner;
    }
    if (t.type === 'word') {
      this.consume();
      const pred = parsePredicate(t.value);
      if (!pred) {
        this.errors.push(new ParseError(`无法识别的谓词 "${t.value}"`, t.column));
        return null;
      }
      return { kind: 'predicate', predicate: pred };
    }
    // 运算符出现在 primary 位置 → 错误
    this.errors.push(new ParseError(`未预期的运算符 "${t.value}"`, t.column));
    this.consume();
    return null;
  }
}

/** 把单个 word token 解析为 Predicate。返回 null 表示不是已知谓词。 */
function parsePredicate(word: string): Predicate | null {
  const lower = word.toLowerCase();

  // @tag / #project / /category —— 前缀语法
  if (word.startsWith('@')) {
    const name = word.slice(1).trim();
    if (!name) return null;
    return { type: 'tag', name };
  }
  if (word.startsWith('#')) {
    const name = word.slice(1).trim();
    if (!name) return null;
    return { type: 'project', name };
  }
  if (word.startsWith('/')) {
    const name = word.slice(1).trim();
    if (!name) return null;
    return { type: 'category', name };
  }

  // 关键字
  switch (lower) {
    case 'today':
      return { type: 'today' };
    case 'tomorrow':
      return { type: 'tomorrow' };
    case 'overdue':
      return { type: 'overdue' };
    case 'completed':
    case 'done':
      return { type: 'completed' };
    case 'uncompleted':
    case 'todo':
    case 'open':
      return { type: 'uncompleted' };
    case 'starred':
    case 'star':
      return { type: 'starred' };
    case 'archived':
      return { type: 'archived' };
    case 'recurring':
      return { type: 'recurring' };
  }

  // 优先级 p1-p4
  const priorityMatch = /^p([1-4])$/.exec(lower);
  if (priorityMatch) {
    const level: Priority = [
      'urgent', // p1
      'high', // p2
      'medium', // p3
      'low', // p4
    ][Number(priorityMatch[1]) - 1] as Priority;
    return { type: 'priority', level };
  }

  return null;
}

// ===== 公开 API =====

/**
 * 解析 DSL 查询字符串为 AST。
 * 失败时返回 errors,ast 为 null(或部分恢复后继续解析剩余)。
 *
 * @example
 *   parseFilterDsl('today & p1 & @work')  // { ast: { kind: 'and', ... }, errors: [] }
 *   parseFilterDsl('@')                    // { ast: null, errors: [ParseError] }
 */
export function parseFilterDsl(query: string): ParseResult {
  const tokens = tokenize(query);
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return { ast, errors: parser.getErrors() };
}

/**
 * 评估 AST 节点是否匹配给定 task。
 * 不抛异常;谓词依赖的 ctx 字段缺失时返 false。
 */
export function evalFilterNode(node: FilterNode, task: Task, ctx: FilterContext): boolean {
  switch (node.kind) {
    case 'and':
      return node.children.every((c) => evalFilterNode(c, task, ctx));
    case 'or':
      return node.children.some((c) => evalFilterNode(c, task, ctx));
    case 'not':
      return !evalFilterNode(node.child, task, ctx);
    case 'predicate':
      return evalPredicate(node.predicate, task, ctx);
  }
}

/** 评估单个谓词。把 Date 比较统一到 day 粒度(忽略时分秒)。 */
function evalPredicate(pred: Predicate, task: Task, ctx: FilterContext): boolean {
  switch (pred.type) {
    case 'today':
      return task.dueDate !== null && isSameDay(task.dueDate, ctx.now);
    case 'tomorrow': {
      if (task.dueDate === null) return false;
      const tomorrow = new Date(ctx.now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return isSameDay(task.dueDate, tomorrow);
    }
    case 'overdue':
      return (
        task.dueDate !== null &&
        !task.completed &&
        task.dueDate.getTime() < startOfDay(ctx.now).getTime()
      );
    case 'completed':
      return task.completed;
    case 'uncompleted':
      return !task.completed;
    case 'starred':
      return task.isStarred;
    case 'archived':
      return task.isArchived;
    case 'recurring':
      return task.isRecurring;
    case 'priority':
      return task.priority === pred.level;
    case 'tag': {
      const ids = ctx.tagNameToIds.get(pred.name.toLowerCase());
      if (!ids || ids.length === 0) return false;
      return ids.some((id) => task.tags.includes(id));
    }
    case 'project': {
      if (task.projectId === null) return false;
      const ids = ctx.projectNameToIds.get(pred.name.toLowerCase());
      if (!ids || ids.length === 0) return false;
      return ids.includes(task.projectId);
    }
    case 'category': {
      if (task.categoryId === null) return false;
      const ids = ctx.categoryNameToIds.get(pred.name.toLowerCase());
      if (!ids || ids.length === 0) return false;
      return ids.includes(task.categoryId);
    }
  }
}

/** 把 store 里的 Tag[] / Project[] / Category[] 折叠成 FilterContext 需要的查找表。 */
export function buildFilterContext(params: {
  tags: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  now?: Date;
}): FilterContext {
  const tagNameToIds = new Map<string, string[]>();
  for (const t of params.tags) {
    const key = t.name.toLowerCase();
    const arr = tagNameToIds.get(key);
    if (arr) arr.push(t.id);
    else tagNameToIds.set(key, [t.id]);
  }
  const projectNameToIds = new Map<string, string[]>();
  for (const p of params.projects) {
    const key = p.name.toLowerCase();
    const arr = projectNameToIds.get(key);
    if (arr) arr.push(p.id);
    else projectNameToIds.set(key, [p.id]);
  }
  const categoryNameToIds = new Map<string, string[]>();
  for (const c of params.categories) {
    const key = c.name.toLowerCase();
    const arr = categoryNameToIds.get(key);
    if (arr) arr.push(c.id);
    else categoryNameToIds.set(key, [c.id]);
  }
  return {
    tagNameToIds,
    projectNameToIds,
    categoryNameToIds,
    now: params.now ?? new Date(),
  };
}

/** 过滤任务列表。解析失败时返空数组 + 透出 errors。 */
export function filterTasksByDsl(
  tasks: Task[],
  query: string,
  ctx: FilterContext,
): { matched: Task[]; errors: ParseError[] } {
  const { ast, errors } = parseFilterDsl(query);
  if (errors.length > 0 || !ast) {
    return { matched: [], errors };
  }
  const matched = tasks.filter((t) => evalFilterNode(ast, t, ctx));
  return { matched, errors: [] };
}

// ===== 日期工具(内部使用,不导出避免污染 surface) =====

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
