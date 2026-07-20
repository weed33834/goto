import { useEffect, useMemo } from 'react';
import { useTaskStore } from '../../store/taskStore';
import { TaskCard } from './TaskCard';
import { TaskEditor } from './TaskEditor';
import { EmptyState } from '../common/EmptyState';

export type TaskFilter = 'today' | 'overdue' | 'upcoming' | 'all';

interface TaskListProps {
  filter?: TaskFilter;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function TaskList({ filter = 'all' }: TaskListProps) {
  const { tasks, loading, fetch } = useTaskStore();

  useEffect(() => {
    fetch();
  }, [fetch]);

  // P1-4:按 filter 派生任务子集(today/overdue/upcoming/all)
  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasks;
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    return tasks.filter((t) => {
      // 已完成的不进任何过滤视图(除非 all)
      if (t.completed) return false;
      const due = t.dueDate ? new Date(t.dueDate) : null;
      if (filter === 'today') {
        // 今日:dueDate 在今天,或无 dueDate 但 createdAt 在今天(刚创建的临时任务)
        if (due && due >= todayStart && due < todayEnd) return true;
        if (!due && t.createdAt && isSameDay(new Date(t.createdAt), now)) return true;
        return false;
      }
      if (filter === 'overdue') {
        return due !== null && due < todayStart;
      }
      if (filter === 'upcoming') {
        return due !== null && due >= todayEnd;
      }
      return true;
    });
  }, [tasks, filter]);

  const emptyConfig = (() => {
    switch (filter) {
      case 'today':
        return { icon: '✓', title: '今天没有任务', hint: '享受片刻空闲,或在上方添加一个新任务。' };
      case 'overdue':
        return { icon: '⏰', title: '没有逾期任务', hint: '所有任务都按计划进行,继续保持。' };
      case 'upcoming':
        return { icon: '📅', title: '没有即将到期的任务', hint: '给未来的自己安排点什么?在上方添加带截止日期的任务。' };
      default:
        return { icon: '✓', title: '暂无任务', hint: '在上方添加你的第一个任务。' };
    }
  })();

  return (
    <div>
      <TaskEditor />
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">加载中...</p>
      ) : filteredTasks.length === 0 ? (
        <EmptyState icon={emptyConfig.icon} title={emptyConfig.title} hint={emptyConfig.hint} />
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
