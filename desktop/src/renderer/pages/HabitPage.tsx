// HabitPage — 习惯追踪页(s3)
//
// 布局:
// - 顶部:标题 + 描述 + "新建习惯"按钮(展开内联表单)
// - 列表:每个 habit 一张卡片,展示名称 + 今日打卡快捷点 + HabitHeatmap
// - 卡片右侧操作:重命名(inline)/ 归档 / 删除
// - 已归档习惯单独折叠展示,避免污染主列表
//
// 设计取舍:
// - 不引入 Modal 编辑器:习惯字段少(name + cadence + description),
//   inline 编辑减少跳转。后续字段扩展再考虑 Modal。
// - 删除用 window.confirm:简单足够,且 habitsSlice 已接入 undo 栈,
//   误删可通过 Toaster 撤销。二次确认 + undo 双保险。
// - 今日打卡快捷点:大圆点按钮,点击切换今日打卡状态,
//   与热力图最后一格联动(同一 toggleHabitEntry 调用)。
import { useMemo, useState } from 'react';
import { useAppStore } from '../../shared/store';
import type { Habit } from '../../shared/types';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { EmptyState } from '../components/common/EmptyState';
import { HabitHeatmap } from '../components/habits/HabitHeatmap';

/** 把 Date 转成 'YYYY-MM-DD'(本地时区,与 habitsSlice.toggleHabitEntry 对齐)。 */
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface NewHabitFormProps {
  onSubmit: (input: { name: string; description?: string; cadence: 'daily' | 'weekly' }) => void;
  onCancel: () => void;
}

function NewHabitForm({ onSubmit, onCancel }: NewHabitFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, description: description.trim() || undefined, cadence });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
      aria-label="新建习惯"
    >
      <div className="space-y-3">
        <Input
          label="习惯名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如:每日阅读 30 分钟"
          autoFocus
          required
        />
        <Input
          label="描述(可选)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="给自己一句备注"
        />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">频率</span>
          <div className="flex gap-2">
            {(['daily', 'weekly'] as const).map((c) => (
              <label
                key={c}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  cadence === c
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="cadence"
                  checked={cadence === c}
                  onChange={() => setCadence(c)}
                  className="sr-only"
                />
                {c === 'daily' ? '每日' : '每周'}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>取消</Button>
          <Button type="submit" disabled={!name.trim()}>创建</Button>
        </div>
      </div>
    </form>
  );
}

interface HabitCardProps {
  habit: Habit;
  onToggleEntry: (habitId: string, dateStr: string) => void;
  onRename: (id: string, name: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
}

function HabitCard({ habit, onToggleEntry, onRename, onArchive, onDelete }: HabitCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(habit.name);
  const today = todayStr();
  const doneToday = habit.completedDates.includes(today);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== habit.name) {
      onRename(habit.id, trimmed);
    } else {
      setDraftName(habit.name);
    }
    setEditing(false);
  };

  const handleDelete = () => {
    // 二次确认:习惯历史记录删除后只能靠 undo 恢复,确认一下避免误触
    if (window.confirm(`确定删除习惯"${habit.name}"?历史打卡记录将一并清除(可通过撤销恢复)`)) {
      onDelete(habit.id);
    }
  };

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
      data-testid={`habit-card-${habit.id}`}
    >
      <div className="flex items-start gap-3">
        {/* 色标 */}
        <span
          className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: habit.color }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                else if (e.key === 'Escape') {
                  setDraftName(habit.name);
                  setEditing(false);
                }
              }}
              autoFocus
              aria-label="编辑习惯名称"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="block max-w-full truncate text-left text-sm font-medium text-slate-800 hover:text-primary dark:text-slate-100"
              title="点击重命名"
            >
              {habit.name}
              {habit.archived && (
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  已归档
                </span>
              )}
            </button>
          )}
          {habit.description && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{habit.description}</p>
          )}
        </div>

        {/* 今日打卡快捷点 */}
        <button
          type="button"
          onClick={() => onToggleEntry(habit.id, today)}
          aria-pressed={doneToday}
          aria-label={doneToday ? '取消今日打卡' : '完成今日打卡'}
          title={doneToday ? '今日已打卡,点击取消' : '完成今日打卡'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors"
          style={
            doneToday
              ? { backgroundColor: habit.color, borderColor: habit.color }
              : undefined
          }
        >
          <span
            className={`text-base ${doneToday ? 'text-white' : 'text-slate-300 dark:text-slate-600'}`}
          >
            ✓
          </span>
        </button>
      </div>

      <div className="mt-3">
        <HabitHeatmap
          completedDates={habit.completedDates}
          color={habit.color}
          cadence={habit.cadence}
          onToggle={(dateStr) => onToggleEntry(habit.id, dateStr)}
        />
      </div>

      <div className="mt-3 flex justify-end gap-2 text-xs">
        <Button size="sm" variant="ghost" onClick={() => onArchive(habit.id, !habit.archived)}>
          {habit.archived ? '取消归档' : '归档'}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDelete} className="text-danger hover:bg-danger/10">
          删除
        </Button>
      </div>
    </div>
  );
}

export function HabitPage() {
  const habits = useAppStore((s) => s.habits);
  const addHabit = useAppStore((s) => s.addHabit);
  const updateHabit = useAppStore((s) => s.updateHabit);
  const deleteHabit = useAppStore((s) => s.deleteHabit);
  const toggleHabitEntry = useAppStore((s) => s.toggleHabitEntry);

  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const activeHabits = useMemo(() => habits.filter((h) => !h.archived), [habits]);
  const archivedHabits = useMemo(() => habits.filter((h) => h.archived), [habits]);

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-3 sm:text-2xl">
        习惯追踪
      </h1>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400 sm:mb-6 sm:text-sm">
        把"想坚持的事"变成可见的砖块。每日打卡会累积成热力图,长期下来能稳定身份认同 ——
        你不是在"完成任务",而是在"成为那样的人"。
      </p>

      <div className="mb-4 flex justify-end">
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? '收起' : '新建习惯'}
        </Button>
      </div>

      {showForm && (
        <NewHabitForm
          onSubmit={(input) => {
            addHabit(input);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {activeHabits.length === 0 && archivedHabits.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="还没有习惯"
          hint={'点击右上角「新建习惯」,从一件小事开始 —— 例如「每日阅读 10 分钟」。'}
        />
      ) : (
        <div className="space-y-3">
          {activeHabits.map((h) => (
            <HabitCard
              key={h.id}
              habit={h}
              onToggleEntry={toggleHabitEntry}
              onRename={(id, name) => updateHabit(id, { name })}
              onArchive={(id, archived) => updateHabit(id, { archived })}
              onDelete={deleteHabit}
            />
          ))}

          {archivedHabits.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                aria-expanded={showArchived}
              >
                {showArchived ? '▼' : '▶'} 已归档习惯({archivedHabits.length})
              </button>
              {showArchived && (
                <div className="mt-2 space-y-3">
                  {archivedHabits.map((h) => (
                    <HabitCard
                      key={h.id}
                      habit={h}
                      onToggleEntry={toggleHabitEntry}
                      onRename={(id, name) => updateHabit(id, { name })}
                      onArchive={(id, archived) => updateHabit(id, { archived })}
                      onDelete={deleteHabit}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
