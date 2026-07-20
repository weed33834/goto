import { useState } from 'react';
import { useTaskStore } from '../../store/taskStore';
import type { Task } from '../../../shared/types';
import { TaskEditor } from './TaskEditor';

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { update, delete: deleteTask } = useTaskStore();

  // 编辑模式：inline 渲染 TaskEditor 并预填当前任务数据
  if (isEditing) {
    return <TaskEditor editingTask={task} onDone={() => setIsEditing(false)} />;
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-4">
      <input
        type="checkbox"
        checked={task.status === 'completed'}
        onChange={(e) => {
          // 与移动端 tasksSlice.toggleTaskComplete 联动逻辑对齐：
          // status / completed / completedAt 三字段必须同时刷新，
          // 否则后端与本地会出现 completed=true 但 status=todo 之类的不一致。
          const completed = e.target.checked;
          update(task.id, {
            status: completed ? 'completed' : 'todo',
            completed,
            completedAt: completed ? new Date() : null,
          });
        }}
        className="h-5 w-5 shrink-0 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
      />
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${task.status === 'completed' ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
          {task.title}
        </p>
        {task.dueDate && <p className="text-xs text-slate-500 dark:text-slate-400">{task.dueDate.toLocaleDateString()}</p>}
      </div>
      <button
        onClick={() => setIsEditing(true)}
        className="shrink-0 px-2 py-1 text-sm text-slate-400 hover:text-primary dark:text-slate-500 dark:hover:text-primary sm:px-0 sm:py-0"
      >
        编辑
      </button>
      <button onClick={() => deleteTask(task.id)} className="shrink-0 px-2 py-1 text-sm text-slate-400 hover:text-danger dark:text-slate-500 dark:hover:text-danger sm:px-0 sm:py-0">
        删除
      </button>
    </div>
  );
}
