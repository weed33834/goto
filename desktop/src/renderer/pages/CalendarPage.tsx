import { useEffect, useMemo, useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  startOfDay,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useTaskStore } from '../store/taskStore';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { TaskCard } from '../components/task/TaskCard';
import type { Task } from '../../shared/types';

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

type ViewType = 'month' | 'week' | 'blocks';

// 时间块视图覆盖的时段：7:00 - 22:00
const BLOCK_START_HOUR = 7;
const BLOCK_END_HOUR = 22;
const blockHours = Array.from(
  { length: BLOCK_END_HOUR - BLOCK_START_HOUR + 1 },
  (_, i) => i + BLOCK_START_HOUR,
);

const viewTabs: { id: ViewType; label: string }[] = [
  { id: 'month', label: '月' },
  { id: 'week', label: '周' },
  { id: 'blocks', label: '时间块' },
];

// dueDate 是 Date 对象;小时/分钟/秒全为 0 视为全天任务
function getTaskHour(dueDate?: Date | null): number | null {
  if (!dueDate) return null;
  if (dueDate.getHours() === 0 && dueDate.getMinutes() === 0 && dueDate.getSeconds() === 0) return null;
  return dueDate.getHours();
}

export function CalendarPage() {
  const [view, setView] = useState<ViewType>('month');
  // cursor 在不同视图下分别锚定：月/周/日
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  // 时间块视图下点击具体时段时记录小时，新建任务时带上时间
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const { tasks, loading, fetch, create } = useTaskStore();

  useEffect(() => {
    fetch();
  }, [fetch]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const weekDaysList = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 0 });
    const end = endOfWeek(cursor, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const key = format(task.dueDate, 'yyyy-MM-dd');
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return map;
  }, [tasks]);

  const selectedTasks = useMemo(() => {
    if (!selectedDate) return [];
    const key = format(selectedDate, 'yyyy-MM-dd');
    return tasksByDate.get(key) ?? [];
  }, [selectedDate, tasksByDate]);

  // 时间块视图：当天按小时分桶，无具体时间的任务归入全天区域
  const blocksByHour = useMemo(() => {
    const map = new Map<number, Task[]>();
    const allDay: Task[] = [];
    if (!selectedDate) return { map, allDay };
    const key = format(selectedDate, 'yyyy-MM-dd');
    for (const task of tasksByDate.get(key) ?? []) {
      const hour = getTaskHour(task.dueDate);
      if (hour === null || hour < BLOCK_START_HOUR || hour > BLOCK_END_HOUR) {
        allDay.push(task);
      } else {
        const list = map.get(hour) ?? [];
        list.push(task);
        map.set(hour, list);
      }
    }
    return { map, allDay };
  }, [selectedDate, tasksByDate]);

  const headerLabel = useMemo(() => {
    if (view === 'month') return format(cursor, 'yyyy年 M月', { locale: zhCN });
    if (view === 'week') {
      const start = startOfWeek(cursor, { weekStartsOn: 0 });
      const end = endOfWeek(cursor, { weekStartsOn: 0 });
      return `${format(start, 'yyyy年M月d日', { locale: zhCN })} - ${format(end, 'M月d日', { locale: zhCN })}`;
    }
    return format(cursor, 'yyyy年M月d日', { locale: zhCN });
  }, [view, cursor]);

  const prevLabel = view === 'month' ? '上月' : view === 'week' ? '上周' : '前一天';
  const nextLabel = view === 'month' ? '下月' : view === 'week' ? '下周' : '后一天';

  const handlePrev = () => {
    if (view === 'month') setCursor(subMonths(cursor, 1));
    else if (view === 'week') setCursor(subWeeks(cursor, 1));
    else setCursor(subDays(cursor, 1));
  };

  const handleNext = () => {
    if (view === 'month') setCursor(addMonths(cursor, 1));
    else if (view === 'week') setCursor(addWeeks(cursor, 1));
    else setCursor(addDays(cursor, 1));
  };

  const openDayModal = (date: Date, hour: number | null = null) => {
    setSelectedDate(date);
    setSelectedHour(hour);
  };

  const closeModal = () => {
    setSelectedDate(null);
    setSelectedHour(null);
    setNewTaskTitle('');
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !selectedDate) return;
    // 选中具体时段时带上时间，便于任务在时间块视图中落在对应位置
    // 全天任务用 startOfDay(00:00:00),getTaskHour 据此判定为全天
    let dueDate: Date;
    if (selectedHour !== null) {
      const dt = startOfDay(selectedDate);
      dt.setHours(selectedHour, 0, 0, 0);
      dueDate = dt;
    } else {
      dueDate = startOfDay(selectedDate);
    }
    await create({
      title: newTaskTitle.trim(),
      priority: 'medium',
      status: 'todo',
      tags: [],
      dueDate,
    });
    setNewTaskTitle('');
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:mb-6 sm:flex-nowrap">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">日历</h1>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          {viewTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === tab.id
                  ? 'bg-primary text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4 sm:flex-nowrap">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 sm:text-lg">{headerLabel}</h2>
          <div className="flex flex-wrap gap-1 sm:flex-nowrap sm:gap-2">
            <Button variant="secondary" size="sm" onClick={handlePrev}>
              {prevLabel}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCursor(new Date())}>
              今天
            </Button>
            <Button variant="secondary" size="sm" onClick={handleNext}>
              {nextLabel}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="py-8 text-center text-slate-500 dark:text-slate-400">加载中...</p>
        ) : view === 'month' ? (
          <>
            <div className="grid grid-cols-7 gap-1 border-b border-slate-200 pb-2 text-center text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400 sm:text-sm">
              {weekDays.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 pt-2">
              {monthDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayTasks = tasksByDate.get(key) ?? [];
                const isCurrentMonth = isSameMonth(day, cursor);
                const isToday = isSameDay(day, new Date());

                return (
                  <button
                    key={key}
                    data-testid="day-cell"
                    onClick={() => openDayModal(day)}
                    className={`flex min-h-[3rem] flex-col items-start rounded-lg border p-1 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 sm:min-h-[5rem] sm:p-2 ${
                      isCurrentMonth
                        ? 'border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800'
                        : 'border-transparent bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500'
                    } ${isToday ? 'ring-2 ring-primary/50' : ''}`}
                  >
                    <span
                      className={`text-xs font-medium sm:text-sm ${
                        isCurrentMonth ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayTasks.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {dayTasks.slice(0, 3).map((task) => (
                          <span
                            key={task.id}
                            className={`block h-1.5 w-1.5 rounded-full ${
                              task.status === 'completed' ? 'bg-green-500' : 'bg-primary'
                            }`}
                          />
                        ))}
                        {dayTasks.length > 3 && (
                          <span className="text-xs text-slate-400 dark:text-slate-500">+{dayTasks.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : view === 'week' ? (
          <>
            <div className="grid grid-cols-7 gap-1 border-b border-slate-200 pb-2 text-center text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400 sm:gap-2 sm:text-sm">
              {weekDays.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 pt-2 sm:gap-2">
              {weekDaysList.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayTasks = tasksByDate.get(key) ?? [];
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={key}
                    className={`flex min-h-[8rem] flex-col rounded-lg border p-1.5 sm:min-h-[14rem] sm:p-2 ${
                      isToday
                        ? 'border-primary/50 bg-primary/5 dark:bg-primary/10'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`text-xs font-medium sm:text-sm ${
                          isToday ? 'text-primary' : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                      <button
                        onClick={() => openDayModal(day)}
                        title="添加任务"
                        aria-label={`为 ${format(day, 'yyyy-MM-dd')} 添加任务`}
                        className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-primary dark:text-slate-500 dark:hover:bg-slate-700 sm:h-5 sm:w-5"
                      >
                        +
                      </button>
                    </div>
                    <div className="flex-1 space-y-1 overflow-y-auto sm:space-y-2">
                      {dayTasks.map((task) => (
                        <TaskCard key={task.id} task={task} />
                      ))}
                      {dayTasks.length === 0 && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">无任务</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">全天任务</p>
              {blocksByHour.allDay.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">无全天任务</p>
              ) : (
                <div className="space-y-2">
                  {blocksByHour.allDay.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              {blockHours.map((hour) => {
                const hourTasks = blocksByHour.map.get(hour) ?? [];
                return (
                  <div
                    key={hour}
                    className="flex border-b border-slate-100 last:border-b-0 dark:border-slate-700/60"
                  >
                    <div className="w-14 shrink-0 border-r border-slate-100 px-2 py-2 text-xs text-slate-500 dark:border-slate-700/60 dark:text-slate-400 sm:w-16">
                      {String(hour).padStart(2, '0')}:00
                    </div>
                    <button
                      onClick={() => openDayModal(cursor, hour)}
                      className="min-h-[2.5rem] flex-1 px-2 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40"
                    >
                      {hourTasks.length === 0 ? (
                        <span className="text-xs text-slate-300 dark:text-slate-600">点击添加</span>
                      ) : (
                        <div className="space-y-1">
                          {hourTasks.map((task) => (
                            <TaskCard key={task.id} task={task} />
                          ))}
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Modal
        isOpen={selectedDate !== null}
        onClose={closeModal}
        title={
          selectedDate
            ? selectedHour !== null
              ? `${format(selectedDate, 'yyyy年M月d日', { locale: zhCN })} ${String(selectedHour).padStart(2, '0')}:00`
              : format(selectedDate, 'yyyy年M月d日', { locale: zhCN })
            : ''
        }
      >
        <div className="space-y-4">
          {selectedTasks.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">当天没有任务</p>
          ) : (
            <div className="space-y-2">
              {selectedTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
          <form onSubmit={handleAddTask} className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="添加当天任务..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="flex-1"
              autoFocus
            />
            <Button type="submit" size="sm" className="shrink-0">
              添加
            </Button>
          </form>
        </div>
      </Modal>
    </div>
  );
}
