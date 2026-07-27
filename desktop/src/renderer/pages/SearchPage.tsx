import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../../shared/store';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { TaskCard } from '../components/task/TaskCard';
import { EmptyState } from '../components/common/EmptyState';

export function SearchPage() {
  const { tasks, searchHistory, addSearchToHistory, clearSearchHistory } = useAppStore();
  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQ);

  // 命令面板或其他入口通过 /search?q=xxx 跳转时,同步 query 状态。
  // 仅依赖 searchParams:URL 变化时同步,本地输入不触发此 effect。
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null && q !== query) {
      setQuery(q);
    }
  }, [searchParams, query]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (typeof t.description === 'string' && t.description.toLowerCase().includes(q)),
    );
  }, [query, tasks]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    addSearchToHistory(query.trim());
  };

  const handleClickHistory = (term: string) => {
    setQuery(term);
    addSearchToHistory(term);
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-6 sm:text-2xl">搜索</h1>

      <form onSubmit={handleSubmit} className="mb-4 sm:mb-6">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索任务标题或描述..."
              autoFocus
            />
          </div>
          <Button type="submit" className="shrink-0">搜索</Button>
        </div>
      </form>

      {!query.trim() && searchHistory.length > 0 && (
        <div className="mb-4 sm:mb-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">搜索历史</p>
            <button onClick={clearSearchHistory} className="text-xs text-slate-400 hover:text-danger">
              清除
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {searchHistory.map((term, idx) => (
              <button
                key={`${term}-${idx}`}
                onClick={() => handleClickHistory(term)}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {query.trim() && (
        <div>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            找到 {results.length} 个结果
          </p>
          {results.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="未找到匹配的任务"
              hint="试试不同的关键词,或检查拼写。也可以搜索任务描述中的内容。"
            />
          ) : (
            <div className="space-y-3">
              {results.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
