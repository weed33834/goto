// @vitest-environment jsdom
// Filter DSL 单元测试 —— 覆盖 tokenizer / parser / evaluator / buildFilterContext。
//
// 测试策略:
// - 用固定 now=2026-03-15 让 today/tomorrow/overdue 可断言
// - 用最小 Task 工厂减少噪音,只填谓词关心的字段
// - 谓词 / 组合 / 否定 / 括号 / 错误恢复 各开一组
import { describe, it, expect } from 'vitest';
import {
  parseFilterDsl,
  evalFilterNode,
  buildFilterContext,
  filterTasksByDsl,
  ParseError,
  type FilterContext,
} from './filterDsl';
import type { Task } from '../types';

// 固定"今天":2026-03-15 周日 12:00(中午,避免边界问题)
const NOW = new Date(2026, 2, 15, 12, 0, 0);
const TODAY = new Date(2026, 2, 15, 9, 30, 0);
const TOMORROW = new Date(2026, 2, 16, 14, 0, 0);
const YESTERDAY = new Date(2026, 2, 14, 8, 0, 0);

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'T',
    description: '',
    content: '',
    dueDate: null,
    dueTime: null,
    startDate: null,
    startTime: null,
    endDate: null,
    reminderDate: null,
    recurrence: null,
    priority: 'medium',
    status: 'todo',
    progress: 0,
    categoryId: null,
    projectId: null,
    tags: [],
    completed: false,
    completedAt: null,
    estimatedTime: null,
    actualTime: null,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    isRecurring: false,
    parentTaskId: null,
    subtasks: [],
    attachments: [],
    comments: [],
    links: [],
    customFields: [],
    location: null,
    dependencies: [],
    blockedBy: [],
    isStarred: false,
    isHidden: false,
    isArchived: false,
    notes: [],
    checklist: [],
    assigneeId: null,
    createdBy: null,
    order: 0,
    version: 0,
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

function makeCtx(opts: {
  tags?: { id: string; name: string }[];
  projects?: { id: string; name: string }[];
  categories?: { id: string; name: string }[];
} = {}): FilterContext {
  return buildFilterContext({
    tags: opts.tags ?? [],
    projects: opts.projects ?? [],
    categories: opts.categories ?? [],
    now: NOW,
  });
}

// ===== 谓词 =====

describe('Filter DSL 谓词', () => {
  it('today:匹配 dueDate=今天', () => {
    const ast = parseFilterDsl('today').ast!;
    expect(evalFilterNode(ast, makeTask({ dueDate: TODAY }), makeCtx())).toBe(true);
    expect(evalFilterNode(ast, makeTask({ dueDate: TOMORROW }), makeCtx())).toBe(false);
    expect(evalFilterNode(ast, makeTask({ dueDate: null }), makeCtx())).toBe(false);
  });

  it('tomorrow:匹配 dueDate=明天', () => {
    const ast = parseFilterDsl('tomorrow').ast!;
    expect(evalFilterNode(ast, makeTask({ dueDate: TOMORROW }), makeCtx())).toBe(true);
    expect(evalFilterNode(ast, makeTask({ dueDate: TODAY }), makeCtx())).toBe(false);
  });

  it('overdue:匹配 dueDate<今天 且未完成', () => {
    const ast = parseFilterDsl('overdue').ast!;
    expect(evalFilterNode(ast, makeTask({ dueDate: YESTERDAY, completed: false }), makeCtx())).toBe(true);
    // 已完成的过期任务不算 overdue(不再提醒)
    expect(evalFilterNode(ast, makeTask({ dueDate: YESTERDAY, completed: true }), makeCtx())).toBe(false);
    expect(evalFilterNode(ast, makeTask({ dueDate: TODAY, completed: false }), makeCtx())).toBe(false);
    expect(evalFilterNode(ast, makeTask({ dueDate: null }), makeCtx())).toBe(false);
  });

  it('completed / uncompleted:基于 completed 字段', () => {
    const doneAst = parseFilterDsl('completed').ast!;
    const openAst = parseFilterDsl('uncompleted').ast!;
    const done = makeTask({ completed: true });
    const open = makeTask({ completed: false });
    expect(evalFilterNode(doneAst, done, makeCtx())).toBe(true);
    expect(evalFilterNode(doneAst, open, makeCtx())).toBe(false);
    expect(evalFilterNode(openAst, open, makeCtx())).toBe(true);
    expect(evalFilterNode(openAst, done, makeCtx())).toBe(false);
  });

  it('别名:done=open', () => {
    expect(parseFilterDsl('done').ast).toEqual(parseFilterDsl('completed').ast);
    expect(parseFilterDsl('open').ast).toEqual(parseFilterDsl('uncompleted').ast);
    expect(parseFilterDsl('star').ast).toEqual(parseFilterDsl('starred').ast);
  });

  it('starred / archived / recurring:标记位', () => {
    expect(evalFilterNode(parseFilterDsl('starred').ast!, makeTask({ isStarred: true }), makeCtx())).toBe(true);
    expect(evalFilterNode(parseFilterDsl('starred').ast!, makeTask({ isStarred: false }), makeCtx())).toBe(false);
    expect(evalFilterNode(parseFilterDsl('archived').ast!, makeTask({ isArchived: true }), makeCtx())).toBe(true);
    expect(evalFilterNode(parseFilterDsl('recurring').ast!, makeTask({ isRecurring: true }), makeCtx())).toBe(true);
  });

  it('p1-p4:映射到 urgent/high/medium/low', () => {
    expect(evalFilterNode(parseFilterDsl('p1').ast!, makeTask({ priority: 'urgent' }), makeCtx())).toBe(true);
    expect(evalFilterNode(parseFilterDsl('p2').ast!, makeTask({ priority: 'high' }), makeCtx())).toBe(true);
    expect(evalFilterNode(parseFilterDsl('p3').ast!, makeTask({ priority: 'medium' }), makeCtx())).toBe(true);
    expect(evalFilterNode(parseFilterDsl('p4').ast!, makeTask({ priority: 'low' }), makeCtx())).toBe(true);
    expect(evalFilterNode(parseFilterDsl('p1').ast!, makeTask({ priority: 'low' }), makeCtx())).toBe(false);
    // p5 不在合法优先级范围,parse 应失败(ast=null, errors 非空),由"错误处理"组覆盖
    expect(parseFilterDsl('p5').ast).toBeNull();
  });

  it('@tag:大小写不敏感匹配 Tag.name → task.tags 含对应 id', () => {
    const ctx = makeCtx({ tags: [{ id: 'tag-work', name: 'Work' }] });
    const ast = parseFilterDsl('@work').ast!;
    expect(evalFilterNode(ast, makeTask({ tags: ['tag-work'] }), ctx)).toBe(true);
    expect(evalFilterNode(ast, makeTask({ tags: ['tag-other'] }), ctx)).toBe(false);
    expect(evalFilterNode(ast, makeTask({ tags: [] }), ctx)).toBe(false);
  });

  it('@tag:ctx 中无该 tag 名 → 返 false(不报错)', () => {
    const ctx = makeCtx({ tags: [] });
    const ast = parseFilterDsl('@work').ast!;
    expect(evalFilterNode(ast, makeTask({ tags: ['tag-work'] }), ctx)).toBe(false);
  });

  it('@tag:支持中文名', () => {
    const ctx = makeCtx({ tags: [{ id: 't-zh', name: '工作' }] });
    const ast = parseFilterDsl('@工作').ast!;
    expect(evalFilterNode(ast, makeTask({ tags: ['t-zh'] }), ctx)).toBe(true);
  });

  it('#project:匹配 Project.name → task.projectId', () => {
    const ctx = makeCtx({ projects: [{ id: 'p-goto', name: 'Goto' }] });
    const ast = parseFilterDsl('#goto').ast!;
    expect(evalFilterNode(ast, makeTask({ projectId: 'p-goto' }), ctx)).toBe(true);
    expect(evalFilterNode(ast, makeTask({ projectId: 'p-other' }), ctx)).toBe(false);
    expect(evalFilterNode(ast, makeTask({ projectId: null }), ctx)).toBe(false);
  });

  it('/category:匹配 Category.name → task.categoryId', () => {
    const ctx = makeCtx({ categories: [{ id: 'c-inbox', name: 'Inbox' }] });
    const ast = parseFilterDsl('/inbox').ast!;
    expect(evalFilterNode(ast, makeTask({ categoryId: 'c-inbox' }), ctx)).toBe(true);
    expect(evalFilterNode(ast, makeTask({ categoryId: null }), ctx)).toBe(false);
  });
});

// ===== 组合子 =====

describe('Filter DSL 组合子', () => {
  it('显式 &:today & p1', () => {
    const ast = parseFilterDsl('today & p1').ast!;
    const ctx = makeCtx();
    expect(evalFilterNode(ast, makeTask({ dueDate: TODAY, priority: 'urgent' }), ctx)).toBe(true);
    expect(evalFilterNode(ast, makeTask({ dueDate: TODAY, priority: 'medium' }), ctx)).toBe(false);
    expect(evalFilterNode(ast, makeTask({ dueDate: TOMORROW, priority: 'urgent' }), ctx)).toBe(false);
  });

  it('隐式 AND(空格分隔):today p1 == today & p1', () => {
    expect(parseFilterDsl('today p1').ast).toEqual(parseFilterDsl('today & p1').ast);
  });

  it('用户场景:today & p1 & @work', () => {
    const ctx = makeCtx({ tags: [{ id: 'tag-work', name: 'work' }] });
    const ast = parseFilterDsl('today & p1 & @work').ast!;
    const hit = makeTask({ dueDate: TODAY, priority: 'urgent', tags: ['tag-work'] });
    const miss1 = makeTask({ dueDate: TODAY, priority: 'urgent', tags: [] });
    const miss2 = makeTask({ dueDate: TODAY, priority: 'medium', tags: ['tag-work'] });
    const miss3 = makeTask({ dueDate: TOMORROW, priority: 'urgent', tags: ['tag-work'] });
    expect(evalFilterNode(ast, hit, ctx)).toBe(true);
    expect(evalFilterNode(ast, miss1, ctx)).toBe(false);
    expect(evalFilterNode(ast, miss2, ctx)).toBe(false);
    expect(evalFilterNode(ast, miss3, ctx)).toBe(false);
  });

  it('显式 |:p1 | p2', () => {
    const ast = parseFilterDsl('p1 | p2').ast!;
    const ctx = makeCtx();
    expect(evalFilterNode(ast, makeTask({ priority: 'urgent' }), ctx)).toBe(true);
    expect(evalFilterNode(ast, makeTask({ priority: 'high' }), ctx)).toBe(true);
    expect(evalFilterNode(ast, makeTask({ priority: 'medium' }), ctx)).toBe(false);
  });

  it('AND 优先于 OR: p1 | p2 & p3 解析为 p1 | (p2 & p3)', () => {
    const ast = parseFilterDsl('p1 | p2 & p3').ast!;
    expect(ast.kind).toBe('or');
    if (ast.kind === 'or') {
      expect(ast.children).toHaveLength(2);
      expect(ast.children[0].kind).toBe('predicate');
      expect(ast.children[1].kind).toBe('and');
    }
  });

  it('!:否定单个谓词', () => {
    const ast = parseFilterDsl('!completed').ast!;
    expect(evalFilterNode(ast, makeTask({ completed: true }), makeCtx())).toBe(false);
    expect(evalFilterNode(ast, makeTask({ completed: false }), makeCtx())).toBe(true);
  });

  it('!!:双重否定语义等价于原谓词(AST 不同但 eval 结果一致)', () => {
    // AST 结构不同: !!completed = not(not(completed)),completed = predicate
    // 但 eval 结果应一致 —— 这正是用户预期
    const ctx = makeCtx();
    const done = makeTask({ completed: true });
    const open = makeTask({ completed: false });
    const doubleNeg = parseFilterDsl('!!completed').ast!;
    const direct = parseFilterDsl('completed').ast!;
    expect(evalFilterNode(doubleNeg, done, ctx)).toBe(evalFilterNode(direct, done, ctx));
    expect(evalFilterNode(doubleNeg, open, ctx)).toBe(evalFilterNode(direct, open, ctx));
    // 验证 AST 确实是 not(not(...))
    expect(doubleNeg.kind).toBe('not');
    if (doubleNeg.kind === 'not') {
      expect(doubleNeg.child.kind).toBe('not');
    }
  });

  it('!& 优先级: !completed & p1 解析为 (!completed) & p1', () => {
    const ast = parseFilterDsl('!completed & p1').ast!;
    expect(ast.kind).toBe('and');
    if (ast.kind === 'and') {
      expect(ast.children[0].kind).toBe('not');
      expect(ast.children[1].kind).toBe('predicate');
    }
  });

  it('括号: (p1 | p2) & today', () => {
    const ast = parseFilterDsl('(p1 | p2) & today').ast!;
    expect(ast.kind).toBe('and');
    if (ast.kind === 'and') {
      expect(ast.children[0].kind).toBe('or');
      expect(ast.children[1].kind).toBe('predicate');
    }
    const ctx = makeCtx();
    expect(evalFilterNode(ast, makeTask({ priority: 'urgent', dueDate: TODAY }), ctx)).toBe(true);
    expect(evalFilterNode(ast, makeTask({ priority: 'high', dueDate: TODAY }), ctx)).toBe(true);
    expect(evalFilterNode(ast, makeTask({ priority: 'urgent', dueDate: TOMORROW }), ctx)).toBe(false);
    expect(evalFilterNode(ast, makeTask({ priority: 'medium', dueDate: TODAY }), ctx)).toBe(false);
  });
});

// ===== 错误处理 =====

describe('Filter DSL 错误处理', () => {
  it('空字符串:ast=null, errors=[]', () => {
    const r = parseFilterDsl('');
    expect(r.ast).toBeNull();
    expect(r.errors).toHaveLength(0);
  });

  it('纯空白:同空字符串', () => {
    const r = parseFilterDsl('   \t  ');
    expect(r.ast).toBeNull();
    expect(r.errors).toHaveLength(0);
  });

  it('未知谓词:报错 + ast=null', () => {
    const r = parseFilterDsl('foobar');
    expect(r.ast).toBeNull();
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toBeInstanceOf(ParseError);
    expect(r.errors[0].message).toContain('foobar');
    expect(r.errors[0].column).toBe(1);
  });

  it('"@" 后无名字:报错', () => {
    const r = parseFilterDsl('@');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('@');
  });

  it('"&" 后无表达式:报错', () => {
    const r = parseFilterDsl('today &');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('&');
  });

  it('"!" 后无表达式:报错', () => {
    const r = parseFilterDsl('!');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('!');
  });

  it('未闭合括号:报错', () => {
    const r = parseFilterDsl('(today & p1');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('右括号');
  });

  it('多余右括号:报错', () => {
    const r = parseFilterDsl('today)');
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('p5 不是合法优先级:报错', () => {
    const r = parseFilterDsl('p5');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('p5');
  });

  it('错误恢复:继续解析后续 token,可能报多条', () => {
    // foobar 是非法,但 & today 是合法 —— parser 应在 foobar 后继续
    const r = parseFilterDsl('foobar & today');
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
  });
});

// ===== filterTasksByDsl 集成 =====

describe('filterTasksByDsl 集成', () => {
  it('用例:today & p1 & @work 从任务列表中筛出唯一一条', () => {
    const tasks = [
      makeTask({ id: '1', title: 'A', dueDate: TODAY, priority: 'urgent', tags: ['tag-work'] }),
      makeTask({ id: '2', title: 'B', dueDate: TODAY, priority: 'medium', tags: ['tag-work'] }),
      makeTask({ id: '3', title: 'C', dueDate: TOMORROW, priority: 'urgent', tags: ['tag-work'] }),
      makeTask({ id: '4', title: 'D', dueDate: TODAY, priority: 'urgent', tags: [] }),
    ];
    const ctx = makeCtx({ tags: [{ id: 'tag-work', name: 'work' }] });
    const { matched, errors } = filterTasksByDsl(tasks, 'today & p1 & @work', ctx);
    expect(errors).toHaveLength(0);
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe('1');
  });

  it('解析失败:返空列表 + errors', () => {
    const { matched, errors } = filterTasksByDsl([makeTask()], 'bad-query', makeCtx());
    expect(matched).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('空查询:返空列表,无错误', () => {
    const { matched, errors } = filterTasksByDsl([makeTask()], '', makeCtx());
    expect(matched).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it('否定组合:!completed & overdue → 未完成且过期', () => {
    const tasks = [
      makeTask({ id: '1', dueDate: YESTERDAY, completed: false }),
      makeTask({ id: '2', dueDate: YESTERDAY, completed: true }),
      makeTask({ id: '3', dueDate: TODAY, completed: false }),
    ];
    const { matched } = filterTasksByDsl(tasks, '!completed & overdue', makeCtx());
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe('1');
  });
});

// ===== buildFilterContext =====

describe('buildFilterContext', () => {
  it('同名 tag 折叠成 id 数组', () => {
    const ctx = makeCtx({ tags: [{ id: 'a', name: 'Work' }, { id: 'b', name: 'work' }] });
    expect(ctx.tagNameToIds.get('work')).toEqual(['a', 'b']);
  });

  it('now 默认为当前时间', () => {
    const before = Date.now();
    const ctx = buildFilterContext({ tags: [], projects: [], categories: [] });
    const after = Date.now();
    expect(ctx.now.getTime()).toBeGreaterThanOrEqual(before);
    expect(ctx.now.getTime()).toBeLessThanOrEqual(after);
  });

  it('传入 now 时使用注入值(便于测试)', () => {
    const fixed = new Date(2020, 0, 1);
    const ctx = buildFilterContext({ tags: [], projects: [], categories: [], now: fixed });
    expect(ctx.now).toBe(fixed);
  });
});
