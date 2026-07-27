// SmartListPage —— Filter DSL 智能列表页(C5)
//
// 用户场景:任务量过百后,简单的"今日 / 已完成"等系统视图不够用。
// 用户需要一个能表达"今天且 P1 且带 @work 标签"这类复合条件的入口,
// 并能保存为可复用的"智能列表"。
//
// 布局:
// - 顶部表单:DSL 输入框 + 实时解析结果(命中数 / 错误)
// - "保存为智能列表"按钮 → 弹出 name 输入(用 window.prompt,与备份按钮风格一致)
// - 已保存的智能列表 chips:点击应用,旁边小 × 删除
// - 命中任务列表(复用 TaskCard)
// - 折叠的"语法速查"区块,首次访问默认展开
import { useMemo, useState } from 'react';
import { useAppStore } from '../../shared/store';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { TaskCard } from '../components/task/TaskCard';
import { EmptyState } from '../components/common/EmptyState';
import { filterTasksByDsl, buildFilterContext, type ParseError } from '../../shared/filter/filterDsl';

const SYNTAX_HELP = [
  ['today', '今天到期'],
  ['tomorrow', '明天到期'],
  ['overdue', '已过期且未完成'],
  ['completed / done', '已完成'],
  ['uncompleted / open', '未完成'],
  ['starred', '已加星'],
  ['archived', '已归档'],
  ['recurring', '重复任务'],
  ['p1 / p2 / p3 / p4', '优先级:urgent / high / medium / low'],
  ['@tagname', '标签名(大小写不敏感,支持中文)'],
  ['#projectname', '项目名'],
  ['/categoryname', '分类名'],
  ['& | !', 'AND / OR / NOT(可省略 &,空格分隔默认 AND)'],
  ['( )', '分组,如 (p1 | p2) & today'],
];

export function SmartListPage() {
  const tasks = useAppStore((s) => s.tasks);
  const tags = useAppStore((s) => s.tags);
  const projects = useAppStore((s) => s.projects);
  const categories = useAppStore((s) => s.categories);
  const smartLists = useAppStore((s) => s.smartLists);
  const addSmartList = useAppStore((s) => s.addSmartList);
  const deleteSmartList = useAppStore((s) => s.deleteSmartList);

  const [query, setQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // 把 store 的 tags/projects/categories 折叠成 FilterContext。
  // 每当任一源数据变化时重算,但 Map 构造成本低,不必再做深比较。
  const ctx = useMemo(
    () => buildFilterContext({ tags, projects, categories }),
    [tags, projects, categories],
  );

  const { matched, errors } = useMemo(
    () => filterTasksByDsl(tasks, query, ctx),
    [tasks, query, ctx],
  );

  const handleSave = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (errors.length > 0) {
      window.alert('查询存在语法错误,请先修正后再保存。');
      return;
    }
    const name = window.prompt('为这个智能列表命名:', trimmed);
    if (!name || !name.trim()) return;
    const id = addSmartList({ name, query: trimmed });
    if (id === null) {
      window.alert('保存失败:名称和查询不能为空。');
    }
  };

  const handleApplySaved = (savedQuery: string) => {
    setQuery(savedQuery);
  };

  const handleDeleteSaved = (id: string, name: string) => {
    if (window.confirm(`删除智能列表"${name}"?`)) {
      deleteSmartList(id);
    }
  };

  const hasQuery = query.trim().length > 0;
  const sortedSmartLists = useMemo(
    () => [...smartLists].sort((a, b) => a.order - b.order),
    [smartLists],
  );

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-6 sm:text-2xl">
        智能列表
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="mb-4 sm:mb-6"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例:today & p1 & @work"
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <Button type="submit" className="shrink-0" disabled={!hasQuery || errors.length > 0}>
            保存为智能列表
          </Button>
        </div>
      </form>

      {/* 语法速查(可折叠) */}
      <div className="mb-4 sm:mb-6">
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {showHelp ? '▼ 隐藏语法速查' : '▶ 显示语法速查'}
        </button>
        {showHelp && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <table className="w-full text-xs">
              <tbody>
                {SYNTAX_HELP.map(([syntax, desc]) => (
                  <tr key={syntax} className="border-b border-slate-100 last:border-0 dark:border-slate-700/50">
                    <td className="py-1.5 pr-3 font-mono text-slate-700 dark:text-slate-200">{syntax}</td>
                    <td className="py-1.5 text-slate-500 dark:text-slate-400">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 已保存的智能列表 */}
      {sortedSmartLists.length > 0 && (
        <div className="mb-4 sm:mb-6">
          <p className="mb-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            已保存({sortedSmartLists.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {sortedSmartLists.map((sl) => (
              <div
                key={sl.id}
                className="group flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-200"
              >
                <button
                  type="button"
                  onClick={() => handleApplySaved(sl.query)}
                  className="text-left"
                  title={sl.query}
                >
                  {sl.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSaved(sl.id, sl.name)}
                  className="ml-1 text-slate-400 hover:text-danger"
                  aria-label={`删除 ${sl.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 解析错误 */}
      {hasQuery && errors.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-400">
          <p className="mb-1 font-medium">查询解析失败({errors.length} 处错误):</p>
          <ul className="space-y-0.5">
            {errors.slice(0, 5).map((err: ParseError, i) => (
              <li key={i}>
                列 {err.column}:{err.message}
              </li>
            ))}
            {errors.length > 5 && (
              <li className="text-slate-500 dark:text-slate-400">
                …还有 {errors.length - 5} 条错误未展示
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 命中任务 */}
      {hasQuery && errors.length === 0 && (
        <div>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            命中 {matched.length} 个任务
          </p>
          {matched.length === 0 ? (
            <EmptyState
              icon="🎯"
              title="没有匹配的任务"
              hint="试试调整查询条件,或检查标签/项目名是否拼写正确。"
            />
          ) : (
            <div className="space-y-3">
              {matched.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 空态:用户尚未输入查询 */}
      {!hasQuery && sortedSmartLists.length === 0 && (
        <EmptyState
          icon="🎯"
          title="用一行查询表达任意筛选"
          hint="支持 today / p1 / @work 这类 Todoist 风格的简写,AND/OR/NOT 与括号组合,保存为可复用的智能列表。"
        />
      )}
    </div>
  );
}
