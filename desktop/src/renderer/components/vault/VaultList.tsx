import { useEffect, useMemo } from 'react';
import { useVaultStore } from '../../store/vaultStore';
import { VaultCard } from './VaultCard';
import { VaultEditor } from './VaultEditor';
import { EmptyState } from '../common/EmptyState';

export function VaultList() {
  const { items, loading, fetch } = useVaultStore();

  useEffect(() => {
    fetch();
  }, [fetch]);

  // s1:时间胶囊走 /time-capsule 独立页展示,这里过滤掉避免双展示。
  const vaultItems = useMemo(
    () => items.filter((i) => i.type !== 'timeCapsule'),
    [items],
  );

  return (
    <div>
      <VaultEditor />
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">加载中...</p>
      ) : vaultItems.length === 0 ? (
        <EmptyState
          icon="🔐"
          title="保险库为空"
          hint="在上方添加密码、卡片或安全笔记。所有字段用主密码派生密钥加密,只有你能解锁看到明文。"
        />
      ) : (
        <div className="space-y-3">
          {vaultItems.map((item) => (
            <VaultCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
