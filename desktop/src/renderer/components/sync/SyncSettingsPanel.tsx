import { useEffect, useState } from 'react';
import { useAppStore } from '../../../shared/store';
import { useSyncRuntime } from '../../hooks/useSyncRuntime';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PairingDialog } from './PairingDialog';
import { OFFICIAL_RELAY_INFO_URL } from '../../../shared/sync/syncPolicy';

// 同步设置面板：接入真实的 syncSlice 状态机 + pairingService 运行时。
// 替换原「Web 端设备同步暂不可用」占位横幅，提供中继配置 / 设备配对 / 设备管理 / 重置。
export function SyncSettingsPanel() {
  const syncConfig = useAppStore((s) => s.syncConfig);
  const currentDeviceId = useAppStore((s) => s.currentDeviceId);
  const pairing = useAppStore((s) => s.pairing);
  const e2eeSync = useAppStore((s) => s.e2eeSync);
  const smkReady = useAppStore((s) => s.smkReady);
  const setRelayUrl = useAppStore((s) => s.setRelayUrl);

  const { addDevice, joinDevice, cancelPairing, removeDevice, resetSync } = useSyncRuntime();

  // 中继地址输入框本地态：提交时才写入 store，避免每次按键触发持久化
  const [relayInput, setRelayInput] = useState(syncConfig.relayUrl ?? '');
  useEffect(() => {
    setRelayInput(syncConfig.relayUrl ?? '');
  }, [syncConfig.relayUrl]);

  const pairedDevices = syncConfig.pairedDevices ?? [];

  // PairingDialog 期望的 props，由 syncSlice.pairing 状态映射而来
  const dialogMode: 'none' | 'host' | 'join' = pairing.active
    ? (pairing.role === 'responder' ? 'host' : 'join')
    : 'none';
  const pairingCode = pairing.code
    ? { code: pairing.code, expiresAt: pairing.codeExpiresAt ?? 0 }
    : null;

  return (
    <div className="space-y-6">
      {/* 中继服务器配置 */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">中继服务器</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          中继只转发端到端加密的密文帧，无法读取任务明文。可使用官方中继或自托管。
          自托管部署见{' '}
          <a
            href={OFFICIAL_RELAY_INFO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            relay 部署文档
          </a>
          。
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={relayInput}
            onChange={(e) => setRelayInput(e.target.value)}
            placeholder="https://relay.example.com"
          />
          <Button
            onClick={() => setRelayUrl(relayInput.trim())}
            disabled={relayInput.trim() === (syncConfig.relayUrl ?? '')}
            className="shrink-0"
          >
            保存
          </Button>
        </div>
      </section>

      {/* 当前设备身份 */}
      <section className="space-y-1">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">本机设备</h3>
        <p className="break-all text-xs text-slate-500 dark:text-slate-400">
          {currentDeviceId
            ? `设备指纹：${currentDeviceId}`
            : '尚未生成设备身份，配对时将自动创建。'}
          {smkReady ? ' · 同步主密钥已就绪' : ' · 同步主密钥未生成'}
        </p>
      </section>

      {/* 设备配对 */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">设备配对</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={addDevice} className="justify-start sm:justify-center">添加新设备</Button>
          <Button
            variant="secondary"
            onClick={() => useAppStore.getState().startPairing('initiator')}
            className="justify-start sm:justify-center"
          >
            加入现有设备
          </Button>
        </div>
        {e2eeSync.status === 'success' && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            最近同步：{e2eeSync.lastSyncAt ? new Date(e2eeSync.lastSyncAt).toLocaleString() : '刚刚'}
          </p>
        )}
        {e2eeSync.error && (
          <p className="text-xs text-danger">{e2eeSync.error}</p>
        )}
      </section>

      {/* 已配对设备列表 */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">
          已配对设备（{pairedDevices.length}）
        </h3>
        {pairedDevices.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            暂无已配对设备。点击「添加新设备」生成配对码，在其他设备上输入即可加入同步。
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {pairedDevices.map((device) => (
              <li key={device.deviceId} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {device.name}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    ID: {device.deviceId}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    // P0-4:危险操作二次确认,防误点导致配对永久断开
                    if (window.confirm(`确定要移除设备「${device.name}」吗?\n移除后该设备将无法继续同步,需重新配对才能恢复。`)) {
                      removeDevice(device.deviceId);
                    }
                  }}
                >
                  移除
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 危险区：重置 E2EE 同步 */}
      {pairedDevices.length > 0 && (
        <section className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <h3 className="text-sm font-medium text-danger">重置同步</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            清空所有已配对设备并删除本机同步主密钥。重置后需重新配对才能恢复跨设备同步。
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              // P0-4:危险操作二次确认。resetSync 会 deleteSyncMasterKey,不可撤销
              if (window.confirm('确定要重置端到端加密同步吗?\n\n此操作将:\n• 清空所有已配对设备\n• 删除本机同步主密钥\n\n重置后必须重新配对所有设备才能恢复同步,无法撤销。')) {
                resetSync();
              }
            }}
          >
            重置端到端加密同步
          </Button>
        </section>
      )}

      <PairingDialog
        mode={dialogMode}
        pairingCode={pairingCode}
        error={pairing.error}
        onClose={cancelPairing}
        onGenerate={addDevice}
        onClaim={joinDevice}
        onClearError={() => useAppStore.getState().setPairingError(null)}
      />
    </div>
  );
}
