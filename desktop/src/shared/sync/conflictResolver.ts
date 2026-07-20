// 移动端冲突解决 —— 版本向量 + updatedAt 双层判定，与桌面端语义一致。
// 优先级：updatedAt (LWW) → 版本向量偏序（local/remote 支配，否则 concurrent）
// → version 计数 → id 字典序兜底。保证任意两设备独立判定结果一致，无需中心仲裁。

export interface VersionVector {
  [deviceId: string]: number;
}

export interface SyncVersion {
  id: string;
  updatedAt: number;
  version: number;
  deviceVersion?: VersionVector;
}

export type ConflictResult = 'local' | 'remote' | 'concurrent';

export function resolveConflict(local: SyncVersion, remote: SyncVersion): ConflictResult {
  // 第一层：updatedAt last-write-wins
  if (local.updatedAt > remote.updatedAt) return 'local';
  if (remote.updatedAt > local.updatedAt) return 'remote';

  // 时间戳相同：用版本向量判断因果偏序
  const localVv = local.deviceVersion;
  const remoteVv = remote.deviceVersion;

  if (localVv && remoteVv) {
    const allKeys = new Set([...Object.keys(localVv), ...Object.keys(remoteVv)]);
    const localDominates = Array.from(allKeys).every(
      (deviceId) => (remoteVv[deviceId] ?? 0) <= (localVv[deviceId] ?? 0),
    );
    const remoteDominates = Array.from(allKeys).every(
      (deviceId) => (localVv[deviceId] ?? 0) <= (remoteVv[deviceId] ?? 0),
    );

    if (localDominates && !remoteDominates) return 'local';
    if (remoteDominates && !localDominates) return 'remote';
    // 向量相等或互不支配 → concurrent（交上层合并，避免 fall through 到 version 导致双方不一致）
    return 'concurrent';
  }

  // 无版本向量：用 version 计数
  if (local.version > remote.version) return 'local';
  if (remote.version > local.version) return 'remote';

  // 兜底：id 字典序，保证双方一致
  return local.id < remote.id ? 'local' : 'remote';
}
