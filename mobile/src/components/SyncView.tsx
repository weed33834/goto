import { useAppStore } from '@shared/store';

// 移动端同步视图:展示真实同步状态(来自 shared syncSlice),并提供设备身份/同步入口。
export default function SyncView() {
  const syncConfig = useAppStore((s) => s.syncConfig);
  const lastSyncAt = useAppStore((s) => s.lastSyncAt);
  const currentDeviceId = useAppStore((s) => s.currentDeviceId);
  const isSyncing = useAppStore((s) => s.isSyncing);
  const ensureDeviceIdentity = useAppStore((s) => s.ensureDeviceIdentity);
  const performSync = useAppStore((s) => s.performSync);

  const paired = syncConfig.pairedDevices ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl-2 font-bold">同步</h1>

      <section className="space-y-2 rounded-xl border border-paper/10 bg-paper/5 p-4">
        <Row label="状态" value={syncConfig.syncStatus} />
        <Row label="设备指纹" value={currentDeviceId ?? '未生成'} />
        <Row label="已配对设备" value={String(paired.length)} />
        <Row label="上次同步" value={lastSyncAt ? lastSyncAt.toLocaleString() : '从未'} />
        <Row label="协议" value={syncConfig.provider} />
      </section>

      <div className="space-y-2">
        <button
          data-testid="sync-ensure"
          onClick={() => void ensureDeviceIdentity('移动端')}
          disabled={isSyncing}
          className="w-full rounded-lg bg-paper/10 py-3 text-base-2 transition-opacity duration-fast disabled:opacity-50"
        >
          确保设备身份
        </button>
        <button
          data-testid="sync-now"
          onClick={() => void performSync()}
          disabled={isSyncing}
          className="w-full rounded-lg bg-gold py-3 text-base-2 font-semibold text-ink transition-opacity duration-fast disabled:opacity-50"
        >
          {isSyncing ? '同步中…' : '立即同步'}
        </button>
      </div>

      {paired.length > 0 && (
        <ul className="space-y-2" data-testid="paired-list">
          {paired.map((d) => (
            <li
              key={d.deviceId}
              className="rounded-xl border border-paper/10 bg-paper/5 px-4 py-3"
            >
              <p className="text-base-2">{d.name}</p>
              <p className="text-xs-2 text-paper/40">{d.deviceId}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm-2">
      <span className="text-paper/50">{label}</span>
      <span className="truncate pl-3 text-right">{value}</span>
    </div>
  );
}
