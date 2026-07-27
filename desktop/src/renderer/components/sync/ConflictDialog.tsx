// ConflictDialog — 同步并发冲突解决弹窗(P1-3)。
//
// 触发:SyncEngine.onConcurrentWrite → syncSlice.pushConflict → pendingConflicts。
// 用户在"保留本地"(用 localRecord 回滚覆盖 remote)与"接受远端"(保留已落库的 remote)
// 之间二选一。决策后 useSyncScheduler 监听 resolution 执行回滚。
//
// 设计要点:
// - 只展示 resolution===null 的未决冲突,逐条处理(队列式)。
// - local/remote 的 encryptedPayload 用 SMK 解密后展示关键字段(title/status/priority 等)。
//   SMK 不在内存常驻,每次打开对话框时按需 loadSyncMasterKey + decryptSyncRecord。
// - 解密失败(SMK 缺失/密文损坏)时降级展示元数据(recordId/tableName/updatedAt),
//   不阻塞用户决策 —— 用户仍可基于时间戳判断该保留哪侧。
// - 通过 uiSlice.activeModal === 'conflict-dialog' 控制开关,与 CommandPalette 同模式。
//   有未决冲突时 SyncSettingsPanel 横幅 / Toaster 可 setActiveModal 唤起。
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../../shared/store';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { loadSyncMasterKey } from '../../../shared/sync/syncStorage';
import { decryptSyncRecord } from '../../../shared/sync/syncCrypto';
import type { PendingConflict } from '../../../shared/store/slices/syncSlice';
import type { SyncRecordPayload } from '../../../shared/sync/syncCrypto';
import type { Bytes } from '../../../shared/sync/bytes';

/** 解密后的冲突快照。local 可能为 null(本地原本无记录,理论不会 concurrent)。 */
interface DecryptedConflict {
  local: SyncRecordPayload | null;
  remote: SyncRecordPayload | null;
  /** 解密错误信息。null 表示成功。 */
  error: string | null;
}

/**
 * 解密一条冲突的 local/remote 快照。
 *
 * SMK 在所有配对设备间共享(配对时 SMK_TRANSFER 同步),故本机 SMK 可解密任一对端
 * 推送来的密文。解密失败说明 SMK 不一致(配对异常)或密文损坏,此时返回 error
 * 让 UI 降级展示元数据,不抛错阻断决策流程。
 */
async function decryptConflict(conflict: PendingConflict): Promise<DecryptedConflict> {
  const smk: Bytes | null = await loadSyncMasterKey();
  if (!smk) {
    return { local: null, remote: null, error: 'SMK 未就绪,无法解密冲突内容' };
  }
  try {
    const local = conflict.localRecord
      ? await decryptSyncRecord(conflict.localRecord.encryptedPayload, smk)
      : null;
    const remote = conflict.remoteRecord
      ? await decryptSyncRecord(conflict.remoteRecord.encryptedPayload, smk)
      : null;
    return { local, remote, error: null };
  } catch (err) {
    return {
      local: null,
      remote: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 把解密后的 payload 关键字段格式化为可读行。仅展示常见字段,未知字段忽略。 */
function formatPayloadRows(payload: SyncRecordPayload | null): Array<{ label: string; value: string }> {
  if (!payload) return [{ label: '状态', value: '本地无记录' }];
  const rows: Array<{ label: string; value: string }> = [];
  const get = (k: string): unknown => payload[k];
  const title = get('title');
  if (typeof title === 'string') rows.push({ label: '标题', value: title });
  const status = get('status');
  if (typeof status === 'string') rows.push({ label: '状态', value: status });
  const priority = get('priority');
  if (typeof priority === 'string') rows.push({ label: '优先级', value: priority });
  const completed = get('completed');
  if (typeof completed === 'boolean') rows.push({ label: '已完成', value: completed ? '是' : '否' });
  const progress = get('progress');
  if (typeof progress === 'number') rows.push({ label: '进度', value: `${progress}%` });
  const dueDate = get('dueDate');
  if (dueDate != null) rows.push({ label: '截止', value: String(dueDate) });
  const projectId = get('projectId');
  if (typeof projectId === 'string' && projectId) rows.push({ label: '项目', value: projectId });
  const notes = get('notes');
  if (typeof notes === 'string' && notes) rows.push({ label: '备注', value: notes });
  // 兜底:payload 为空对象时至少展示一行,避免空白卡片。
  if (rows.length === 0) rows.push({ label: '内容', value: '(无可用字段)' });
  return rows;
}

/** 把时间戳格式化为可读字符串。 */
function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

/** 把版本向量格式化为 device=count 的紧凑表示。 */
function formatVersionVector(vv: Record<string, number>): string {
  const entries = Object.entries(vv);
  if (entries.length === 0) return '(空)';
  return entries.map(([d, n]) => `${d.slice(0, 8)}=${n}`).join(', ');
}

export function ConflictDialog() {
  const activeModal = useAppStore((s) => s.activeModal);
  const pendingConflicts = useAppStore((s) => s.pendingConflicts);
  const setConflictResolution = useAppStore((s) => s.setConflictResolution);
  const clearResolvedConflicts = useAppStore((s) => s.clearResolvedConflicts);
  const setActiveModal = useAppStore((s) => s.setActiveModal);

  const isOpen = activeModal === 'conflict-dialog';

  // 当前展示的冲突:第一个未决的。逐条处理,处理完自动跳到下一条。
  const current = useMemo(
    () => pendingConflicts.find((c) => c.resolution === null) ?? null,
    [pendingConflicts],
  );

  const [decrypted, setDecrypted] = useState<DecryptedConflict | null>(null);

  // 当前冲突变化时解密。关闭对话框时清空,避免下次打开闪现旧数据。
  useEffect(() => {
    if (!isOpen || !current) {
      setDecrypted(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await decryptConflict(current);
      if (!cancelled) setDecrypted(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, current]);

  // 所有冲突处理完时自动关闭对话框。
  useEffect(() => {
    if (isOpen && !current) {
      // 清理已解决的冲突,释放内存。
      clearResolvedConflicts();
      setActiveModal(null);
    }
  }, [isOpen, current, clearResolvedConflicts, setActiveModal]);

  if (!isOpen || !current) return null;

  const localRows = formatPayloadRows(decrypted?.local ?? null);
  const remoteRows = formatPayloadRows(decrypted?.remote ?? null);

  const handleResolve = (resolution: 'local' | 'remote') => {
    setConflictResolution(current.id, resolution);
    // setConflictResolution 后 pendingConflicts 更新,current 重新计算,
    // 下一条未决冲突自动展示;无未决时上面 effect 自动关闭对话框。
  };

  const handleClose = () => {
    // 用户手动关闭:未决冲突保留在 pendingConflicts,不强制解决。
    // SyncSettingsPanel 横幅会继续提示"有待解决冲突",用户可重新打开。
    setActiveModal(null);
  };

  const remainingCount = pendingConflicts.filter((c) => c.resolution === null).length;

  return (
    <Modal isOpen={true} onClose={handleClose} title={`同步冲突待解决 · 剩余 ${remainingCount}`}>
      <div className="space-y-4">
        {/* 冲突元数据 */}
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>记录 ID: <code className="break-all">{current.recordId}</code></span>
            <span>表: <code>{current.tableName}</code></span>
            <span>对端: <code>{current.peerDeviceId.slice(0, 16)}</code></span>
            <span>发生: {formatTime(current.occurredAt)}</span>
          </div>
        </div>

        {decrypted?.error && (
          <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            解密失败({decrypted.error}),仅展示元数据。可依据时间戳与版本向量判断保留哪侧。
          </p>
        )}

        {/* 双栏对比:本地 vs 远端 */}
        <div className="grid gap-3 sm:grid-cols-2">
          {/* 本地版本 */}
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">本地版本</h4>
              <span className="text-[10px] text-slate-400">
                {current.localRecord ? formatTime(current.localRecord.updatedAt) : '—'}
              </span>
            </div>
            <dl className="space-y-1 text-xs">
              {localRows.map((row) => (
                <div key={row.label} className="flex gap-2">
                  <dt className="shrink-0 text-slate-400">{row.label}:</dt>
                  <dd className="break-all text-slate-700 dark:text-slate-200">{row.value}</dd>
                </div>
              ))}
            </dl>
            {current.localRecord && (
              <p className="mt-2 break-all text-[10px] text-slate-400">
                VV: {formatVersionVector(current.localRecord.deviceVersion)}
              </p>
            )}
          </div>

          {/* 远端版本 */}
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">远端版本</h4>
              <span className="text-[10px] text-slate-400">
                {current.remoteRecord ? formatTime(current.remoteRecord.updatedAt) : '—'}
              </span>
            </div>
            <dl className="space-y-1 text-xs">
              {remoteRows.map((row) => (
                <div key={row.label} className="flex gap-2">
                  <dt className="shrink-0 text-slate-400">{row.label}:</dt>
                  <dd className="break-all text-slate-700 dark:text-slate-200">{row.value}</dd>
                </div>
              ))}
            </dl>
            {current.remoteRecord && (
              <p className="mt-2 break-all text-[10px] text-slate-400">
                VV: {formatVersionVector(current.remoteRecord.deviceVersion)}
              </p>
            )}
          </div>
        </div>

        {/* 决策按钮 */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            onClick={() => handleResolve('local')}
            className="flex-1"
          >
            保留本地
          </Button>
          <Button
            onClick={() => handleResolve('remote')}
            className="flex-1"
          >
            接受远端
          </Button>
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          远端版本已被自动落库(数据不会丢失)。选择「保留本地」会用本地版本覆盖回写;
          选择「接受远端」则保持当前远端版本。决策后可通过手动同步让对端收敛。
        </p>
      </div>
    </Modal>
  );
}
