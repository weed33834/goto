// TaskCard — 单条任务的卡片视图
//
// Phase 1.3 / 1.4:在原 title + dueDate 基础上增加:
//   - 优先级色条(左侧 border)
//   - 星标 / 重复 / 提醒 图标
//   - 子任务展开(可勾选)
//   - 标签 / 项目 / 能量 / 上下文 chip
//   - 进度条(progress > 0 时显示)
//
// 卡片整体可点击展开/折叠子任务区,编辑入口移到右上的"编辑"按钮。

import { useState } from 'react';
import { useTaskStore } from '../../store/taskStore';
import { useAppStore } from '../../../shared/store';
import type { Task, Priority } from '../../../shared/types';
import { TaskEditor } from './TaskEditor';
import { describeRecurrence } from '../../../shared/utils/recurrenceUtils';

interface TaskCardProps {
  task: Task;
}

const PRIORITY_BORDER: Record<Priority, string> = {
  low: 'border-l-slate-300 dark:border-l-slate-600',
  medium: 'border-l-blue-400',
  high: 'border-l-amber-400',
  urgent: 'border-l-orange-500',
  critical: 'border-l-rose-500',
};

const PRIORITY_DOT: Record<Priority, string> = {
  low: 'bg-slate-300 dark:bg-slate-600',
  medium: 'bg-blue-400',
  high: 'bg-amber-400',
  urgent: 'bg-orange-500',
  critical: 'bg-rose-500',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
  critical: '关键',
};

const ENERGY_LABEL: Record<string, string> = {
  low: '🔋 低',
  medium: '🔋 中',
  high: '🔋 高',
};

const CONTEXT_LABEL: Record<string, string> = {
  '@home': '@家',
  '@office': '@办公',
  '@phone': '@电话',
  '@computer': '@电脑',
  '@errands': '@外出',
  '@anywhere': '@任意',
};

function formatDate(d: Date): string {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '明天';
  if (diffDays === -1) return '昨天';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} 天后`;
  if (diffDays < 0) return `逾期 ${-diffDays} 天`;
  return d.toLocaleDateString();
}

function isOverdue(d: Date | null): boolean {
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(d) < today;
}

export function TaskCard({ task }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { update, delete: deleteTask } = useTaskStore();
  const projects = useAppStore((s) => s.projects);
  const tags = useAppStore((s) => s.tags);
  const updateSubtask = useAppStore((s) => s.updateSubtask);

  if (isEditing) {
    return <TaskEditor editingTask={task} onDone={() => setIsEditing(false)} />;
  }

  const completed = task.status === 'completed';
  const overdue = !completed && isOverdue(task.dueDate);
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const taskTags = task.tags
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);
  const subtaskCount = task.subtasks.length;
  const subtaskDone = task.subtasks.filter((s) => s.completed).length;
  const hasChildren = subtaskCount > 0;

  const handleSubtaskToggle = (subtaskId: string, currentCompleted: boolean) => {
    updateSubtask(task.id, subtaskId, { completed: !currentCompleted });
  };

  return (
    <div
      className={`rounded-lg border border-l-4 border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800 sm:p-4 ${PRIORITY_BORDER[task.priority]}`}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={completed}
          onChange={(e) => {
            const c = e.target.checked;
            update(task.id, {
              status: c ? 'completed' : 'todo',
              completed: c,
              completedAt: c ? new Date() : null,
            });
          }}
          className="h-5 w-5 shrink-0 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
          aria-label={`标记任务 ${task.title} 完成`}
        />

        <div
          className="min-w-0 flex-1 cursor-pointer"
          onClick={() => hasChildren && setExpanded((e) => !e)}
          role={hasChildren ? 'button' : undefined}
          tabIndex={hasChildren ? 0 : undefined}
          onKeyDown={(e) => {
            if (hasChildren && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              setExpanded((x) => !x);
            }
          }}
        >
          <div className="flex items-center gap-2">
            {hasChildren && (
              <span
                className={`text-xs text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
                aria-hidden
              >
                ▶
              </span>
            )}
            <p
              className={`font-medium ${
                completed ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'
              }`}
            >
              {task.title}
            </p>
            {task.isStarred && <span className="text-amber-400" aria-label="星标">★</span>}
            {task.isRecurring && (
              <span className="text-xs text-slate-400" aria-label="重复任务" title={task.recurrence ? describeRecurrence(task.recurrence) : '重复'}>
                ↻
              </span>
            )}
            {task.reminderDate && <span className="text-xs text-slate-400" aria-label="已设提醒">🔔</span>}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className={`inline-flex items-center gap-1 ${PRIORITY_DOT[task.priority]} rounded-full px-1.5`}>
              <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`} />
              <span className="text-slate-600 dark:text-slate-300">{PRIORITY_LABEL[task.priority]}</span>
            </span>
            {task.dueDate && (
              <span className={overdue ? 'font-medium text-danger' : ''}>
                {overdue ? '⚠ ' : '📅 '}{formatDate(new Date(task.dueDate))}
              </span>
            )}
            {project && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
                {project.name}
              </span>
            )}
            {task.estimatedTime != null && task.estimatedTime > 0 && (
              <span>⏱ {task.estimatedTime} 分</span>
            )}
            {task.energyLevel && <span>{ENERGY_LABEL[task.energyLevel]}</span>}
            {task.context && <span>{CONTEXT_LABEL[task.context]}</span>}
            {taskTags.length > 0 && (
              <span className="text-slate-400">#{taskTags.map((t) => t.name).join(' #')}</span>
            )}
            {hasChildren && (
              <span className="text-slate-400">
                {expanded ? '' : `▾ ${subtaskDone}/${subtaskCount} 子任务`}
              </span>
            )}
          </div>

          {/* 进度条 */}
          {task.progress > 0 && task.progress < 100 && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${task.progress}%` }}
                role="progressbar"
                aria-valuenow={task.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          )}
        </div>

        <button
          onClick={() => setIsEditing(true)}
          className="shrink-0 px-2 py-1 text-sm text-slate-400 hover:text-primary dark:text-slate-500 dark:hover:text-primary sm:px-0 sm:py-0"
          aria-label="编辑任务"
        >
          编辑
        </button>
        <button
          onClick={() => deleteTask(task.id)}
          className="shrink-0 px-2 py-1 text-sm text-slate-400 hover:text-danger dark:text-slate-500 dark:hover:text-danger sm:px-0 sm:py-0"
          aria-label="删除任务"
        >
          删除
        </button>
      </div>

      {/* 子任务展开区(1.3) */}
      {expanded && hasChildren && (
        <ul className="mt-2 space-y-1 border-t border-slate-100 pl-8 pt-2 dark:border-slate-700">
          {task.subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.completed}
                onChange={() => handleSubtaskToggle(s.id, s.completed)}
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
                aria-label={`子任务 ${s.title}`}
              />
              <span
                className={`text-sm ${
                  s.completed ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                {s.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
