// useSyncScheduler — App 启动时自动为已配对设备启动 SyncEngine,并周期触发同步。
//
// 背景:
// 之前 useSyncRuntime 只在 SyncSettingsPanel 内挂载,且仅处理配对流程,
// 不负责已配对设备的持续同步。SyncEngine 类 0 生产调用点,
// webAPI.syncNow 也是空操作。结果:用户配对成功后数据不会自动同步。
//
// 本 hook 在 App 顶层挂载,职责:
// - 监听 syncConfig.pairedDevices 变化,为新对端启动 SyncEngine + RelayTransport
// - 移除对端时销毁对应 engine/transport
// - 周期触发 triggerSync(默认 5 分钟)
// - 暴露 syncNow() 给 UI(设置页"立即同步"按钮)调用
// - unmount 时清理所有 transport
//
// 不负责配对流程 — 那仍是 useSyncRuntime 的职责。
import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../shared/store';
import { RelayTransport } from '../../shared/sync/relayTransport';
import { SyncSession } from '../../shared/sync/syncSession';
import { SyncEngine } from '../../shared/sync/syncEngine';
import {
  loadSyncMasterKey,
  createPersistentSyncStore,
  createTrustedKeyLookup,
  type SyncStore,
} from '../../shared/sync/syncStorage';
import { createSyncRecordApplier } from '../../shared/sync/syncRecordApplier';
import {
  relayHttpUrlToWsUrl,
  createSecureTokenStorage,
} from '../../shared/sync/pairingService';
import { loadDeviceIdentity } from '../../shared/sync/syncIdentity';
import type { Bytes } from '../../shared/sync/bytes';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟周期同步

function isValidRelayUrl(url: string): boolean {
  return /^https?:\/\/[^/\s]+(:\d+)?(\/[^\s]*)?$/.test(url);
}

interface EngineEntry {
  engine: SyncEngine | null;
  transport: RelayTransport;
  /**
   * P1-3:冲突回滚所需的 store + smk 引用。
   * 当用户选择"恢复本地"时,用 store.applyRecord(localRecord, smk) 把本地版本重新落库 + 回写业务层。
   * smk 在所有配对设备间共享(配对时通过 SMK_TRANSFER 同步),故任一 engine 的 smk 均可解密任一 record。
   */
  store: SyncStore | null;
  smk: Bytes | null;
}

/**
 * App 顶层挂载。返回 { syncNow } 供 UI 触发即时同步。
 * 内部维持 enginesRef,生命周期跟随 pairedDevices 变化。
 */
export function useSyncScheduler(): { syncNow: () => void } {
  const pairedDevices = useAppStore((s) => s.syncConfig.pairedDevices ?? []);
  const setE2EESyncStatus = useAppStore((s) => s.setE2EESyncStatus);
  // P1-3:订阅 pendingConflicts,在 resolution 变化时执行回滚/标记 applied。
  const pendingConflicts = useAppStore((s) => s.pendingConflicts);
  const pushConflict = useAppStore((s) => s.pushConflict);
  const markConflictApplied = useAppStore((s) => s.markConflictApplied);

  const enginesRef = useRef<Map<string, EngineEntry>>(new Map());
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 已处理过的 conflictId 集合,避免 effect 重跑时重复回滚同一冲突。
  // 不依赖 pendingConflicts.applied 是因为:回滚是异步的,set applied 前 effect 可能再跑。
  const appliedConflictIdsRef = useRef<Set<string>>(new Set());

  /** 为单个对端启动 SyncEngine + RelayTransport。已有则跳过。 */
  const startEngineForPeer = useCallback(
    async (deviceId: string): Promise<void> => {
      if (enginesRef.current.has(deviceId)) return;

      const state = useAppStore.getState();
      const relayUrl = state.syncConfig.relayUrl;
      if (!relayUrl || !isValidRelayUrl(relayUrl)) {
        setE2EESyncStatus('error', 'relay 地址未配置,无法启动同步', deviceId);
        return;
      }

      const identity = await loadDeviceIdentity();
      if (!identity) {
        setE2EESyncStatus('error', '设备身份未就绪,无法启动同步', deviceId);
        return;
      }

      const smk = await loadSyncMasterKey();
      if (!smk) {
        setE2EESyncStatus('error', 'SMK 未就绪,无法启动同步', deviceId);
        return;
      }

      const tokenStorage = createSecureTokenStorage();
      const token = (await tokenStorage.get()) ?? '';
      if (!token) {
        setE2EESyncStatus('error', 'relay token 未就绪,无法启动同步', deviceId);
        return;
      }

      // trusted key lookup:从当前 pairedDevices 派生(对端公钥校验)
      const currentPaired = useAppStore.getState().syncConfig.pairedDevices ?? [];
      const getTrustedPublicKey = createTrustedKeyLookup(currentPaired);

      // 持久化 SyncStore + 业务回写 applier(把 SyncRecord 解密后写回 useAppStore)
      const applier = createSyncRecordApplier(useAppStore);
      const store = createPersistentSyncStore({ applier });
      const tables = ['tasks', 'projects', 'categories', 'tags', 'vault_items'];

      const wsUrl = relayHttpUrlToWsUrl(relayUrl);
      let engine: SyncEngine | null = null;

      setE2EESyncStatus('connecting', null, deviceId);

      const transport = new RelayTransport({
        url: wsUrl,
        token,
        role: 'initiator',
        peerDeviceId: deviceId,
        createSession: () =>
          new SyncSession(
            {
              identity,
              isInitiator: true,
              isPairing: false,
              getTrustedPublicKey,
            },
            {
              onSendFrame: (mode, payload) => {
                transport?.sendFrame(mode, payload);
              },
              onReady: () => {
                transport?.flushOutbox();
                engine?.triggerSync();
              },
              onMessage: (msg) => {
                engine?.handleMessage(msg);
              },
              onError: (err) => {
                setE2EESyncStatus('error', err.message, deviceId);
              },
              onClose: () => {
                // transport 自动重连,不改 status 避免闪烁
              },
            },
          ),
        onSession: (s) => {
          engine = new SyncEngine(
            { session: s, smk, store, tables },
            {
              onComplete: () => {
                setE2EESyncStatus('success', null, deviceId);
              },
              onError: (err) => {
                setE2EESyncStatus('error', err.message, deviceId);
              },
              onClose: () => {
                setE2EESyncStatus('idle', null, null);
              },
              // P1-3:SyncEngine 检测到版本向量互不支配时回调。
              // remote 已被自动落库(数据不丢),此处把 local/remote 快照推入
              // pendingConflicts,供 ConflictDialog 展示并让用户选择"恢复本地"。
              // deviceVersion 已内嵌在 SyncRecord 中,无需额外冗余字段。
              onConcurrentWrite: (info) => {
                pushConflict({
                  recordId: info.recordId,
                  tableName: info.tableName,
                  peerDeviceId: deviceId,
                  localRecord: info.localRecord,
                  remoteRecord: info.remoteRecord,
                });
              },
            },
          );
          const existing = enginesRef.current.get(deviceId);
          if (existing) {
            // 保留 transport/store/smk,仅替换 engine 引用(从 null → 实例)。
            enginesRef.current.set(deviceId, {
              engine,
              transport: existing.transport,
              store: existing.store,
              smk: existing.smk,
            });
          }
        },
      });

      // P1-3:初始 entry 暂存 store/smk,engine 在 onSession 回调中回填。
      // 回滚时按 peerDeviceId 查 entry,取 store+smk 调 applyRecord(localRecord)。
      enginesRef.current.set(deviceId, { engine: null, transport, store, smk });
    },
    [setE2EESyncStatus, pushConflict],
  );

  /** 销毁单个对端的 engine + transport。 */
  const disposeEngine = useCallback((deviceId: string): void => {
    const entry = enginesRef.current.get(deviceId);
    if (entry) {
      try { entry.transport.destroy(); } catch { /* ignore */ }
      enginesRef.current.delete(deviceId);
    }
  }, []);

  /** pairedDevices 变化时,为新增对端启动 engine,为已移除对端销毁 engine。 */
  useEffect(() => {
    const currentIds = new Set(pairedDevices.map((d) => d.deviceId));
    // 销毁已移除的
    for (const id of Array.from(enginesRef.current.keys())) {
      if (!currentIds.has(id)) {
        disposeEngine(id);
      }
    }
    // 启动新增的(fire-and-forget,失败由 startEngineForPeer 内部 setE2EESyncStatus 上报)
    for (const id of currentIds) {
      if (!enginesRef.current.has(id)) {
        void startEngineForPeer(id);
      }
    }
  }, [pairedDevices, startEngineForPeer, disposeEngine]);

  /** 周期触发同步(每 5 分钟)。 */
  useEffect(() => {
    if (pairedDevices.length === 0) {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      return;
    }
    syncIntervalRef.current = setInterval(() => {
      for (const [, entry] of enginesRef.current) {
        try { entry.engine?.triggerSync(); } catch { /* ignore */ }
      }
    }, SYNC_INTERVAL_MS);
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [pairedDevices.length]);

  /**
   * P1-3:冲突回滚调度。监听 pendingConflicts,对 resolution='local' 的冲突
   * 用 localRecord 重新落库 + 回写业务层(覆盖被 remote 覆盖的本地版本)。
   *
   * 回滚幂等性:用 appliedConflictIdsRef 记录已处理的 conflictId,避免 effect
   * 因 pendingConflicts 引用变化重跑时重复 apply(applyRecord 本身是 upsert,
   * 重复 apply 不会损坏数据,但会重复触发业务 setState 导致无谓渲染)。
   *
   * resolution='remote' 的冲突在 setConflictResolution 中已标记 applied=true,
   * 此处跳过。localRecord 为 null(理论不应发生,因 concurrent 要求双方都有记录)
   * 或 engine 已销毁(对端移除)时,直接 markApplied 避免无限挂起。
   */
  useEffect(() => {
    for (const conflict of pendingConflicts) {
      if (conflict.resolution !== 'local') continue;
      if (conflict.applied) continue;
      if (appliedConflictIdsRef.current.has(conflict.id)) continue;
      appliedConflictIdsRef.current.add(conflict.id);

      const entry = enginesRef.current.get(conflict.peerDeviceId);
      // engine 已销毁或 localRecord 缺失:无法回滚,标记 applied 让 UI 可清理。
      if (!entry?.store || !entry?.smk || !conflict.localRecord) {
        markConflictApplied(conflict.id);
        continue;
      }

      const { store, smk } = entry;
      const localRecord = conflict.localRecord;
      void (async () => {
        try {
          // applyRecord = insertRecord(覆盖 remote 密文) + applier(回写业务层明文)。
          // 回滚后本地版本恢复,下次同步会以 localRecord 的 updatedAt/deviceVersion
          // 与对端再裁决(此时 local 的版本向量已包含本设备此次"恢复"决策,
          // 但因我们没递增 deviceVersion,对端可能再次判 concurrent —— 用户需手动
          // 触发同步让对端也拉取该版本。这是 P1-3 的可接受折衷,完整自动收敛需 P2)。
          await store.applyRecord(localRecord, smk);
        } catch (err) {
          // 回滚失败不阻塞:记录错误,conflict 仍标记 applied 避免无限重试。
          // 用户可在设置页查看任务实际状态后手动调整。
          console.error('[useSyncScheduler] 冲突回滚失败:', err);
        } finally {
          markConflictApplied(conflict.id);
        }
      })();
    }
  }, [pendingConflicts, markConflictApplied]);

  /** unmount 时清理所有 transport。 */
  useEffect(() => {
    const engines = enginesRef.current;
    return () => {
      for (const [, entry] of engines) {
        try { entry.transport.destroy(); } catch { /* ignore */ }
      }
      engines.clear();
    };
  }, []);

  /** UI 调用:立即触发所有 engine 的 triggerSync。 */
  const syncNow = useCallback(() => {
    for (const [, entry] of enginesRef.current) {
      try { entry.engine?.triggerSync(); } catch { /* ignore */ }
    }
  }, []);

  return { syncNow };
}
