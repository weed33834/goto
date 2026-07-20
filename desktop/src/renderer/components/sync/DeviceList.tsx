import { Button } from '../common/Button';
import type { SyncDeviceInfo, SyncPeerInfo, PeerState } from '../../store/syncStore';
import { formatLastSeen } from '../../store/syncStore';

interface DeviceListProps {
  devices: SyncDeviceInfo[];
  peers: SyncPeerInfo[];
  onRemove: (deviceId: string) => void;
}

function peerStateLabel(state: PeerState): string {
  switch (state) {
    case 'connecting':
      return '连接中';
    case 'handshaking':
      return '握手';
    case 'syncing':
      return '同步中';
    case 'idle':
      return '在线';
    case 'error':
      return '错误';
    case 'closed':
      return '离线';
    default:
      return '未知';
  }
}

export function DeviceList({ devices, peers, onRemove }: DeviceListProps) {
  const peerMap = new Map(peers.map((p) => [p.deviceId, p]));

  if (devices.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        暂无已配对设备。点击「添加设备」将其他设备加入同步。
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
      {devices.map((device) => {
        const peer = peerMap.get(device.deviceId);
        return (
          <li key={device.deviceId} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {device.name ?? `Device-${device.deviceId.slice(0, 4)}`}
              </p>
              <p className="break-words text-xs text-slate-500 dark:text-slate-400">
                <span className="break-all">ID: {device.deviceId}</span>
                {' · '}上次在线: {formatLastSeen(device.lastSeenAt)}
                {peer && (
                  <>
                    {' · '}状态: <span className="font-medium">{peerStateLabel(peer.state)}</span>
                    {peer.lastSyncAt && ` · 同步: ${formatLastSeen(peer.lastSyncAt)}`}
                    {peer.error && ` · 错误: ${peer.error}`}
                  </>
                )}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onRemove(device.deviceId)}>
              移除
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
