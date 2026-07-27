// TimeCapsuleCard — 单条时间胶囊卡片
//
// 行为:
// - 未到 unlockAt:展示倒计时,消息内容遮蔽(显示 ••••••••),无展开按钮。
// - 到达 unlockAt:展示「展开查看」按钮,点击后显示明文。
// - 编辑入口仅在解锁后开放(避免在锁定期间修改消息内容造成时间错乱)。
// - 删除入口在两种状态下均开放(用户可随时放弃一封未到期的胶囊)。
import { useEffect, useMemo, useState } from 'react';
import type { VaultItem } from '../../../shared/types';
import { Button } from '../common/Button';
import { useVaultStore } from '../../store/vaultStore';
import { TimeCapsuleEditor } from './TimeCapsuleEditor';

interface TimeCapsuleCardProps {
  item: VaultItem;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** 把剩余毫秒格式化为 "2天 3小时 4分 5秒" 这种人类可读串。 */
function formatRemaining(ms: number): string {
  if (ms <= 0) return '已到期';
  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.floor((ms % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0 || days > 0) parts.push(`${hours}小时`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}分`);
  parts.push(`${seconds}秒`);
  return parts.join(' ');
}

export function TimeCapsuleCard({ item }: TimeCapsuleCardProps) {
  const { delete: deleteItem } = useVaultStore();
  const [now, setNow] = useState(() => Date.now());
  const [revealed, setRevealed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const unlockAtMs = useMemo(() => {
    const meta = item.timeCapsule;
    if (!meta) return 0;
    const t = Date.parse(meta.unlockAt);
    return Number.isNaN(t) ? 0 : t;
  }, [item.timeCapsule]);

  const isUnlocked = now >= unlockAtMs;
  const remaining = unlockAtMs - now;

  // 锁定期间每秒 tick 一次刷新倒计时;解锁后停止 tick。
  useEffect(() => {
    if (isUnlocked) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isUnlocked]);

  // 跨过解锁时刻后立刻把 revealed 重置(false),让用户必须显式点「展开」才能看到。
  useEffect(() => {
    if (isUnlocked) return;
    if (revealed) setRevealed(false);
  }, [isUnlocked, revealed]);

  if (isEditing) {
    return <TimeCapsuleEditor editingItem={item} onDone={() => setIsEditing(false)} />;
  }

  const messageField = item.fields.find((f) => f.name === 'message') ?? null;
  const extraFields = item.fields.filter((f) => f.name !== 'message');

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate font-semibold text-slate-800 dark:text-slate-100">
          {item.title}
        </h3>
        <div className="flex shrink-0 items-center gap-1 text-sm sm:gap-3">
          {isUnlocked && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="px-2 py-1 text-slate-400 hover:text-primary dark:text-slate-500 dark:hover:text-primary sm:px-0 sm:py-0"
            >
              编辑
            </button>
          )}
          <button
            type="button"
            onClick={() => deleteItem(item.id)}
            className="px-2 py-1 text-slate-400 hover:text-danger dark:text-slate-500 dark:hover:text-danger sm:px-0 sm:py-0"
          >
            删除
          </button>
        </div>
      </div>

      <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        {isUnlocked ? (
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            已解锁 · 可查看明文
          </span>
        ) : (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            {`解锁于 ${new Date(unlockAtMs).toLocaleString()} · 倒计时 ${formatRemaining(remaining)}`}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:gap-2">
          <span className="shrink-0 text-slate-500 dark:text-slate-400">致未来的自己</span>
          <div className="min-w-0 flex-1">
            {isUnlocked ? (
              revealed ? (
                <div className="space-y-2">
                  <p className="whitespace-pre-wrap break-words text-slate-800 dark:text-slate-100">
                    {messageField?.value ?? '(空)'}
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setRevealed(false)}>
                    隐藏
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="break-all text-slate-400 dark:text-slate-500">••••••••</p>
                  <Button variant="secondary" size="sm" onClick={() => setRevealed(true)}>
                    展开查看
                  </Button>
                </div>
              )
            ) : (
              <p className="break-all text-slate-400 dark:text-slate-500">••••••••</p>
            )}
          </div>
        </div>

        {extraFields.length > 0 && isUnlocked && revealed && (
          <div className="space-y-1 border-t border-slate-100 pt-2 dark:border-slate-700">
            {extraFields.map((f) => (
              <div
                key={f.id}
                className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-2"
              >
                <span className="shrink-0 text-slate-500 dark:text-slate-400">{f.name}</span>
                <span className="min-w-0 break-all text-slate-700 dark:text-slate-200">{f.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
