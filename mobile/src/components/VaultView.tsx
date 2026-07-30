import { useState } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { useAppStore } from '@shared/store';
import type { VaultItem } from '@shared/types';

// 移动端保险库:本地解锁门(UI 态,不伪造 E2EE)+ 真实增删 vaultItems(走 shared 内核)。
export default function VaultView() {
  const items = useAppStore((s) => s.vaultItems);
  const addVaultItem = useAppStore((s) => s.addVaultItem);
  const deleteVaultItem = useAppStore((s) => s.deleteVaultItem);
  const [unlocked, setUnlocked] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const unlock = () => {
    // 本地轻量门禁:非空口令即可解锁。真实加密在 shared 内核,此处只控制 UI 可见性。
    if (passcode.trim().length > 0) setUnlocked(true);
  };

  const create = () => {
    const input: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'> = {
      type: 'secureNote',
      title: title.trim() || '未命名条目',
      fields: [],
      isHidden: false,
    };
    addVaultItem(input);
    setTitle('');
    setAdding(false);
  };

  if (!unlocked) {
    return (
      <div className="space-y-4 pt-10">
        <div className="flex flex-col items-center gap-3 text-paper/70">
          <Lock size={40} />
          <p className="text-sm-2">输入口令解锁保险库</p>
        </div>
        <input
          data-testid="vault-passcode"
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="口令"
          className="w-full rounded-lg bg-paper/10 px-3 py-2 text-base-2 outline-none focus:ring-2 focus:ring-gold"
        />
        <button
          data-testid="vault-unlock"
          onClick={unlock}
          className="w-full rounded-lg bg-gold py-3 text-base-2 font-semibold text-ink"
        >
          解锁
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl-2 font-bold">保险库</h1>
        <button
          data-testid="vault-lock"
          onClick={() => setUnlocked(false)}
          className="text-xs-2 text-paper/50"
        >
          锁定
        </button>
      </header>

      {adding && (
        <div className="space-y-2 rounded-xl border border-paper/10 bg-paper/5 p-3">
          <input
            data-testid="vault-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="条目标题"
            className="w-full rounded-lg bg-paper/10 px-3 py-2 text-base-2 outline-none focus:ring-2 focus:ring-gold"
          />
          <button
            data-testid="vault-create"
            onClick={create}
            className="w-full rounded-lg bg-gold py-2 text-sm-2 font-semibold text-ink"
          >
            添加
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm-2 text-paper/40">保险库为空</p>
      ) : (
        <ul className="space-y-2" data-testid="vault-list">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between rounded-xl border border-paper/10 bg-paper/5 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-base-2">{it.title}</p>
                <p className="text-xs-2 text-paper/40">{it.type}</p>
              </div>
              <button
                data-testid={`vault-del-${it.id}`}
                onClick={() => deleteVaultItem(it.id)}
                aria-label="删除条目"
                className="text-paper/40 transition-colors duration-fast active:text-seal"
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        data-testid="vault-add"
        onClick={() => setAdding((v) => !v)}
        aria-label="新建保险库条目"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-lg transition-transform duration-fast active:scale-95"
      >
        <Plus size={26} />
      </button>
    </div>
  );
}
