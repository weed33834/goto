import { useAppStore } from '@shared/store';
import TaskRow from './TaskRow';
import { statusMeta } from '../lib/taskInput';
import type { Task, TaskStatus } from '@shared/types';

// 移动端简化看板:按状态分列、横向滑动切换(替代桌面端拖拽 Gantt/多栏)。
const columns: TaskStatus[] = ['todo', 'in-progress', 'waiting', 'completed'];

export default function BoardView() {
  const tasks = useAppStore((s) => s.tasks);
  const toggleTaskComplete = useAppStore((s) => s.toggleTaskComplete);
  const deleteTask = useAppStore((s) => s.deleteTask);

  return (
    <div className="space-y-3">
      <h1 className="text-2xl-2 font-bold">看板</h1>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2">
        {columns.map((status) => {
          const items = tasks.filter((t: Task) => t.status === status);
          return (
            <section
              key={status}
              className="w-64 shrink-0 snap-start rounded-xl border border-paper/10 bg-paper/5 p-3"
            >
              <header className="mb-2 flex items-center justify-between">
                <h2 className="text-sm-2 font-semibold">{statusMeta[status].label}</h2>
                <span className="text-xs-2 text-paper/40">{items.length}</span>
              </header>
              <ul className="space-y-2">
                {items.map((t: Task) => (
                  <li key={t.id}>
                    <TaskRow task={t} onToggle={toggleTaskComplete} onDelete={deleteTask} />
                  </li>
                ))}
                {items.length === 0 && <li className="text-xs-2 text-paper/30">空</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
