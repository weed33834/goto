import { useState } from 'react';
import { useAppStore } from '../../shared/store';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { EmptyState } from '../components/common/EmptyState';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#6B7280'];

export function ProjectsPage() {
  const { projects, addProject, deleteProject } = useAppStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addProject({
      name: name.trim(),
      description: '',
      color,
      icon: 'folder',
      isDefault: false,
      isFavorite: false,
      isArchived: false,
      status: 'active',
      taskCount: 0,
      completedTaskCount: 0,
      progress: 0,
      startDate: null,
      dueDate: null,
      ownerId: null,
      tags: [],
      location: null,
    });
    setName('');
    setColor(COLORS[0]);
  };

  // P1-5:删除项目二次确认(关联 taskCount 提示用户影响范围)
  const handleDelete = (id: string, name: string, taskCount: number) => {
    const msg = taskCount > 0
      ? `确定要删除项目「${name}」吗?\n该项目下有 ${taskCount} 个任务,删除项目不会删除任务,但任务将不再归属任何项目。`
      : `确定要删除项目「${name}」吗?`;
    if (window.confirm(msg)) deleteProject(id);
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-6 sm:text-2xl">项目</h1>

      <form onSubmit={handleAdd} className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-end sm:p-4">
        <div className="flex-1 sm:min-w-[200px]">
          <Input label="项目名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="输入项目名称" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">颜色</label>
          <div className="flex flex-wrap gap-1.5 sm:flex-nowrap sm:gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`选择颜色 ${c}`}
                className={`h-8 w-8 rounded-full border-2 transition-transform sm:h-7 sm:w-7 ${color === c ? 'border-slate-800 dark:border-white scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <Button type="submit" className="shrink-0">添加项目</Button>
      </form>

      {projects.length === 0 ? (
        <EmptyState
          icon="📁"
          title="暂无项目"
          hint="用项目组织相关任务,例如「毕业论文」「健身计划」。在上方表单创建你的第一个项目。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div key={project.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
                  <h3 className="font-medium text-slate-800 dark:text-slate-100">{project.name}</h3>
                </div>
                <button
                  onClick={() => handleDelete(project.id, project.name, project.taskCount)}
                  className="text-sm text-slate-400 hover:text-danger dark:text-slate-500"
                  aria-label={`删除项目 ${project.name}`}
                >
                  删除
                </button>
              </div>
              {project.description && <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">{project.description}</p>}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500 sm:gap-3">
                <span>{project.taskCount} 任务</span>
                <span>{project.progress}% 完成</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">{project.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
