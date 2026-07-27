// GoalPage — OKR 目标管理(D4)
//
// 布局:
// - 顶部:标题 + 描述 + "新建目标"按钮(展开内联表单)
// - 列表:按 period 分组,每个 goal 一张卡片
//   - 卡片头部:标题 + 状态徽章 + 进度环(由 KR 汇总)
//   - KR 列表:每条 KR 一行,quantitative 显示 current/target 滑块,qualitative 显示复选框
//   - 卡片操作:新增 KR / 删除目标
//
// 设计取舍:
// - KR 编辑就地完成:quantitative 用 +/- 按钮调 current(每次 +1),
//   qualitative 用 checkbox 切换 done。不弹 Modal,降低操作摩擦。
//   需要大改 target/title 时再考虑编辑模式。
// - 进度汇总:active 状态下,KR 全完成时 goalsSlice 自动标记 goal=completed;
//   UI 显示进度环用同样的逻辑(quantitative: current/target,qualitative: done)。
// - 不支持 archived 显示:目标完成后仍在列表中展示(带"已完成"徽章),
//   用户主动 deleteGoal 才会移除。这避免"完成了就消失"导致复盘时找不到。
import { useMemo, useState } from 'react';
import { useAppStore } from '../../shared/store';
import type { Goal, KeyResult } from '../../shared/types';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { EmptyState } from '../components/common/EmptyState';

const STATUS_LABEL: Record<Goal['status'], string> = {
  active: '进行中',
  completed: '已完成',
  paused: '已暂停',
  archived: '已归档',
};
const STATUS_BADGE: Record<Goal['status'], string> = {
  active: 'bg-primary/10 text-primary',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  archived: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
};

/** 计算 goal 进度(0-100),与 goalsSlice 自动完成判定逻辑一致。 */
function goalProgress(goal: Goal): number {
  if (goal.keyResults.length === 0) return 0;
  const ratios = goal.keyResults.map((kr) => {
    if (kr.type === 'quantitative') {
      const t = kr.target ?? 0;
      if (t <= 0) return kr.done ? 1 : 0;
      return Math.min(1, (kr.current ?? 0) / t);
    }
    return kr.done ? 1 : 0;
  });
  const sum = ratios.reduce((s, r) => s + r, 0);
  return Math.round((sum / ratios.length) * 100);
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0" aria-hidden="true">
      <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-200 dark:text-slate-700" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-primary"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="22" textAnchor="middle" className="fill-slate-700 text-[9px] font-semibold dark:fill-slate-200">
        {pct}%
      </text>
    </svg>
  );
}

interface NewGoalFormProps {
  onSubmit: (input: { title: string; description?: string; period: string }) => void;
  onCancel: () => void;
}

function NewGoalForm({ onSubmit, onCancel }: NewGoalFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const defaultPeriod = `${now.getFullYear()}-Q${quarter}`;
  const [period, setPeriod] = useState(defaultPeriod);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({ title: trimmed, description: description.trim() || undefined, period: period.trim() || defaultPeriod });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
      aria-label="新建目标"
    >
      <div className="space-y-3">
        <Input
          label="目标(Objective)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如:Q3 把 Goto 推到可日常使用"
          autoFocus
          required
        />
        <Input
          label="描述(可选)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="目标说明 / 动机"
        />
        <Input
          label="周期"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="例如:2026-Q3"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>取消</Button>
          <Button type="submit" disabled={!title.trim()}>创建</Button>
        </div>
      </div>
    </form>
  );
}

interface KrRowProps {
  goalId: string;
  kr: KeyResult;
  onUpdateKr: (goalId: string, krId: string, updates: Partial<Omit<KeyResult, 'id'>>) => void;
  onDeleteKr: (goalId: string, krId: string) => void;
}

function KrRow({ goalId, kr, onUpdateKr, onDeleteKr }: KrRowProps) {
  if (kr.type === 'quantitative') {
    const current = kr.current ?? 0;
    const target = kr.target ?? 0;
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs">
        <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200" title={kr.title}>
          {kr.title}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="减少进度"
            onClick={() => onUpdateKr(goalId, kr.id, { current: Math.max(0, current - 1) })}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
          >
            −
          </button>
          <span className="min-w-[3.5rem] text-center font-mono text-slate-700 dark:text-slate-200">
            {current}/{target}{kr.unit ? ` ${kr.unit}` : ''}
          </span>
          <button
            type="button"
            aria-label="增加进度"
            onClick={() => onUpdateKr(goalId, kr.id, { current: current + 1 })}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
          >
            +
          </button>
        </div>
        <button
          type="button"
          aria-label="删除关键结果"
          onClick={() => onDeleteKr(goalId, kr.id)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-danger/10 hover:text-danger"
        >
          ✕
        </button>
      </div>
    );
  }
  // qualitative
  return (
    <div className="flex items-center gap-2 py-1.5 text-xs">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={kr.done === true}
          onChange={(e) => onUpdateKr(goalId, kr.id, { done: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
        />
        <span className={`truncate ${kr.done ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`} title={kr.title}>
          {kr.title}
        </span>
      </label>
      <button
        type="button"
        aria-label="删除关键结果"
        onClick={() => onDeleteKr(goalId, kr.id)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-danger/10 hover:text-danger"
      >
        ✕
      </button>
    </div>
  );
}

interface NewKrFormProps {
  onSubmit: (input: Omit<KeyResult, 'id'>) => void;
  onCancel: () => void;
}

function NewKrForm({ onSubmit, onCancel }: NewKrFormProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'quantitative' | 'qualitative'>('quantitative');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    if (type === 'quantitative') {
      const t = Number(target);
      onSubmit({
        title: trimmed,
        type: 'quantitative',
        target: Number.isFinite(t) && t > 0 ? t : 1,
        current: 0,
        unit: unit.trim() || undefined,
      });
    } else {
      onSubmit({ title: trimmed, type: 'qualitative', done: false });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-900/40" aria-label="新增关键结果">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="关键结果,如 读完 6 本书"
        autoFocus
        required
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {(['quantitative', 'qualitative'] as const).map((t) => (
            <label
              key={t}
              className={`cursor-pointer rounded border px-2 py-1 text-[11px] ${
                type === t
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-slate-200 text-slate-500 dark:border-slate-700'
              }`}
            >
              <input type="radio" name="kr-type" checked={type === t} onChange={() => setType(t)} className="sr-only" />
              {t === 'quantitative' ? '量化' : '定性'}
            </label>
          ))}
        </div>
        {type === 'quantitative' && (
          <>
            <Input
              type="number"
              min="1"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="目标值"
              className="w-24"
            />
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="单位"
              className="w-20"
            />
          </>
        )}
        <div className="ml-auto flex gap-1.5">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>取消</Button>
          <Button type="submit" size="sm" disabled={!title.trim()}>添加</Button>
        </div>
      </div>
    </form>
  );
}

interface GoalCardProps {
  goal: Goal;
  onUpdateGoal: (id: string, updates: Partial<Omit<Goal, 'id' | 'createdAt'>>) => void;
  onDeleteGoal: (id: string) => void;
  onAddKr: (goalId: string, input: Omit<KeyResult, 'id'>) => string | null;
  onUpdateKr: (goalId: string, krId: string, updates: Partial<Omit<KeyResult, 'id'>>) => void;
  onDeleteKr: (goalId: string, krId: string) => void;
}

function GoalCard({ goal, onUpdateGoal, onDeleteGoal, onAddKr, onUpdateKr, onDeleteKr }: GoalCardProps) {
  const [showKrForm, setShowKrForm] = useState(false);
  const pct = goalProgress(goal);

  const handleDelete = () => {
    if (window.confirm(`确定删除目标"${goal.title}"?其下 ${goal.keyResults.length} 个关键结果将一并清除。`)) {
      onDeleteGoal(goal.id);
    }
  };

  const handleTogglePause = () => {
    onUpdateGoal(goal.id, { status: goal.status === 'paused' ? 'active' : 'paused' });
  };

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
      data-testid={`goal-card-${goal.id}`}
    >
      <div className="flex items-start gap-3">
        <ProgressRing pct={pct} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{goal.title}</h3>
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_BADGE[goal.status]}`}>
              {STATUS_LABEL[goal.status]}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              {goal.period}
            </span>
          </div>
          {goal.description && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{goal.description}</p>
          )}
        </div>
      </div>

      {goal.keyResults.length > 0 && (
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-700/50">
          {goal.keyResults.map((kr) => (
            <KrRow
              key={kr.id}
              goalId={goal.id}
              kr={kr}
              onUpdateKr={onUpdateKr}
              onDeleteKr={onDeleteKr}
            />
          ))}
        </div>
      )}

      {goal.keyResults.length === 0 && !showKrForm && (
        <p className="mt-2 text-xs text-slate-400">还没有关键结果,添加一个开始追踪进度。</p>
      )}

      {showKrForm && (
        <NewKrForm
          onSubmit={(input) => {
            onAddKr(goal.id, input);
            setShowKrForm(false);
          }}
          onCancel={() => setShowKrForm(false)}
        />
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2 text-xs">
        <Button size="sm" variant="ghost" onClick={() => setShowKrForm((v) => !v)}>
          {showKrForm ? '取消添加' : '新增 KR'}
        </Button>
        {goal.status !== 'completed' && (
          <Button size="sm" variant="ghost" onClick={handleTogglePause}>
            {goal.status === 'paused' ? '继续' : '暂停'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={handleDelete} className="text-danger hover:bg-danger/10">
          删除
        </Button>
      </div>
    </div>
  );
}

export function GoalPage() {
  const goals = useAppStore((s) => s.goals);
  const addGoal = useAppStore((s) => s.addGoal);
  const updateGoal = useAppStore((s) => s.updateGoal);
  const deleteGoal = useAppStore((s) => s.deleteGoal);
  const addKeyResult = useAppStore((s) => s.addKeyResult);
  const updateKeyResult = useAppStore((s) => s.updateKeyResult);
  const deleteKeyResult = useAppStore((s) => s.deleteKeyResult);

  const [showForm, setShowForm] = useState(false);

  // 按 period 分组(最近的周期在前),同周期内 active 优先于 completed/paused/archived
  const groups = useMemo(() => {
    const statusOrder: Record<Goal['status'], number> = { active: 0, paused: 1, completed: 2, archived: 3 };
    const sorted = [...goals].sort((a, b) => {
      if (a.period !== b.period) return b.period.localeCompare(a.period);
      return statusOrder[a.status] - statusOrder[b.status];
    });
    const map = new Map<string, Goal[]>();
    for (const g of sorted) {
      const arr = map.get(g.period) ?? [];
      arr.push(g);
      map.set(g.period, arr);
    }
    return Array.from(map.entries());
  }, [goals]);

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-3 sm:text-2xl">
        OKR 目标
      </h1>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400 sm:mb-6 sm:text-sm">
        把"想要达成的结果"拆成可衡量的关键结果(KR)。每条 KR 进度自动汇总到目标,
        全部完成时目标自动标记为已完成。
      </p>

      <div className="mb-4 flex justify-end">
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? '收起' : '新建目标'}
        </Button>
      </div>

      {showForm && (
        <NewGoalForm
          onSubmit={(input) => {
            addGoal(input);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {goals.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="还没有目标"
          hint={'点击右上角「新建目标」,从下一个周期的 1 个 Objective + 2-3 个 KR 开始。'}
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([period, items]) => (
            <div key={period}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {period}
              </h2>
              <div className="space-y-3">
                {items.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    onUpdateGoal={updateGoal}
                    onDeleteGoal={deleteGoal}
                    onAddKr={addKeyResult}
                    onUpdateKr={updateKeyResult}
                    onDeleteKr={deleteKeyResult}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
