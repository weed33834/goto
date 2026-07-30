import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '@shared/store';
import { buildTaskInput, priorityMeta } from '../lib/taskInput';
import type { Task, Priority } from '@shared/types';
import { toDateInput } from '@shared/utils/dateUtils';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Task | null;
}

const priorities: Priority[] = ['low', 'medium', 'high', 'urgent', 'critical'];

// 移动端专属:底部抽屉式任务编辑(替代桌面端居中模态)。
export default function TaskSheet({ open, onClose, editing }: Props) {
  const addTask = useAppStore((s) => s.addTask);
  const updateTask = useAppStore((s) => s.updateTask);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [due, setDue] = useState('');

  // 打开时回填编辑对象,新增则清空(与抽屉生命周期绑定)。
  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? '');
    setDescription(editing?.description ?? '');
    setPriority(editing?.priority ?? 'medium');
    setDue(editing?.dueDate ? toDateInput(editing.dueDate) : '');
  }, [open, editing]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const base = {
      title: title.trim() || '（无标题）',
      description,
      priority,
      dueDate: due ? new Date(due) : null,
    };
    if (editing) {
      updateTask(editing.id, base);
    } else {
      addTask(buildTaskInput(base));
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/50"
      onClick={onClose}
      data-testid="sheet-backdrop"
    >
      <div
        className="w-full rounded-t-2xl bg-ink p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="任务编辑"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg-2 font-semibold">{editing ? '编辑任务' : '新建任务'}</h2>
          <button type="button" onClick={onClose} aria-label="关闭" className="text-paper/60">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input
            data-testid="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="任务标题"
            className="w-full rounded-lg bg-paper/10 px-3 py-2 text-base-2 outline-none focus:ring-2 focus:ring-gold"
          />
          <textarea
            data-testid="task-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述（可选）"
            rows={3}
            className="w-full rounded-lg bg-paper/10 px-3 py-2 text-sm-2 outline-none focus:ring-2 focus:ring-gold"
          />
          <div className="flex gap-2 overflow-x-auto">
            {priorities.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs-2 ${
                  priority === p ? 'bg-gold text-ink' : 'bg-paper/10 text-paper/70'
                }`}
              >
                {priorityMeta[p].label}
              </button>
            ))}
          </div>
          <input
            data-testid="task-due"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-full rounded-lg bg-paper/10 px-3 py-2 text-sm-2 outline-none focus:ring-2 focus:ring-gold"
          />
          <button
            type="submit"
            data-testid="task-submit"
            className="w-full rounded-lg bg-gold py-3 text-base-2 font-semibold text-ink transition-transform duration-fast active:scale-[0.98]"
          >
            {editing ? '保存' : '创建'}
          </button>
        </form>
      </div>
    </div>
  );
}
