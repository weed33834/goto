// KanbanPage — 看板视图(Phase 2.1)
//
// 把所有未归档任务按 status 分到 5 个常用列(待办 / 进行中 / 等待 / 已委派 / 已完成)。
// 跨列拖拽 = 改 status;列内拖拽 = 改 order(走 reorderTasks)。
// 列高自适应,移动端横向滚动,桌面端 5 列网格。
//
// 设计取舍:不放 cancelled / on-hold 列(用得少),用户可在 TaskEditor 改这两种状态。
// 拖拽用 @dnd-kit/core 的 DndContext + useDroppable + useDraggable,避免 SortableContext 在
// 多容器场景的复杂配置。

import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '../../shared/store';
import { useTaskStore } from '../store/taskStore';
import { TaskCard } from '../components/task/TaskCard';
import type { Task, TaskStatus } from '../../shared/types';

interface Column {
  id: TaskStatus;
  label: string;
  accent: string;
}

const COLUMNS: Column[] = [
  { id: 'todo', label: '待办', accent: 'border-t-slate-400' },
  { id: 'in-progress', label: '进行中', accent: 'border-t-blue-500' },
  { id: 'waiting', label: '等待', accent: 'border-t-amber-500' },
  { id: 'delegated', label: '已委派', accent: 'border-t-purple-500' },
  { id: 'completed', label: '已完成', accent: 'border-t-emerald-500' },
];

function DraggableTask({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
    >
      <TaskCard task={task} />
    </div>
  );
}

function Column({
  column,
  tasks,
}: {
  column: Column;
  tasks: Task[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-lg border border-t-4 bg-slate-50 dark:bg-slate-900/50 ${column.accent} ${
        isOver ? 'ring-2 ring-primary/40' : ''
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{column.label}</h3>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          {tasks.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {tasks.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-slate-400">拖动任务到此处</p>
        ) : (
          tasks.map((task) => <DraggableTask key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}

export function KanbanPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const update = useTaskStore((s) => s.update);
  const reorderTasks = useAppStore((s) => s.reorderTasks);
  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const projects = useAppStore((s) => s.projects);

  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.isArchived || t.isDeleted) return false;
      if (filterProjectId && filterProjectId !== '__none__' && t.projectId !== filterProjectId) return false;
      if (filterProjectId === '__none__' && t.projectId) return false;
      // cancelled / on-hold 不在看板显示(列里没有它们)
      if (t.status === 'cancelled' || t.status === 'on-hold') return false;
      return true;
    });
  }, [tasks, filterProjectId]);

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      'todo': [],
      'in-progress': [],
      'waiting': [],
      'delegated': [],
      'completed': [],
      'cancelled': [],
      'on-hold': [],
    };
    for (const t of visibleTasks) {
      map[t.status].push(t);
    }
    return map;
  }, [visibleTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const overId = String(over.id);

    // 拖到列上(over.id 是 TaskStatus)
    if (COLUMNS.some((c) => c.id === overId)) {
      const targetStatus = overId as TaskStatus;
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.status === targetStatus) return;
      const completed = targetStatus === 'completed';
      update(taskId, {
        status: targetStatus,
        completed,
        completedAt: completed ? new Date() : null,
      });
      return;
    }

    // 拖到另一个任务上 — 跨列移动 + 列内重排
    const overTask = tasks.find((t) => t.id === overId);
    const task = tasks.find((t) => t.id === taskId);
    if (!overTask || !task) return;

    if (task.status !== overTask.status) {
      // 跨列:把 task 移到 overTask 所在列
      const targetStatus = overTask.status;
      const completed = targetStatus === 'completed';
      update(taskId, {
        status: targetStatus,
        completed,
        completedAt: completed ? new Date() : null,
      });
    } else {
      // 同列重排:在 visibleTasks 中调整顺序后调 reorderTasks
      const column = grouped[task.status];
      const oldIdx = column.findIndex((t) => t.id === taskId);
      const newIdx = column.findIndex((t) => t.id === overId);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
      const reordered = [...column];
      const [moved] = reordered.splice(oldIdx, 1);
      reordered.splice(newIdx, 0, moved);
      reorderTasks(reordered);
    }
  };

  const selectClass =
    'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">看板</h1>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          项目筛选
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className={selectClass}
          >
            <option value="">全部</option>
            <option value="__none__">无项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
          {COLUMNS.map((col) => (
            <Column key={col.id} column={col} tasks={grouped[col.id]} />
          ))}
        </div>
      </DndContext>

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        提示:拖动卡片到其他列即可改变任务状态;同列内拖动可调整顺序。
      </p>
    </div>
  );
}
