import { useState } from 'react';
import { useAppStore } from '../../shared/store';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { EmptyState } from '../components/common/EmptyState';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#6B7280'];
const ICONS = ['briefcase', 'user', 'book', 'heart', 'shopping-cart', 'star', 'flag', 'tag'];

export function CategoriesPage() {
  const { categories, addCategory, deleteCategory } = useAppStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addCategory({
      name: name.trim(),
      description: '',
      color,
      icon,
      parentCategoryId: null,
      childCategoryIds: [],
      isSystem: false,
      isArchived: false,
      taskCount: 0,
      order: categories.length,
      projectId: null,
    });
    setName('');
    setColor(COLORS[0]);
    setIcon(ICONS[0]);
  };

  const handleDelete = (id: string, name: string, taskCount: number, isSystem: boolean) => {
    if (isSystem) return; // 系统分类不允许删除
    const msg = taskCount > 0
      ? `确定要删除分类「${name}」吗?\n该分类下有 ${taskCount} 个任务,删除后任务将变为「未分类」。`
      : `确定要删除分类「${name}」吗?`;
    if (window.confirm(msg)) deleteCategory(id);
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-6 sm:text-2xl">分类</h1>

      <form onSubmit={handleAdd} className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-end sm:p-4">
        <div className="flex-1 sm:min-w-[200px]">
          <Input label="分类名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="输入分类名称" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">颜色</label>
          <div className="flex flex-wrap gap-1.5 sm:flex-nowrap sm:gap-1">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`选择颜色 ${c}`} className={`h-8 w-8 rounded-full border-2 transition-transform sm:h-7 sm:w-7 ${color === c ? 'border-slate-800 dark:border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">图标</label>
          <select value={icon} onChange={(e) => setIcon(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            {ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
          </select>
        </div>
        <Button type="submit" className="shrink-0">添加分类</Button>
      </form>

      {categories.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title="暂无分类"
          hint="用分类标记任务类型,例如「工作」「学习」「生活」。在上方表单创建你的第一个分类。"
        />
      ) : (
        <div className="space-y-2">
          {categories.map((category) => (
            <div key={category.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:flex-nowrap sm:gap-3">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  {category.name}
                  {category.isSystem && <span className="ml-2 text-xs text-slate-400">系统</span>}
                </p>
                {category.description && <p className="text-xs text-slate-500 dark:text-slate-400">{category.description}</p>}
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500">{category.taskCount} 任务</span>
              <button
                onClick={() => handleDelete(category.id, category.name, category.taskCount ?? 0, category.isSystem ?? false)}
                disabled={category.isSystem}
                className="text-sm text-slate-400 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-500"
                aria-label={category.isSystem ? '系统分类不可删除' : `删除分类 ${category.name}`}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
