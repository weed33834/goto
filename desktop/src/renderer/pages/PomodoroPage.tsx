// PomodoroPage — 番茄钟专注页(s2)
//
// 复用 userPreferences.pomodoroSettings 配置(focus/shortBreak/longBreak 时长、
// longBreakInterval、dailyGoal、autoStart*);通过 usePomodoro hook 驱动状态机。
//
// 布局:
// - 顶部:当前 phase 标签 + 今日完成数 / dailyGoal
// - 中部:大圆环倒计时(mm:ss) + 进度环(SVG circle)
// - 控制按钮:start/pause、reset、skip、stop
// - 配置区:折叠展开,直接修改 pomodoroSettings(立即生效,下个 phase 起作用)
import { useState } from 'react';
import { useAppStore } from '../../shared/store';
import { usePomodoro, type PomodoroPhase } from '../hooks/usePomodoro';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

const PHASE_LABEL: Record<PomodoroPhase, string> = {
  idle: '准备开始',
  focus: '专注中',
  'short-break': '短休息',
  'long-break': '长休息',
};

const PHASE_COLOR: Record<PomodoroPhase, string> = {
  idle: '#94A3B8',
  focus: '#5B6CFF',
  'short-break': '#34D399',
  'long-break': '#F59E0B',
};

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(m)}:${pad(sec)}`;
}

export function PomodoroPage() {
  const pomodoroSettings = useAppStore((s) => s.userPreferences.pomodoroSettings);
  const updatePomodoroSettings = useAppStore((s) => s.updatePomodoroSettings);
  const p = usePomodoro();
  const [showSettings, setShowSettings] = useState(false);

  const total = p.phaseTotalSeconds;
  const progress = total > 0 ? 1 - p.secondsRemaining / total : 0;
  const circumference = 2 * Math.PI * 120; // r=120
  const dashOffset = circumference * (1 - progress);
  const color = PHASE_COLOR[p.phase];

  const handleStartPause = () => {
    if (p.isRunning) p.pause();
    else p.start();
  };

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-3 sm:text-2xl">
        番茄钟
      </h1>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400 sm:mb-6 sm:text-sm">
        25 分钟专注 + 5 分钟休息的经典节律。完成的番茄数会累积为今日成果,长期下来能稳定产出。
      </p>

      <div className="mx-auto max-w-md space-y-6">
        {/* 状态条:phase + 今日完成数 */}
        <div className="flex items-center justify-between text-sm">
          <span
            className="rounded-full px-3 py-1 text-xs font-medium text-white"
            style={{ backgroundColor: color }}
            data-testid="pomodoro-phase-label"
          >
            {PHASE_LABEL[p.phase]}
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            今日完成 <strong className="text-slate-800 dark:text-slate-100">{p.completedFocusCount}</strong>
            {' '}/ {pomodoroSettings.dailyGoal} 个番茄
          </span>
        </div>

        {/* 圆环倒计时 */}
        <div className="relative mx-auto flex h-72 w-72 items-center justify-center sm:h-80 sm:w-80">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 256 256">
            <circle
              cx="128"
              cy="128"
              r="120"
              fill="none"
              className="stroke-slate-200 dark:stroke-slate-700"
              strokeWidth="12"
            />
            <circle
              cx="128"
              cy="128"
              r="120"
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }
              }
            />
          </svg>
          <div className="flex flex-col items-center">
            <span
              className="font-mono text-5xl font-semibold text-slate-800 dark:text-slate-100 sm:text-6xl"
              data-testid="pomodoro-clock"
            >
              {formatClock(p.secondsRemaining)}
            </span>
            <span className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              {p.isRunning ? '进行中' : p.phase === 'idle' ? '点击开始' : '已暂停'}
            </span>
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            onClick={handleStartPause}
            disabled={p.phase === 'idle' && p.isRunning}
            className="min-w-[6rem]"
          >
            {p.isRunning ? '暂停' : p.phase === 'idle' ? '开始专注' : '继续'}
          </Button>
          <Button variant="secondary" onClick={p.reset} disabled={p.phase === 'idle'}>
            重置
          </Button>
          <Button variant="secondary" onClick={p.skip} disabled={p.phase === 'idle'}>
            跳过
          </Button>
          <Button variant="ghost" onClick={p.stop} disabled={p.phase === 'idle'}>
            停止
          </Button>
        </div>

        {/* 配置入口 */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-200"
            aria-expanded={showSettings}
          >
            <span>番茄钟配置</span>
            <span className="text-xs text-slate-400">{showSettings ? '收起' : '展开'}</span>
          </button>
          {showSettings && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input
                label="专注(分钟)"
                type="number"
                min={1}
                max={120}
                value={pomodoroSettings.focusDuration}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) updatePomodoroSettings({ focusDuration: Math.floor(v) });
                }}
              />
              <Input
                label="短休息(分钟)"
                type="number"
                min={1}
                max={60}
                value={pomodoroSettings.shortBreakDuration}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) updatePomodoroSettings({ shortBreakDuration: Math.floor(v) });
                }}
              />
              <Input
                label="长休息(分钟)"
                type="number"
                min={1}
                max={60}
                value={pomodoroSettings.longBreakDuration}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) updatePomodoroSettings({ longBreakDuration: Math.floor(v) });
                }}
              />
              <Input
                label="长休息间隔(个)"
                type="number"
                min={1}
                max={10}
                value={pomodoroSettings.longBreakInterval}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) updatePomodoroSettings({ longBreakInterval: Math.floor(v) });
                }}
              />
              <Input
                label="每日目标(个)"
                type="number"
                min={1}
                max={50}
                value={pomodoroSettings.dailyGoal}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) updatePomodoroSettings({ dailyGoal: Math.floor(v) });
                }}
              />
              <div className="col-span-2 space-y-2 sm:col-span-3">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={pomodoroSettings.autoStartBreaks}
                    onChange={(e) => updatePomodoroSettings({ autoStartBreaks: e.target.checked })}
                  />
                  专注结束自动进入休息
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={pomodoroSettings.autoStartFocus}
                    onChange={(e) => updatePomodoroSettings({ autoStartFocus: e.target.checked })}
                  />
                  休息结束自动进入专注
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
