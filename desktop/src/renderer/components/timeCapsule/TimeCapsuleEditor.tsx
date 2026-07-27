// TimeCapsuleEditor — 创建/编辑时间胶囊
//
// 字段:
// - 标题(必填):一句话概括这封信写给什么场景下的自己。
// - 解锁时间(必填):仅新建时可设;编辑模式锁死,避免"解锁后又改回去"破坏信任。
// - 消息正文(必填):多行文本,以 VaultField(isSensitive=true) 存入 fields,
//   随 VaultItem 一起走 vault_items 表的 E2EE 同步。
//
// 提交时构造一个 type='timeCapsule' 的 VaultItem,通过 useVaultStore 写入,
// 复用 vaultSlice 已有的 notification + undo 流程,与 VaultEditor 行为一致。
import { useMemo, useState } from 'react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useVaultStore } from '../../store/vaultStore';
import type { VaultItem, VaultField } from '../../../shared/types';

interface TimeCapsuleEditorProps {
  editingItem?: VaultItem | null;
  onDone?: () => void;
}

const MESSAGE_FIELD_NAME = 'message';

function makeMessageField(value: string): VaultField {
  return {
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: MESSAGE_FIELD_NAME,
    value,
    isSensitive: true,
  };
}

/** 把 ISO 字符串转成 <input type="datetime-local"> 接受的本地时间格式 yyyy-MM-ddTHH:mm。 */
function isoToLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 把本地 datetime-local 输入转成 ISO 字符串(本地时区)。 */
function localInputToIso(value: string): string {
  if (!value) return '';
  const t = Date.parse(value);
  if (Number.isNaN(t)) return '';
  return new Date(t).toISOString();
}

export function TimeCapsuleEditor({ editingItem, onDone }: TimeCapsuleEditorProps) {
  const isEditing = !!editingItem;
  const { create, update } = useVaultStore();

  const initialMessage = useMemo(() => {
    if (!editingItem) return '';
    return editingItem.fields.find((f) => f.name === MESSAGE_FIELD_NAME)?.value ?? '';
  }, [editingItem]);

  const initialUnlockIso = useMemo(() => {
    return editingItem?.timeCapsule?.unlockAt ?? '';
  }, [editingItem]);

  const [title, setTitle] = useState(editingItem?.title ?? '');
  const [unlockLocal, setUnlockLocal] = useState(() => isoToLocalInput(initialUnlockIso));
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('请填写标题');
      return;
    }
    if (!message.trim()) {
      setError('请写给未来自己的话');
      return;
    }

    const unlockIso = localInputToIso(unlockLocal);
    if (!isEditing) {
      if (!unlockIso) {
        setError('请选择解锁时间');
        return;
      }
      if (Date.parse(unlockIso) <= Date.now()) {
        setError('解锁时间必须在未来');
        return;
      }
    }

    const fields: VaultField[] = [makeMessageField(message.trim())];

    if (isEditing && editingItem) {
      // 编辑模式仅允许改标题与正文;unlockAt 锁死,防止"解锁后改回去"破坏承诺。
      await update(editingItem.id, { title: trimmedTitle, fields });
      onDone?.();
    } else {
      await create({
        type: 'timeCapsule',
        title: trimmedTitle,
        fields,
        isHidden: false,
        timeCapsule: { unlockAt: unlockIso, deliveryPolicy: 'silent' },
      });
      // 清空表单,允许连续创建多条胶囊。
      setTitle('');
      setUnlockLocal('');
      setMessage('');
      setError(null);
    }
  };

  const handleCancel = () => {
    onDone?.();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
    >
      <Input
        placeholder="标题(如:写给一年后的你)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <div className="w-full">
        <label
          htmlFor="time-capsule-unlock-at"
          className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          解锁时间
        </label>
        <input
          id="time-capsule-unlock-at"
          type="datetime-local"
          value={unlockLocal}
          onChange={(e) => setUnlockLocal(e.target.value)}
          disabled={isEditing}
          className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 ${
            isEditing ? 'cursor-not-allowed opacity-60' : ''
          }`}
        />
        {isEditing && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            解锁时间在创建后不可修改,以保护"承诺"语义。
          </p>
        )}
      </div>
      <div className="w-full">
        <label
          htmlFor="time-capsule-message"
          className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          致未来的自己
        </label>
        <textarea
          id="time-capsule-message"
          placeholder="把此刻想留到那时再说的话写下来…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit">{isEditing ? '保存修改' : '封存胶囊'}</Button>
        {isEditing && (
          <Button type="button" variant="secondary" onClick={handleCancel}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
