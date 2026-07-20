// 同步策略集中配置 —— 设备上限 / 中继模式 / 同步范围三类决策集中于此，
// 便于一处定义多处引用（store/UI/测试），运行时 syncConfig 覆盖默认值。
// 纯常量 + 纯函数，无副作用。

/** 默认官方 relay URL。relay 只转发密文帧，官方与自托管在隐私层等价（E2EE）。 */
export const DEFAULT_RELAY_URL = 'wss://relay.goto.app';

/** 备用中继节点（按优先级降序）。空表示不自动降级。 */
export const FALLBACK_RELAY_URLS: readonly string[] = [
  // 预留位：待官方基础设施部署后填充
  // 'wss://relay-eu.goto.app',
  // 'wss://relay-us.goto.app',
];

/** 官方 relay 主页 URL（SyncSettingsPanel 的"使用官方中继"按钮用）。 */
export const OFFICIAL_RELAY_INFO_URL = 'https://goto.app/relay';

/**
 * 设备数量上限。Infinity = 无限制（版本向量天然支持多设备并发）。
 * syncConfig.maxDevices 用 null 表示无限制（Infinity 不可 JSON 序列化），
 * 业务代码用 shouldLimitDevices() 判断。
 */
export const MAX_DEVICES = Infinity;

/** 同步范围：full=全量 / metadata-only=仅元数据 / local-only=本机专属。 */
export type SyncScope = 'full' | 'metadata-only' | 'local-only';

/** 各记录类型的同步范围。附件仅同步元数据，二进制走外部存储。 */
export const SYNC_SCOPE: Readonly<Record<string, SyncScope>> = {
  // 核心业务数据：全量同步
  tasks: 'full',
  notes: 'full',
  goals: 'full',
  habits: 'full',
  categories: 'full',
  tags: 'full',
  projects: 'full',
  views: 'full',
  reminders: 'full',
  templates: 'full',
  automation: 'full',
  // 附件：仅元数据（URL + 大小 + 校验和 + MIME）
  attachments: 'metadata-only',
  // 用户偏好：同步给所有设备
  preferences: 'full',
  // 以下为本机专属
  ui: 'local-only',
  focus: 'local-only',
  search: 'local-only',
  teams: 'local-only',
  syncLogs: 'local-only',
} as const;

/** 全量同步的记录类型清单（从 SYNC_SCOPE 派生）。 */
export const FULL_SYNC_RECORD_TYPES: readonly string[] = Object.freeze(
  Object.entries(SYNC_SCOPE)
    .filter(([, scope]) => scope === 'full')
    .map(([type]) => type),
);

/** 元数据同步的记录类型清单。 */
export const METADATA_SYNC_RECORD_TYPES: readonly string[] = Object.freeze(
  Object.entries(SYNC_SCOPE)
    .filter(([, scope]) => scope === 'metadata-only')
    .map(([type]) => type),
);

/** 中继模式：official=官方 relay / self-hosted=自托管 / auto=自动选择（暂等同 official）。 */
export type RelayMode = 'official' | 'self-hosted' | 'auto';

export const DEFAULT_RELAY_MODE: RelayMode = 'official';

/** 同步策略主接口，聚合三类决策便于在 store/UI/测试中传递。 */
export interface SyncPolicy {
  /** 设备数量上限。null 表示无限制。 */
  maxDevices: number | null;
  /** 中继模式。 */
  relayMode: RelayMode;
  /** 当前生效的 relay URL。 */
  relayUrl: string;
  /** 同步范围映射。 */
  syncScope: Readonly<Record<string, SyncScope>>;
}

/** 默认同步策略。业务代码应通过 getSyncPolicy(syncConfig) 读取以便运行时覆盖。 */
export const DEFAULT_SYNC_POLICY: SyncPolicy = {
  maxDevices: null,
  relayMode: DEFAULT_RELAY_MODE,
  relayUrl: DEFAULT_RELAY_URL,
  syncScope: SYNC_SCOPE,
};

/** 是否应该限制设备数量。避免业务代码直接比较 maxDevices === null（Infinity 误用）。 */
export function shouldLimitDevices(policy: Pick<SyncPolicy, 'maxDevices'>): boolean {
  return policy.maxDevices !== null && policy.maxDevices > 0 && policy.maxDevices !== Infinity;
}

/**
 * 解析实际生效的 relay URL。优先级：用户配置 relayUrl > policy.relayMode 决策。
 * self-hosted 无 URL 时用 DEFAULT_RELAY_URL 兜底。
 */
export function resolveRelayUrl(
  syncConfig: { relayUrl?: string | null; relayMode?: RelayMode },
  policy: Pick<SyncPolicy, 'relayMode' | 'relayUrl'> = DEFAULT_SYNC_POLICY,
): string {
  if (typeof syncConfig.relayUrl === 'string' && syncConfig.relayUrl.trim() !== '') {
    return syncConfig.relayUrl;
  }
  const mode = syncConfig.relayMode ?? policy.relayMode;
  if (mode === 'self-hosted') {
    return policy.relayUrl || DEFAULT_RELAY_URL;
  }
  return DEFAULT_RELAY_URL;
}

/** 校验设备数量是否仍在配额内。true=可继续配对。 */
export function canPairMoreDevices(
  currentPairedCount: number,
  policy: Pick<SyncPolicy, 'maxDevices'> = DEFAULT_SYNC_POLICY,
): boolean {
  if (!shouldLimitDevices(policy)) return true;
  return currentPairedCount < (policy.maxDevices ?? 0);
}

/** 返回需要同步（full 或 metadata-only）的 recordType 子集。 */
export function filterSyncableRecordTypes(
  recordTypes: readonly string[],
  policy: Pick<SyncPolicy, 'syncScope'> = DEFAULT_SYNC_POLICY,
): string[] {
  return recordTypes.filter((t) => {
    const scope = policy.syncScope[t];
    return scope === 'full' || scope === 'metadata-only';
  });
}
