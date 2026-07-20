// ProjectDetailPage — 项目详情(Phase 1.10)
//
// 路由:/projects/:id
// 展示:
//   - 项目元信息(名称 / 颜色 / 描述 / 进度)
//   - 项目下任务列表(复用 TaskList,通过 tasksOverride 注入,避免重复 fetch)
//   - 项目下任务的统计(总数 / 完成 / 逾期)
//   - 编辑项目名称 / 描述 / 颜色(行内编辑,改完点保存)
//   - 返回 /projects 列表页入口

import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAppStore } from '../../shared/store';
import { useTaskStore } from '../store/taskStore';
import { TaskList } from '../components/task/TaskList';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#6B7280'];

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projects = useAppStore((s) => s.projects);
  const updateProject = useAppStore((s) => s.updateProject);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const allTasks = useTaskStore((s) => s.tasks);

  const project = useMemo(() => projects.find((p) => p.id === id), [projects, id]);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [color, setColor] = useState(project?.color ?? COLORS[0]);

  const projectTasks = useMemo(() => {
    if (!id) return [];
    return allTasks.filter((t) => t.projectId === id && !t.isArchived && !t.isDeleted);
  }, [allTasks, id]);

  const stats = useMemo(() => {
    const total = projectTasks.length;
    const done = projectTasks.filter((t) => t.completed).length;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const overdue = projectTasks.filter((t) => !t.completed && t.dueDate && new Date(t.dueDate) < todayStart).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, overdue, pct };
  }, [projectTasks]);

  if (!project) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm text-slate-500 dark:text-slate-400">项目不存在或已被删除</p>
        <Link to="/projects" className="text-sm text-primary hover:underline">返回项目列表</Link>
      </div>
    );
  }

  const handleSave = () => {
    if (!name.trim()) return;
    updateProject(project.id, {
      name: name.trim(),
      description: description.trim(),
      color,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setName(project.name);
    setDescription(project.description);
    setColor(project.color);
    setEditing(false);
  };

  const handleDelete = () => {
    const msg = stats.total > 0
      ? `确定要删除项目「${project.name}」吗?\n该项目下有 ${stats.total} 个任务,删除项目不会删除任务,但任务将不再归属任何项目。`
      : `确定要删除项目「${project.name}」吗?`;
    if (window.confirm(msg)) {
      deleteProject(project.id);
      navigate('/projects');
    }
  };

  return (
    <div className="space-y-4">
      {/* 面包屑 */}
      <nav className="text-sm text-slate-500 dark:text-slate-400">
        <Link to="/projects" className="hover:text-primary">项目</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700 dark:text-slate-200">{project.name}</span>
      </nav>

      {/* 项目头部 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        {editing ? (
          <div className="space-y-3">
            <Input label="项目名称" value={name} onChange={(e) => setName(e.target.value)} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">颜色</label>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`选择颜色 ${c}`}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${color === c ? 'border-slate-800 scale-110 dark:border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>保存</Button>
              <Button size="sm" variant="secondary" onClick={handleCancel}>取消</Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
                  <h1 className="truncate text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">{project.name}</h1>
                </div>
                {project.description && (
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{project.description}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>编辑</Button>
                <Button size="sm" variant="ghost" onClick={handleDelete}>删除</Button>
              </div>
            </div>

            {/* 进度条 */}
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{stats.done} / {stats.total} 完成</span>
                <span>{stats.pct}%{stats.overdue > 0 && <span className="ml-2 text-danger">· {stats.overdue} 逾期</span>}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className="h-full bg-primary transition-all" style={{ width: `${stats.pct}%` }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 项目任务列表(复用 TaskList,通过 tasksOverride 注入) */}
      <TaskList filter="all" tasksOverride={projectTasks} />
    </div>
  );
}
