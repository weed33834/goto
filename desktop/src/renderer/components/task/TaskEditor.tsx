import { useState } from 'react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useTaskStore } from '../../store/taskStore';
import { useAppStore } from '../../../shared/store';
import type { Task } from '../../../shared/types';

type Priority = Task['priority'];
type Status = Task['status'];

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent', 'critical'];
const STATUSES: Status[] = ['todo', 'in-progress', 'waiting', 'delegated', 'completed', 'cancelled', 'on-hold'];

const PRIORITY_LABELS: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
  critical: '关键',
};

const STATUS_LABELS: Record<Status, string> = {
  'todo': '待办',
  'in-progress': '进行中',
  'waiting': '等待',
  'delegated': '已委派',
  'completed': '已完成',
  'cancelled': '已取消',
  'on-hold': '暂停',
};

interface TaskEditorProps {
  /** 传入则进入编辑模式，对现有任务做修改；不传为新建模式。 */
  editingTask?: Task | null;
  /** 编辑模式提交或取消后回调，用于退出 inline 编辑态。 */
  onDone?: () => void;
}

export function TaskEditor({ editingTask, onDone }: TaskEditorProps) {
  const isEditing = !!editingTask;
  const { create, update } = useTaskStore();
  const projects = useAppStore((s) => s.projects);
  const categories = useAppStore((s) => s.categories);
  const tags = useAppStore((s) => s.tags);

  const [title, setTitle] = useState(editingTask?.title ?? '');
  const [description, setDescription] = useState(editingTask?.description ?? '');
  const [priority, setPriority] = useState<Priority>(editingTask?.priority ?? 'medium');
  const [status, setStatus] = useState<Status>(editingTask?.status ?? 'todo');
  // 日期输入用字符串(yyyy-MM-dd),提交时转 Date 对象
  const [dueDate, setDueDate] = useState(
    editingTask?.dueDate ? editingTask.dueDate.toISOString().slice(0, 10) : '',
  );
  const [projectId, setProjectId] = useState<string | null>(editingTask?.projectId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(editingTask?.categoryId ?? null);
  const [selectedTags, setSelectedTags] = useState<string[]>(editingTask?.tags ?? []);

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setStatus('todo');
    setDueDate('');
    setProjectId(null);
    setCategoryId(null);
    setSelectedTags([]);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (isEditing && editingTask) {
      // 完成态与 completed/completedAt 保持一致，与 TaskCard 的勾选逻辑对齐
      const completed = status === 'completed';
      await update(editingTask.id, {
        title: title.trim(),
        description: description.trim() || '',
        priority,
        status,
        dueDate: dueDate ? new Date(dueDate) : null,
        projectId,
        categoryId,
        tags: selectedTags,
        completed,
        completedAt: completed ? (editingTask.completedAt ?? new Date()) : null,
      });
      onDone?.();
    } else {
      await create({
        title: title.trim(),
        description: description.trim() || '',
        priority,
        status,
        dueDate: dueDate ? new Date(dueDate) : null,
        projectId,
        categoryId,
        tags: selectedTags,
      });
      reset();
    }
  };

  const handleCancel = () => {
    onDone?.();
  };

  const selectClass =
    'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
    >
      <Input
        placeholder="任务标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <textarea
        placeholder="描述（可选）"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          优先级
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={`${selectClass} min-w-0 flex-1 sm:min-w-[auto]`}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          状态
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className={`${selectClass} min-w-0 flex-1 sm:min-w-[auto]`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          截止
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={`${selectClass} min-w-0 flex-1 sm:min-w-[auto]`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          项目
          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value || null)}
            className={`${selectClass} min-w-0 flex-1 sm:min-w-[auto]`}
          >
            <option value="">无</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 sm:col-span-1">
          分类
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
            className={`${selectClass} min-w-0 flex-1 sm:min-w-[auto]`}
          >
            <option value="">无</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const active = selectedTags.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit">{isEditing ? '保存修改' : '添加'}</Button>
        {isEditing && (
          <Button type="button" variant="secondary" onClick={handleCancel}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
