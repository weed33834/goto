import { useState } from 'react';
import { useAppStore } from '@shared/store';
import TaskRow from './TaskRow';
import Fab from './Fab';
import TaskSheet from './TaskSheet';
import { isTodayTask } from '../lib/taskInput';
import type { Task } from '@shared/types';

interface Props {
  filterToday?: boolean;
}

// 任务列表视图:单列触摸列表 + FAB 新建。今日视图复用本组件并加过滤。
export default function TasksView({ filterToday = false }: Props) {
  const tasks = useAppStore((s) => s.tasks);
  const toggleTaskComplete = useAppStore((s) => s.toggleTaskComplete);
  const deleteTask = useAppStore((s) => s.deleteTask);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const visible = filterToday ? tasks.filter((t) => isTodayTask(t)) : tasks;

  const openNew = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (task: Task) => {
    setEditing(task);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl-2 font-bold">{filterToday ? '今日' : '任务'}</h1>
        <span className="text-xs-2 text-paper/50">{visible.length} 项</span>
      </header>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm-2 text-paper/40">暂无任务,点右下角 + 新建</p>
      ) : (
        <ul className="space-y-2" data-testid="task-list">
          {visible.map((t) => (
            <li key={t.id}>
              <TaskRow task={t} onToggle={toggleTaskComplete} onDelete={deleteTask} onOpen={openEdit} />
            </li>
          ))}
        </ul>
      )}

      <Fab onClick={openNew} />
      <TaskSheet open={sheetOpen} onClose={() => setSheetOpen(false)} editing={editing} />
    </div>
  );
}
