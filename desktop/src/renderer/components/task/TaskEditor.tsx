// TaskEditor — 任务新建 / 编辑表单
//
// Phase 1.1 / 1.2 / 1.3 / 1.4 / 1.5 综合落地:
//   1.1 提醒系统 — reminderDate 字段(datetime-local 输入)
//   1.2 重复任务 — recurrence 规则编辑器(type / interval / endType / endDate / endCount)
//   1.3 子任务   — subtasks 列表(添加 / 删除 / 勾选 / 改标题)
//   1.4 全字段   — estimatedTime / isStarred / progress / energyLevel / context
//   1.5 NLP      — title 输入框 onBlur 调 parseNaturalLanguage 自动填字段
//
// 字段按"基本 → 时间 → 组织 → 高级"四段布局,移动端单列 / 桌面端双列网格。

import { useMemo, useState } from 'react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useTaskStore } from '../../store/taskStore';
import { useAppStore } from '../../../shared/store';
import type {
  Task,
  Priority,
  RecurrenceRule,
  RecurrenceType,
  RecurrenceEndType,
  EnergyLevel,
  TaskContext,
  Subtask,
} from '../../../shared/types';
import { parseNaturalLanguage, NL_KEYWORDS_HELP } from '../../../shared/utils/naturalLanguageParser';
import { describeRecurrence } from '../../../shared/utils/recurrenceUtils';

type Status = Task['status'];

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent', 'critical'];
const STATUSES: Status[] = ['todo', 'in-progress', 'waiting', 'delegated', 'completed', 'cancelled', 'on-hold'];

const PRIORITY_LABELS: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
  critical: '关键',
};

const STATUS_LABELS: Record<Status, string> = {
  'todo': '待办',
  'in-progress': '进行中',
  'waiting': '等待',
  'delegated': '已委派',
  'completed': '已完成',
  'cancelled': '已取消',
  'on-hold': '暂停',
};

const ENERGY_LABELS: Record<EnergyLevel, string> = {
  low: '低能量',
  medium: '中能量',
  high: '高能量',
};

const CONTEXT_LABELS: Record<TaskContext, string> = {
  '@home': '@家',
  '@office': '@办公',
  '@phone': '@电话',
  '@computer': '@电脑',
  '@errands': '@外出',
  '@anywhere': '@任意',
};

const RECURRENCE_TYPE_LABELS: Record<RecurrenceType, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

const RECURRENCE_END_LABELS: Record<RecurrenceEndType, string> = {
  never: '永不',
  date: '到指定日期',
  count: '到指定次数',
};

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

interface TaskEditorProps {
  /** 传入则进入编辑模式,对现有任务做修改;不传为新建模式。 */
  editingTask?: Task | null;
  /** 编辑模式提交或取消后回调,用于退出 inline 编辑态。 */
  onDone?: () => void;
}

/** Date → datetime-local input 用的字符串(yyyy-MM-ddTHH:mm),本地时区。 */
function toDateTimeLocal(d: Date | null | undefined): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Date → date input 用的字符串(yyyy-MM-dd)。 */
function toDateInput(d: Date | null | undefined): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function newSubtaskId(): string {
  return `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function TaskEditor({ editingTask, onDone }: TaskEditorProps) {
  const isEditing = !!editingTask;
  const { create, update } = useTaskStore();
  const projects = useAppStore((s) => s.projects);
  const categories = useAppStore((s) => s.categories);
  const tags = useAppStore((s) => s.tags);

  // ─── 字段 state ──────────────────────────────────────────────────────
  const [title, setTitle] = useState(editingTask?.title ?? '');
  const [description, setDescription] = useState(editingTask?.description ?? '');
  const [priority, setPriority] = useState<Priority>(editingTask?.priority ?? 'medium');
  const [status, setStatus] = useState<Status>(editingTask?.status ?? 'todo');
  const [dueDate, setDueDate] = useState(toDateInput(editingTask?.dueDate));
  const [reminderDate, setReminderDate] = useState(toDateTimeLocal(editingTask?.reminderDate));
  const [projectId, setProjectId] = useState<string | null>(editingTask?.projectId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(editingTask?.categoryId ?? null);
  const [selectedTags, setSelectedTags] = useState<string[]>(editingTask?.tags ?? []);
  const [estimatedTime, setEstimatedTime] = useState<string>(
    editingTask?.estimatedTime != null ? String(editingTask.estimatedTime) : '',
  );
  const [isStarred, setIsStarred] = useState<boolean>(editingTask?.isStarred ?? false);
  const [progress, setProgress] = useState<number>(editingTask?.progress ?? 0);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | ''>(editingTask?.energyLevel ?? '');
  const [context, setContext] = useState<TaskContext | ''>(editingTask?.context ?? '');

  // ─── 子任务(1.3) ────────────────────────────────────────────────────
  const [subtasks, setSubtasks] = useState<Subtask[]>(editingTask?.subtasks ?? []);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // ─── 重复规则(1.2) ──────────────────────────────────────────────────
  const initialRule: RecurrenceRule | null = editingTask?.recurrence ?? null;
  const [recEnabled, setRecEnabled] = useState<boolean>(!!initialRule);
  const [recType, setRecType] = useState<RecurrenceType>(initialRule?.type ?? 'daily');
  const [recInterval, setRecInterval] = useState<number>(initialRule?.interval ?? 1);
  const [recDaysOfWeek, setRecDaysOfWeek] = useState<number[]>(initialRule?.daysOfWeek ?? []);
  const [recEndType, setRecEndType] = useState<RecurrenceEndType>(initialRule?.endType ?? 'never');
  const [recEndDate, setRecEndDate] = useState(toDateInput(initialRule?.endDate));
  const [recEndCount, setRecEndCount] = useState<string>(
    initialRule?.endCount != null ? String(initialRule.endCount) : '10',
  );

  // ─── NLP 提示(1.5) ─────────────────────────────────────────────────
  const [nlpHint, setNlpHint] = useState<string | null>(null);

  const recurrencePreview = useMemo(() => {
    if (!recEnabled) return null;
    const rule: RecurrenceRule = {
      type: recType,
      interval: recInterval,
      daysOfWeek: recType === 'weekly' && recDaysOfWeek.length > 0 ? recDaysOfWeek : undefined,
      endType: recEndType,
      endDate: recEndType === 'date' && recEndDate ? new Date(recEndDate) : undefined,
      endCount: recEndType === 'count' ? Number(recEndCount) || 1 : undefined,
      exceptions: [],
      exceptionsCount: initialRule?.exceptionsCount ?? 0,
    };
    return describeRecurrence(rule);
  }, [recEnabled, recType, recInterval, recDaysOfWeek, recEndType, recEndDate, recEndCount, initialRule]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setStatus('todo');
    setDueDate('');
    setReminderDate('');
    setProjectId(null);
    setCategoryId(null);
    setSelectedTags([]);
    setEstimatedTime('');
    setIsStarred(false);
    setProgress(0);
    setEnergyLevel('');
    setContext('');
    setSubtasks([]);
    setNewSubtaskTitle('');
    setRecEnabled(false);
    setRecType('daily');
    setRecInterval(1);
    setRecDaysOfWeek([]);
    setRecEndType('never');
    setRecEndDate('');
    setRecEndCount('10');
    setNlpHint(null);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
  };

  const toggleDayOfWeek = (day: number) => {
    setRecDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  const addSubtask = () => {
    const t = newSubtaskTitle.trim();
    if (!t) return;
    setSubtasks((prev) => [
      ...prev,
      { id: newSubtaskId(), title: t, completed: false, order: prev.length },
    ]);
    setNewSubtaskTitle('');
  };

  const toggleSubtask = (id: string) => {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)),
    );
  };

  const updateSubtaskTitle = (id: string, t: string) => {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, title: t } : s)));
  };

  const removeSubtask = (id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  };

  // ─── NLP 解析(1.5) — title 输入框失焦时尝试解析 ────────────────────
  const handleTitleBlur = () => {
    if (!title.trim()) return;
    // 只在新建模式自动解析;编辑模式不覆盖用户已有字段
    if (isEditing) return;
    const parsed = parseNaturalLanguage(title);
    if (!parsed) return;

    const fills: string[] = [];
    if (parsed.dueDate) {
      setDueDate(toDateInput(parsed.dueDate));
      // 若 NLP 给出具体时刻(小时 != 0 或 分钟 != 0),同步设 reminderDate 默认值
      if (parsed.dueDate.getHours() !== 0 || parsed.dueDate.getMinutes() !== 0) {
        setReminderDate(toDateTimeLocal(parsed.dueDate));
      }
      fills.push(`截止 ${parsed.dueDate.toLocaleString()}`);
    }
    if (parsed.priority) {
      setPriority(parsed.priority);
      fills.push(`优先级 ${PRIORITY_LABELS[parsed.priority]}`);
    }
    if (parsed.estimatedTime != null) {
      setEstimatedTime(String(parsed.estimatedTime));
      fills.push(`预估 ${parsed.estimatedTime} 分钟`);
    }
    if (parsed.recurrence) {
      setRecEnabled(true);
      setRecType(parsed.recurrence.type);
      setRecInterval(parsed.recurrence.interval);
      fills.push(`重复 ${RECURRENCE_TYPE_LABELS[parsed.recurrence.type]}`);
    }
    if (parsed.tags && parsed.tags.length > 0) {
      // 匹配现有 tag 名(忽略大小写);未匹配的创建机会留给用户(暂不自动创建)
      const matchedIds = tags
        .filter((t) => parsed.tags!.some((pt) => pt.toLowerCase() === t.name.toLowerCase()))
        .map((t) => t.id);
      if (matchedIds.length > 0) {
        setSelectedTags(matchedIds);
        fills.push(`标签 ${matchedIds.length} 个`);
      }
    }
    if (parsed.project) {
      const proj = projects.find((p) => p.name === parsed.project || p.id === parsed.project);
      if (proj) {
        setProjectId(proj.id);
        fills.push(`项目 ${proj.name}`);
      }
    }
    // 用清洗后的 title 覆盖原输入
    if (parsed.title && parsed.title !== title) {
      setTitle(parsed.title);
    }

    setNlpHint(fills.length > 0 ? `已识别:${fills.join(' · ')}` : null);
  };

  // ─── 组装 recurrence 规则 ──────────────────────────────────────────
  const buildRecurrence = (): RecurrenceRule | null => {
    if (!recEnabled) return null;
    return {
      type: recType,
      interval: Math.max(1, recInterval || 1),
      daysOfWeek: recType === 'weekly' && recDaysOfWeek.length > 0 ? recDaysOfWeek : undefined,
      endType: recEndType,
      endDate: recEndType === 'date' && recEndDate ? new Date(recEndDate) : undefined,
      endCount: recEndType === 'count' ? Math.max(1, Number(recEndCount) || 1) : undefined,
      exceptions: initialRule?.exceptions ?? [],
      exceptionsCount: initialRule?.exceptionsCount ?? 0,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const recurrence = buildRecurrence();
    const payload = {
      title: title.trim(),
      description: description.trim() || '',
      priority,
      status,
      dueDate: dueDate ? new Date(dueDate) : null,
      reminderDate: reminderDate ? new Date(reminderDate) : null,
      recurrence,
      isRecurring: !!recurrence,
      projectId,
      categoryId,
      tags: selectedTags,
      estimatedTime: estimatedTime ? Number(estimatedTime) : null,
      isStarred,
      progress: status === 'completed' ? 100 : progress,
      energyLevel: energyLevel || null,
      context: context || null,
      subtasks,
    };

    if (isEditing && editingTask) {
      const completed = status === 'completed';
      await update(editingTask.id, {
        ...payload,
        completed,
        completedAt: completed ? (editingTask.completedAt ?? new Date()) : null,
      });
      onDone?.();
    } else {
      await create(payload);
      reset();
    }
  };

  const handleCancel = () => {
    onDone?.();
  };

  const selectClass =
    'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
  const inputClass = selectClass;
  const labelClass = 'text-sm text-slate-600 dark:text-slate-300';

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
    >
      {/* 标题(含 NLP) */}
      <div>
        <Input
          placeholder="任务标题 — 支持 NLP,例如:明天下午3点 开会 +工作 !1 #重要 30分钟"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          autoFocus
        />
        {nlpHint && (
          <p className="mt-1 px-1 text-xs text-primary dark:text-primary/80">✨ {nlpHint}</p>
        )}
        {!isEditing && (
          <details className="mt-1 px-1 text-xs text-slate-400 dark:text-slate-500">
            <summary className="cursor-pointer select-none">支持的 NLP 关键词</summary>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {NL_KEYWORDS_HELP.map((k) => (
                <code key={k} className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">{k}</code>
              ))}
            </div>
          </details>
        )}
      </div>

      <textarea
        placeholder="描述(可选)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
      />

      {/* 基本字段:优先级 / 状态 / 截止 / 提醒 */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          优先级
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={`${selectClass} min-w-0 flex-1 sm:min-w-[auto]`}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          状态
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className={`${selectClass} min-w-0 flex-1 sm:min-w-[auto]`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          截止
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={`${inputClass} min-w-0 flex-1 sm:min-w-[auto]`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          提醒
          <input
            type="datetime-local"
            value={reminderDate}
            onChange={(e) => setReminderDate(e.target.value)}
            className={`${inputClass} min-w-0 flex-1 sm:min-w-[auto]`}
            aria-label="提醒时间"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          项目
          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value || null)}
            className={`${selectClass} min-w-0 flex-1 sm:min-w-[auto]`}
          >
            <option value="">无</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 sm:col-span-1">
          分类
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
            className={`${selectClass} min-w-0 flex-1 sm:min-w-[auto]`}
          >
            <option value="">无</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* 高级字段:预估时间 / 能量 / 上下文 / 星标 / 进度 */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          预估(分)
          <input
            type="number"
            min={0}
            step={5}
            value={estimatedTime}
            onChange={(e) => setEstimatedTime(e.target.value)}
            placeholder="如 30"
            className={`${inputClass} w-20`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          能量
          <select
            value={energyLevel}
            onChange={(e) => setEnergyLevel(e.target.value as EnergyLevel | '')}
            className={`${selectClass} min-w-0 flex-1 sm:min-w-[auto]`}
          >
            <option value="">无</option>
            {(Object.keys(ENERGY_LABELS) as EnergyLevel[]).map((k) => (
              <option key={k} value={k}>{ENERGY_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          上下文
          <select
            value={context}
            onChange={(e) => setContext(e.target.value as TaskContext | '')}
            className={`${selectClass} min-w-0 flex-1 sm:min-w-[auto]`}
          >
            <option value="">无</option>
            {(Object.keys(CONTEXT_LABELS) as TaskContext[]).map((k) => (
              <option key={k} value={k}>{CONTEXT_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={isStarred}
            onChange={(e) => setIsStarred(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-amber-400 focus:ring-amber-300 dark:border-slate-600"
          />
          星标
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 sm:col-span-1">
          进度 {progress}%
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="flex-1"
            aria-label="任务进度"
          />
        </label>
      </div>

      {/* 标签 */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const active = selectedTags.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      )}

      {/* 子任务(1.3) */}
      <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <div className="mb-1.5 flex items-center justify-between">
          <span className={`text-xs font-medium ${labelClass}`}>子任务</span>
          <span className="text-xs text-slate-400">
            {subtasks.filter((s) => s.completed).length} / {subtasks.length}
          </span>
        </div>
        <ul className="space-y-1">
          {subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.completed}
                onChange={() => toggleSubtask(s.id)}
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
              />
              <input
                type="text"
                value={s.title}
                onChange={(e) => updateSubtaskTitle(s.id, e.target.value)}
                className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${
                  s.completed ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'
                }`}
              />
              <button
                type="button"
                onClick={() => removeSubtask(s.id)}
                aria-label="删除子任务"
                className="shrink-0 px-1 text-slate-400 hover:text-danger dark:text-slate-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-1.5 flex gap-2">
          <input
            type="text"
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSubtask();
              }
            }}
            placeholder="添加子任务后按回车"
            className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-primary dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
          <Button type="button" variant="secondary" size="sm" onClick={addSubtask}>
            添加
          </Button>
        </div>
      </div>

      {/* 重复规则(1.2) */}
      <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={recEnabled}
            onChange={(e) => setRecEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
          />
          重复任务
        </label>
        {recEnabled && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              <label className={`flex items-center gap-1.5 ${labelClass}`}>
                频率
                <select
                  value={recType}
                  onChange={(e) => setRecType(e.target.value as RecurrenceType)}
                  className={selectClass}
                >
                  {(Object.keys(RECURRENCE_TYPE_LABELS) as RecurrenceType[]).map((k) => (
                    <option key={k} value={k}>{RECURRENCE_TYPE_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              <label className={`flex items-center gap-1.5 ${labelClass}`}>
                每
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={recInterval}
                  onChange={(e) => setRecInterval(Math.max(1, Number(e.target.value) || 1))}
                  className={`${inputClass} w-16`}
                />
                {recType === 'daily' ? '天' : recType === 'weekly' ? '周' : recType === 'monthly' ? '月' : '年'}
              </label>
              <label className={`flex items-center gap-1.5 ${labelClass}`}>
                结束
                <select
                  value={recEndType}
                  onChange={(e) => setRecEndType(e.target.value as RecurrenceEndType)}
                  className={selectClass}
                >
                  {(Object.keys(RECURRENCE_END_LABELS) as RecurrenceEndType[]).map((k) => (
                    <option key={k} value={k}>{RECURRENCE_END_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              {recEndType === 'date' && (
                <input
                  type="date"
                  value={recEndDate}
                  onChange={(e) => setRecEndDate(e.target.value)}
                  className={`${inputClass}`}
                />
              )}
              {recEndType === 'count' && (
                <label className={`flex items-center gap-1.5 ${labelClass}`}>
                  <input
                    type="number"
                    min={1}
                    value={recEndCount}
                    onChange={(e) => setRecEndCount(e.target.value)}
                    className={`${inputClass} w-20`}
                  />
                  次
                </label>
              )}
            </div>
            {recType === 'weekly' && (
              <div className="flex flex-wrap gap-1">
                {WEEKDAY_LABELS.map((label, idx) => {
                  const active = recDaysOfWeek.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDayOfWeek(idx)}
                      className={`h-7 w-7 rounded-full text-xs font-medium transition-colors ${
                        active
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                      aria-pressed={active}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            {recurrencePreview && (
              <p className="text-xs text-slate-500 dark:text-slate-400">预览:{recurrencePreview}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit">{isEditing ? '保存修改' : '添加'}</Button>
        {isEditing && (
          <Button type="button" variant="secondary" onClick={handleCancel}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
