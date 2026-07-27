// TimeCapsulePage — 时间织锦的「加密时间胶囊」入口
//
// 仅展示 type === 'timeCapsule' 的 VaultItem,普通保险库项继续在 /vault 展示。
// 这样:
// - 数据层完全复用 vault_items 表 + E2EE 同步,不引入新同步表。
// - UI 上把"写给未来自己"作为独立场景,不与密码/卡片混在一起。
import { useEffect, useMemo } from 'react';
import { useVaultStore } from '../store/vaultStore';
import { TimeCapsuleEditor } from '../components/timeCapsule/TimeCapsuleEditor';
import { TimeCapsuleCard } from '../components/timeCapsule/TimeCapsuleCard';
import { EmptyState } from '../components/common/EmptyState';

export function TimeCapsulePage() {
  const { items, loading, fetch } = useVaultStore();

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const capsules = useMemo(
    () => items.filter((i) => i.type === 'timeCapsule'),
    [items],
  );

  // 锁定中的胶囊按 unlockAt 升序排(最先解锁的排前面);
  // 已解锁的按 updatedAt 降序排(最近查看/编辑过的排前面)。
  const sortedCapsules = useMemo(() => {
    const now = Date.now();
    const locked = capsules.filter((c) => {
      const t = c.timeCapsule ? Date.parse(c.timeCapsule.unlockAt) : NaN;
      return !Number.isNaN(t) && t > now;
    });
    const unlocked = capsules.filter((c) => {
      const t = c.timeCapsule ? Date.parse(c.timeCapsule.unlockAt) : NaN;
      return !Number.isNaN(t) && t <= now;
    });
    locked.sort((a, b) => {
      const ta = a.timeCapsule ? Date.parse(a.timeCapsule.unlockAt) : 0;
      const tb = b.timeCapsule ? Date.parse(b.timeCapsule.unlockAt) : 0;
      return ta - tb;
    });
    unlocked.sort((a, b) => {
      const ta = Date.parse(a.updatedAt);
      const tb = Date.parse(b.updatedAt);
      return tb - ta;
    });
    return [...locked, ...unlocked];
  }, [capsules]);

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-slate-800 dark:text-slate-100 sm:mb-3 sm:text-2xl">
        加密时间胶囊
      </h1>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400 sm:mb-6 sm:text-sm">
        写给未来自己的加密信件。在解锁时间到达前,任何人都无法看到正文 —
        包括你自己。胶囊随保险库走 E2EE 同步,只有你已配对的设备能解密。
      </p>

      <TimeCapsuleEditor />

      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">加载中...</p>
      ) : sortedCapsules.length === 0 ? (
        <EmptyState
          icon="✉️"
          title="还没有胶囊"
          hint="在上方写第一封给未来自己的信。设好解锁时间,封存后内容会被遮蔽,直到时间到达。"
        />
      ) : (
        <div className="space-y-3">
          {sortedCapsules.map((item) => (
            <TimeCapsuleCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
