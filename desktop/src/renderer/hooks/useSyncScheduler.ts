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
} from '../../shared/sync/syncStorage';
import { createSyncRecordApplier } from '../../shared/sync/syncRecordApplier';
import {
  relayHttpUrlToWsUrl,
  createSecureTokenStorage,
} from '../../shared/sync/pairingService';
import { loadDeviceIdentity } from '../../shared/sync/syncIdentity';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟周期同步

function isValidRelayUrl(url: string): boolean {
  return /^https?:\/\/[^/\s]+(:\d+)?(\/[^\s]*)?$/.test(url);
}

interface EngineEntry {
  engine: SyncEngine | null;
  transport: RelayTransport;
}

/**
 * App 顶层挂载。返回 { syncNow } 供 UI 触发即时同步。
 * 内部维持 enginesRef,生命周期跟随 pairedDevices 变化。
 */
export function useSyncScheduler(): { syncNow: () => void } {
  const pairedDevices = useAppStore((s) => s.syncConfig.pairedDevices ?? []);
  const setE2EESyncStatus = useAppStore((s) => s.setE2EESyncStatus);

  const enginesRef = useRef<Map<string, EngineEntry>>(new Map());
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      const tables = ['tasks'];

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
            },
          );
          const existing = enginesRef.current.get(deviceId);
          if (existing) {
            enginesRef.current.set(deviceId, { engine, transport: existing.transport });
          }
        },
      });

      enginesRef.current.set(deviceId, { engine: null, transport });
    },
    [setE2EESyncStatus],
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
