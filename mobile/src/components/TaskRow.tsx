import { motion } from 'framer-motion';
import { Check, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { Task } from '@shared/types';
import { priorityMeta } from '../lib/taskInput';

interface Props {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen?: (task: Task) => void;
}

// 移动端任务行:触摸手势(右滑完成 / 左滑删除)+ 常驻勾选/删除按钮(兼顾可访问性与测试)。
export default function TaskRow({ task, onToggle, onDelete, onOpen }: Props) {
  const p = priorityMeta[task.priority];

  return (
    <motion.div
      className="relative"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.4}
      onDragEnd={(_event, info) => {
        if (info.offset.x > 80) onToggle(task.id);
        else if (info.offset.x < -80) onDelete(task.id);
      }}
    >
      <div
        className={clsx(
          'flex items-center gap-3 rounded-xl border border-paper/10 bg-paper/5 px-4 py-3',
          task.completed && 'opacity-50',
        )}
      >
        <button
          type="button"
          onClick={() => onToggle(task.id)}
          aria-label={task.completed ? '标记未完成' : '标记完成'}
          data-testid={`toggle-${task.id}`}
          className={clsx(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-fast',
            task.completed ? 'border-olive bg-olive text-ink' : 'border-paper/40',
          )}
        >
          {task.completed && <Check size={14} />}
        </button>

        <button type="button" onClick={() => onOpen?.(task)} className="min-w-0 flex-1 text-left">
          <p className={clsx('truncate text-base-2', task.completed && 'line-through')}>
            {task.title || '（无标题）'}
          </p>
          <p className={clsx('text-xs-2', p.color)}>{p.label}</p>
        </button>

        <button
          type="button"
          onClick={() => onDelete(task.id)}
          aria-label="删除任务"
          data-testid={`delete-${task.id}`}
          className="shrink-0 text-paper/40 transition-colors duration-fast active:text-seal"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </motion.div>
  );
}
