import { useState } from 'react';
import { useAppStore } from '../../shared/store';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { EmptyState } from '../components/common/EmptyState';

const COLORS = ['#EF4444', '#F59E0B', '#6B7280', '#8B5CF6', '#3B82F6', '#10B981', '#EC4899', '#14B8A6'];

export function TagsPage() {
  const { tags, addTag, deleteTag } = useAppStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addTag({
      name: name.trim(),
      color,
      icon: 'tag',
      isSystem: false,
      usageCount: 0,
      createdBy: null,
    });
    setName('');
    setColor(COLORS[0]);
  };

  const handleDelete = (id: string, name: string, usageCount: number) => {
    const msg = usageCount > 0
      ? `确定要删除标签「${name}」吗?\n该标签被 ${usageCount} 个任务使用,删除后任务将不再带此标签。`
      : `确定要删除标签「${name}」吗?`;
    if (window.confirm(msg)) deleteTag(id);
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-6 sm:text-2xl">标签</h1>

      <form onSubmit={handleAdd} className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-end sm:p-4">
        <div className="flex-1 sm:min-w-[200px]">
          <Input label="标签名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="输入标签名称" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">颜色</label>
          <div className="flex flex-wrap gap-1.5 sm:flex-nowrap sm:gap-1">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`选择颜色 ${c}`} className={`h-8 w-8 rounded-full border-2 transition-transform sm:h-7 sm:w-7 ${color === c ? 'border-slate-800 dark:border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <Button type="submit" className="shrink-0">添加标签</Button>
      </form>

      {tags.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title="暂无标签"
          hint="用标签快速标记任务,例如「紧急」「等待」「15分钟内可完成」。在上方表单创建你的第一个标签。"
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag.id} className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm" style={{ borderColor: tag.color, color: tag.color }}>
              {tag.name}
              <span className="text-xs text-slate-400">{tag.usageCount}</span>
              <button
                onClick={() => handleDelete(tag.id, tag.name, tag.usageCount)}
                className="text-slate-400 hover:text-danger"
                aria-label={`删除标签 ${tag.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
