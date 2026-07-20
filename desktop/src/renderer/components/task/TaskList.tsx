// TaskList — 任务列表(含批量操作 + 拖拽排序)
//
// Phase 1.6 批量操作:接入 useBulkSelection hook,提供全选 / 完成所选 / 删除所选 / 改优先级 / 移到项目
// Phase 1.7 拖拽排序:用 @dnd-kit/sortable 让 TaskCard 可上下拖动;拖完调 reorderTasks 落 store
//
// 字段过滤(today/overdue/upcoming/all)逻辑保留;批量模式与拖拽互斥(批量开启时禁用拖拽)。

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTaskStore } from '../../store/taskStore';
import { useAppStore } from '../../../shared/store';
import { useBulkSelection } from '../../../shared/hooks/useBulkSelection';
import { useVimShortcuts } from '../../../shared/hooks/useVimShortcuts';
import { TaskCard } from './TaskCard';
import { TaskEditor } from './TaskEditor';
import { EmptyState } from '../common/EmptyState';
import { Button } from '../common/Button';
import type { Task, Priority } from '../../../shared/types';

export type TaskFilter = 'today' | 'overdue' | 'upcoming' | 'all';

interface TaskListProps {
  filter?: TaskFilter;
  /** 可选:外部指定任务列表(项目详情页 / 看板等传入),不传则从 store 取全部。 */
  tasksOverride?: Task[];
  /** 是否禁用拖拽(默认 false;在批量模式开启时自动禁用)。 */
  disableDrag?: boolean;
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

/** Sortable 包装:把 TaskCard 包成可拖拽项,批量模式下显示选择框。 */
function SortableTaskCard({
  task,
  bulkActive,
  isSelected,
  isVimSelected,
  onToggleSelect,
  editingId,
  onEdit,
}: {
  task: Task;
  bulkActive: boolean;
  isSelected: boolean;
  isVimSelected: boolean;
  onToggleSelect: (id: string) => void;
  editingId: string | null;
  onEdit: (id: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: bulkActive,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // 编辑模式直接渲染 TaskEditor(覆盖原卡片)
  if (editingId === task.id) {
    return (
      <div ref={setNodeRef} style={style}>
        <TaskEditor editingTask={task} onDone={() => onEdit(null)} />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 rounded-lg ${isVimSelected ? 'ring-2 ring-primary/50' : ''}`}
    >
      {bulkActive && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(task.id)}
          className="mt-3 h-5 w-5 shrink-0 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
          aria-label={`选择任务 ${task.title}`}
        />
      )}
      <div
        {...attributes}
        {...listeners}
        className={`${bulkActive ? '' : 'cursor-grab active:cursor-grabbing'} flex-1`}
      >
        <TaskCard task={task} />
      </div>
    </div>
  );
}

export function TaskList({ filter = 'all', tasksOverride, disableDrag = false }: TaskListProps) {
  const storeTasks = useTaskStore((s) => s.tasks);
  const tasks = tasksOverride ?? storeTasks;
  const loading = useTaskStore((s) => s.loading);
  const fetch = useTaskStore((s) => s.fetch);
  const { update, delete: deleteTask } = useTaskStore();
  const reorderTasks = useAppStore((s) => s.reorderTasks);
  const projects = useAppStore((s) => s.projects);
  const bulk = useBulkSelection<Task>(tasks);
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);

  const [bulkProjectId, setBulkProjectId] = useState<string>('');
  const [bulkPriority, setBulkPriority] = useState<Priority | ''>('');

  useEffect(() => {
    fetch();
  }, [fetch]);

  const filteredTasks = useMemo(() => {
    if (filter === 'all' && !tasksOverride) return tasks;
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    return tasks.filter((t) => {
      if (t.completed) return false;
      const due = t.dueDate ? new Date(t.dueDate) : null;
      if (filter === 'today') {
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
  }, [tasks, filter, tasksOverride]);

  // 拖拽 sensor — PointerSensor 距离阈值 8px,避免误触点击
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = filteredTasks.findIndex((t) => t.id === active.id);
    const newIndex = filteredTasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(filteredTasks, oldIndex, newIndex);
    reorderTasks(reordered);
  };

  // Phase 1.9:vim 风格键盘导航(j/k/e/d/x/gg/G/)
  const vim = useVimShortcuts(filteredTasks, {
    editTask: (id) => setEditingId(id),
    toggleComplete: (id) => {
      const t = filteredTasks.find((x) => x.id === id);
      if (!t) return;
      const c = !t.completed;
      update(id, {
        completed: c,
        completedAt: c ? new Date() : null,
        status: c ? 'completed' : 'todo',
      });
    },
    deleteTask: (id) => deleteTask(id),
    goSearch: () => navigate('/search'),
  });

  // ─── 批量操作 ────────────────────────────────────────────────────
  const handleBulkComplete = (completed: boolean) => {
    for (const t of bulk.selectedItems) {
      update(t.id, {
        completed,
        completedAt: completed ? new Date() : null,
        status: completed ? 'completed' : 'todo',
      });
    }
    bulk.exit();
  };

  const handleBulkDelete = () => {
    if (!window.confirm(`确定删除选中的 ${bulk.count} 个任务?此操作可撤销。`)) return;
    for (const t of bulk.selectedItems) {
      deleteTask(t.id);
    }
    bulk.exit();
  };

  const handleBulkPriority = () => {
    if (!bulkPriority) return;
    for (const t of bulk.selectedItems) {
      update(t.id, { priority: bulkPriority });
    }
    setBulkPriority('');
    bulk.exit();
  };

  const handleBulkProject = () => {
    if (!bulkProjectId) return;
    const projectId = bulkProjectId === '__none__' ? null : bulkProjectId;
    for (const t of bulk.selectedItems) {
      update(t.id, { projectId });
    }
    setBulkProjectId('');
    bulk.exit();
  };

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

  const selectClass =
    'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

  const showList = filteredTasks.length > 0;
  const dragEnabled = !disableDrag && !bulk.active;

  return (
    <div>
      {!tasksOverride && <TaskEditor />}

      {/* 批量操作工具栏(只在有任务时显示) */}
      {showList && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {!bulk.active ? (
            <Button variant="ghost" size="sm" onClick={bulk.enter}>
              批量操作
            </Button>
          ) : (
            <>
              <span className="text-slate-600 dark:text-slate-300">
                已选 {bulk.count} / {filteredTasks.length}
              </span>
              <Button variant="ghost" size="sm" onClick={bulk.selectAll}>全选</Button>
              <Button variant="ghost" size="sm" onClick={bulk.clear}>清空</Button>
              <Button variant="secondary" size="sm" onClick={() => handleBulkComplete(true)}>
                标记完成
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleBulkComplete(false)}>
                取消完成
              </Button>
              <select
                value={bulkPriority}
                onChange={(e) => setBulkPriority(e.target.value as Priority | '')}
                className={selectClass}
                aria-label="批量设置优先级"
              >
                <option value="">改优先级…</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="urgent">紧急</option>
                <option value="critical">关键</option>
              </select>
              <Button variant="secondary" size="sm" onClick={handleBulkPriority} disabled={!bulkPriority}>
                应用
              </Button>
              <select
                value={bulkProjectId}
                onChange={(e) => setBulkProjectId(e.target.value)}
                className={selectClass}
                aria-label="批量移动到项目"
              >
                <option value="">移到项目…</option>
                <option value="__none__">无项目</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={handleBulkProject} disabled={!bulkProjectId}>
                应用
              </Button>
              <Button variant="danger" size="sm" onClick={handleBulkDelete} disabled={bulk.count === 0}>
                删除所选
              </Button>
              <Button variant="ghost" size="sm" onClick={bulk.exit}>
                退出
              </Button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">加载中...</p>
      ) : !showList ? (
        <EmptyState icon={emptyConfig.icon} title={emptyConfig.title} hint={emptyConfig.hint} />
      ) : dragEnabled ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredTasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {filteredTasks.map((task) => (
                <SortableTaskCard
                  key={task.id}
                  task={task}
                  bulkActive={bulk.active}
                  isSelected={bulk.isSelected(task.id)}
                  isVimSelected={vim.selectedId === task.id}
                  onToggleSelect={bulk.toggle}
                  editingId={editingId}
                  onEdit={setEditingId}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              bulkActive={bulk.active}
              isSelected={bulk.isSelected(task.id)}
              isVimSelected={vim.selectedId === task.id}
              onToggleSelect={bulk.toggle}
              editingId={editingId}
              onEdit={setEditingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
