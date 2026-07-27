// 移动端 E2EE 同步运行时编排 hook —— 粘合 slice 纯状态与 pairingService 副作用。
// 组件层只消费本 hook，不直接 import pairingService。取消配对时通过包装
// createWebSocket 捕获最新 WS 并 close()，触发 transport onClose → finish() →
// session/outbox destroy → Promise reject，不破坏 pairingService 接口。

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import {
  generatePairingCode,
  respondToPairing,
  claimPairingCodeAndPair,
  relayHttpUrlToWsUrl,
  createSecureTokenStorage,
  type PairingResult,
  type WebSocketFactory,
} from '../sync/pairingService';
import { loadDeviceIdentity } from '../sync/syncIdentity';
import type { DeviceIdentity } from '../sync/syncIdentity';
import { RelayTransport } from '../sync/relayTransport';
import type { WebSocketLike } from '../sync/relayTransport';
import { SyncSession } from '../sync/syncSession';
import { SyncEngine } from '../sync/syncEngine';
import {
  loadSyncMasterKey,
  createPersistentSyncStore,
  createTrustedKeyLookup,
} from '../sync/syncStorage';
import { createSyncRecordApplier } from '../sync/syncRecordApplier';
import type { PairedDevice } from '../types';

export interface UseSyncRuntimeResult {
  /** 设备身份（异步加载，加载中为 null）。 */
  identity: DeviceIdentity | null;
  /** 身份是否仍在加载（首次进入面板时为 true）。 */
  identityLoading: boolean;
  /** 加载身份/SMK 时遇到的错误（用户可读）。null 表示无错误。 */
  bootstrapError: string | null;

  /** 是否正在执行配对（responder 等待握手 / initiator 等待 SMK）。 */
  pairingInFlight: boolean;

  /**
   * 确保设备身份 + SMK 已就绪。组件挂载时调用一次；UI 触发配对前再调用一次兜底。
   * 多次调用安全：内部通过 slice 的 in-flight Promise 去重。
   */
  ensureReady: () => Promise<void>;

  /**
   * 启动 responder 配对：本机生成 8 位码并展示，等待对端认领。
   * 调用前 relayUrl 必须已配置。
   */
  startResponderPairing: () => Promise<void>;

  /**
   * 启动 initiator 配对：用户输入对端展示的 8 位码，本机认领并接收 SMK。
   * 调用前 relayUrl 必须已配置。
   */
  startInitiatorPairing: (code: string) => Promise<void>;

  /**
   * 取消进行中的配对。强制关闭 WS 并把 slice.paring 重置为 inactive。
   * 即使没有进行中的配对也安全调用。
   */
  cancelPairing: () => void;

  /** 移除已配对设备。 */
  removeDevice: (deviceId: string) => Promise<void>;

  /** 重置 E2EE 同步：清空 pairedDevices + 删除 SMK + 切回 http-rest。 */
  resetAll: () => Promise<void>;

  /** UI 友好别名（SyncSettingsPanel 等组件用）：等价于 startResponderPairing。 */
  addDevice: () => Promise<void>;
  /** UI 友好别名：等价于 startInitiatorPairing。 */
  joinDevice: (code: string) => Promise<void>;
  /** UI 友好别名：等价于 resetAll。 */
  resetSync: () => Promise<void>;
}

/**
 * 校验 relayUrl 形如 `http(s)://host[:port]`，避免后续 fetch 抛模糊错误。
 * 不做深度 URL 校验——只挡住明显错误的输入（空串、缺协议、缺 host）。
 */
function isValidRelayUrl(url: string): boolean {
  if (!url) return false;
  return /^https?:\/\/[^/\s]+(:\d+)?(\/[^\s]*)?$/.test(url);
}

export function useSyncRuntime(): UseSyncRuntimeResult {
  // 直接从 store 读取 slice 字段；订阅机制由 zustand 处理
  const ensureDeviceIdentity = useAppStore((s) => s.ensureDeviceIdentity);
  const ensureSyncMasterKey = useAppStore((s) => s.ensureSyncMasterKey);
  const startPairing = useAppStore((s) => s.startPairing);
  const setPairingCode = useAppStore((s) => s.setPairingCode);
  const setPairingError = useAppStore((s) => s.setPairingError);
  const cancelPairingState = useAppStore((s) => s.cancelPairing);
  const addPairedDevice = useAppStore((s) => s.addPairedDevice);
  const removePairedDevice = useAppStore((s) => s.removePairedDevice);
  const resetE2EESync = useAppStore((s) => s.resetE2EESync);
  const setE2EESyncStatus = useAppStore((s) => s.setE2EESyncStatus);

  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [pairingInFlight, setPairingInFlight] = useState(false);

  // 当前进行中的配对 Promise（用于防止重复触发）。
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  // 当前活跃 WS 引用（用于 cancel 时强制 close）。
  const activeWsRef = useRef<WebSocketLike | null>(null);
  // cancel 标记：取消后续 onPaired 回写，避免取消后还把对端写进 pairedDevices。
  const cancelRequestedRef = useRef(false);
  // 已配对设备的同步引擎实例。配对成功后创建，设备移除/重置时销毁。
  // key = peerDeviceId，value = { engine, transport }。
  // engine 在 transport 创建时为 null（session 尚未建立），onSession 回调中补上。
  // 这样即便 relay 一直未连上或组件在 onSession 前卸载，transport 也能被 dispose。
  const enginesRef = useRef<
    Map<string, { engine: SyncEngine | null; transport: RelayTransport }>
  >(new Map());

  const ensureReady = useCallback(async (): Promise<void> => {
    setBootstrapError(null);
    try {
      // 1. 设备身份：先尝试加载已有，没有则由 slice 生成
      let id = await loadDeviceIdentity();
      if (!id) {
        await ensureDeviceIdentity('Goto Mobile');
        id = await loadDeviceIdentity();
      }
      if (id) {
        setIdentity(id);
      }
      // 2. SMK：确保本机有 SMK（首次生成；已存在则直接复用）
      await ensureSyncMasterKey();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBootstrapError(`初始化失败：${msg}`);
    } finally {
      setIdentityLoading(false);
    }
  }, [ensureDeviceIdentity, ensureSyncMasterKey]);

  // 首次挂载时拉取身份 + SMK。不阻塞渲染，加载完更新 state。
  useEffect(() => {
    void ensureReady();
  }, [ensureReady]);

  // 卸载时销毁所有同步引擎，避免 WS 长连接泄漏
  useEffect(() => {
    // 复制到局部变量：cleanup 运行时机晚于渲染，ref.current 可能已变更，
    // 捕获本次 effect 对应的引擎集合，避免清理到下一轮渲染的引擎。
    const engines = enginesRef.current;
    return () => {
      for (const [, entry] of engines) {
        entry.transport.destroy();
      }
      engines.clear();
    };
  }, []);

  /**
   * 包装 createWebSocket：捕获最新 WS 实例，便于 cancel 时主动 close。
   * 同时把 onclose 钩上 ref 清理，避免引用已关闭的 WS。
   */
  const wrapCreateWebSocket = useCallback((): WebSocketFactory => {
    return (url: string) => {
      // 用全局 WebSocket（RN 内置）；测试环境由 PairingOptions.createWebSocket 注入
      const ws = new WebSocket(url) as unknown as WebSocketLike;
      activeWsRef.current = ws;
      const origClose = ws.onclose;
      ws.onclose = (ev: unknown) => {
        if (activeWsRef.current === ws) {
          activeWsRef.current = null;
        }
        origClose?.(ev);
      };
      return ws;
    };
  }, []);

  /**
   * 把 PairingResult 转成 PairedDevice 写入 slice，并为该对端启动同步引擎。
   * cancelRequestedRef 为 true 时跳过——用户已主动取消，不应当作配对成功。
   */
  const handlePaired = useCallback(
    (peer: PairingResult) => {
      if (cancelRequestedRef.current) return;
      const now = Date.now();
      const device: PairedDevice = {
        deviceId: peer.peerDeviceId,
        name: peer.peerName,
        publicKeyPem: peer.peerPublicKeyPem,
        pairedAt: new Date(now),
        lastSeenAt: new Date(now),
      };
      addPairedDevice(device);
      setE2EESyncStatus('idle', null, null);
      // 配对成功后启动同步引擎（异步，fire-and-forget）
      void startSyncEngineForPeer(peer.peerDeviceId);
    },
    // startSyncEngineForPeer 在下方定义；deps 中引用它以保持闭包新鲜
    [addPairedDevice, setE2EESyncStatus],
  );

  /**
   * 为已配对设备创建 SyncSession + SyncEngine + RelayTransport 并触发首次同步。
   *
   * 流程：
   *   1. 加载 SMK / relay token / 设备身份
   *   2. 创建持久化 SyncStore（注入业务回写 applier）
   *   3. new RelayTransport → onSession 回调中 new SyncEngine
   *   4. session onReady → engine.triggerSync() 触发首次 manifest 交换
   *   5. 引擎实例存入 enginesRef，供 dispose 使用
   *
   * 重连场景：transport 自动重连时会再调 createSession + onSession，
   * onSession 中重建 engine（旧 engine 的 session 已 close，不会处理消息）。
   */
  const startSyncEngineForPeer = useCallback(
    async (deviceId: string): Promise<void> => {
      // 已有引擎则跳过（避免重复创建）
      if (enginesRef.current.has(deviceId)) return;

      if (!identity) {
        setE2EESyncStatus('error', '设备身份未就绪，无法启动同步', null);
        return;
      }

      const relayUrl = useAppStore.getState().syncConfig.relayUrl;
      if (!isValidRelayUrl(relayUrl ?? '')) {
        setE2EESyncStatus('error', 'relay 地址未配置', null);
        return;
      }

      // SMK：同步引擎需要它解密收到的记录
      const smk = await loadSyncMasterKey();
      if (!smk) {
        setE2EESyncStatus('error', 'SMK 未就绪，无法启动同步', null);
        return;
      }

      // relay token：transport 认证用
      const tokenStorage = createSecureTokenStorage();
      const token = (await tokenStorage.get()) ?? '';
      if (!token) {
        setE2EESyncStatus('error', 'relay token 未就绪，无法启动同步', null);
        return;
      }

      // 从 pairedDevices 派生 trusted key lookup（非配对握手校验对端公钥）
      const pairedDevices = useAppStore.getState().syncConfig.pairedDevices ?? [];
      const getTrustedPublicKey = createTrustedKeyLookup(pairedDevices);

      // 持久化 SyncStore + 业务回写 applier
      const applier = createSyncRecordApplier(useAppStore);
      const store = createPersistentSyncStore({ applier });
      const tables = ['tasks'];

      const wsUrl = relayHttpUrlToWsUrl(relayUrl as string);

      // engine 在 onSession 回调中赋值；createSession / onReady / onMessage
      // 的闭包通过此变量引用最新 engine（重连时 onSession 会重建 engine）。
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
                // 握手就绪：补发离线 outbox，然后触发首次同步
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
                // transport 会自动重连；这里不主动改状态，避免重连闪烁
              },
            },
          ),
        onSession: (s) => {
          // session 创建后（含重连重建）创建对应 engine
          engine = new SyncEngine(
            {
              session: s,
              smk,
              store,
              tables,
            },
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
          enginesRef.current.set(deviceId, { engine, transport });
        },
      });
      // 立即把 transport 登记进 enginesRef（engine 字段暂为 null，onSession 中补上）。
      // 这样即便 relay 一直未连上（onSession 不触发）或组件在 onSession 前卸载，
      // unmount cleanup / disposeSyncEngine 也能找到并 destroy 这个 transport。
      enginesRef.current.set(deviceId, { engine: null, transport });
    },
    [identity, setE2EESyncStatus],
  );

  /** 销毁指定对端的同步引擎（设备移除 / 重置时调用）。 */
  const disposeSyncEngine = useCallback((deviceId: string): void => {
    const entry = enginesRef.current.get(deviceId);
    if (entry) {
      entry.transport.destroy();
      enginesRef.current.delete(deviceId);
    }
  }, []);

  /** 销毁所有同步引擎（全部重置时调用）。 */
  const disposeAllSyncEngines = useCallback((): void => {
    for (const [, entry] of enginesRef.current) {
      entry.transport.destroy();
    }
    enginesRef.current.clear();
  }, []);

  const startResponderPairing = useCallback(async (): Promise<void> => {
    if (inFlightPromiseRef.current) {
      // 已有配对进行中，忽略重复触发
      return;
    }
    const relayUrl = useAppStore.getState().syncConfig.relayUrl;
    if (!isValidRelayUrl(relayUrl ?? '')) {
      setPairingError('请先配置有效的 relay 地址（以 http:// 或 https:// 开头）');
      return;
    }
    if (!identity) {
      setPairingError('设备身份尚未加载完成，请稍候重试');
      return;
    }

    cancelRequestedRef.current = false;
    startPairing('responder');
    setPairingInFlight(true);
    setPairingError(null);

    const wsUrl = relayHttpUrlToWsUrl(relayUrl as string);
    const tokenStorage = createSecureTokenStorage();

    const task = (async (): Promise<void> => {
      try {
        // 1. 创建配对码并展示给对端
        const codeResult = await generatePairingCode(
          relayUrl as string,
          identity,
          tokenStorage,
        );
        if (cancelRequestedRef.current) return;
        setPairingCode(codeResult.code, codeResult.expiresAt);

        // 2. 等待对端认领并完成握手；ready 后由 pairingService 发送 SMK
        const token = (await tokenStorage.get()) ?? '';
        await respondToPairing(wsUrl, token, codeResult.code, identity, handlePaired, {
          createWebSocket: wrapCreateWebSocket(),
        });
      } catch (err) {
        if (cancelRequestedRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setPairingError(msg);
      }
    })();

    inFlightPromiseRef.current = task;
    try {
      await task;
    } finally {
      inFlightPromiseRef.current = null;
      setPairingInFlight(false);
      // 配对结束（成功或失败）后清掉 slice 的 pairing 状态——
      // 成功路径 addPairedDevice 已重置；失败路径这里兜底
      if (!cancelRequestedRef.current) {
        const p = useAppStore.getState().pairing;
        if (p.active && !useAppStore.getState().syncConfig.pairedDevices?.length) {
          // 仅在未成功时才清；成功时 addPairedDevice 已清，避免覆盖
          cancelPairingState();
        }
      }
      cancelRequestedRef.current = false;
      activeWsRef.current = null;
    }
  }, [identity, startPairing, setPairingCode, setPairingError, handlePaired, wrapCreateWebSocket, cancelPairingState]);

  const startInitiatorPairing = useCallback(
    async (code: string): Promise<void> => {
      if (inFlightPromiseRef.current) return;
      const relayUrl = useAppStore.getState().syncConfig.relayUrl;
      if (!isValidRelayUrl(relayUrl ?? '')) {
        setPairingError('请先配置有效的 relay 地址（以 http:// 或 https:// 开头）');
        return;
      }
      if (!identity) {
        setPairingError('设备身份尚未加载完成，请稍候重试');
        return;
      }
      const trimmed = code.trim();
      if (!/^\d{8}$/.test(trimmed)) {
        setPairingError('配对码必须是 8 位数字');
        return;
      }

      cancelRequestedRef.current = false;
      startPairing('initiator');
      setPairingInFlight(true);
      setPairingError(null);

      const task = (async (): Promise<void> => {
        try {
          await claimPairingCodeAndPair(
            relayUrl as string,
            identity,
            trimmed,
            handlePaired,
            { createWebSocket: wrapCreateWebSocket() },
          );
        } catch (err) {
          if (cancelRequestedRef.current) return;
          const msg = err instanceof Error ? err.message : String(err);
          setPairingError(msg);
        }
      })();

      inFlightPromiseRef.current = task;
      try {
        await task;
      } finally {
        inFlightPromiseRef.current = null;
        setPairingInFlight(false);
        if (!cancelRequestedRef.current) {
          const p = useAppStore.getState().pairing;
          if (p.active && !useAppStore.getState().syncConfig.pairedDevices?.length) {
            cancelPairingState();
          }
        }
        cancelRequestedRef.current = false;
        activeWsRef.current = null;
      }
    },
    [identity, startPairing, setPairingError, handlePaired, wrapCreateWebSocket, cancelPairingState],
  );

  const cancelPairing = useCallback(() => {
    cancelRequestedRef.current = true;
    // 主动关闭 WS：transport 会触发 onClose → finish() → Promise reject → finally 清理
    const ws = activeWsRef.current;
    if (ws) {
      try {
        ws.close();
      } catch {
        // RN WebSocket close 偶发抛错（已关闭/连接中），吞掉
      }
      try {
        ws.terminate?.();
      } catch {
        // 同上
      }
    }
    cancelPairingState();
    setPairingInFlight(false);
    inFlightPromiseRef.current = null;
  }, [cancelPairingState]);

  const removeDevice = useCallback(
    async (deviceId: string): Promise<void> => {
      // 先销毁该对端的同步引擎，再从 slice 移除设备记录
      disposeSyncEngine(deviceId);
      await removePairedDevice(deviceId);
    },
    [removePairedDevice, disposeSyncEngine],
  );

  const resetAll = useCallback(async (): Promise<void> => {
    // 先销毁所有同步引擎 + 取消进行中的配对，避免 reset 后 in-flight 回写
    disposeAllSyncEngines();
    cancelPairing();
    await resetE2EESync();
    // SMK 被删除，smkReady 变 false；下次 ensureReady 会重新生成
    setIdentity((prev) => prev);
  }, [cancelPairing, resetE2EESync, disposeAllSyncEngines]);

  return {
    identity,
    identityLoading,
    bootstrapError,
    pairingInFlight,
    ensureReady,
    startResponderPairing,
    startInitiatorPairing,
    cancelPairing,
    removeDevice,
    resetAll,
    // UI 友好别名：SyncSettingsPanel 等组件用 addDevice/joinDevice/resetSync 命名。
    // 真实实现仍是上面的 startResponderPairing / startInitiatorPairing / resetAll。
    addDevice: startResponderPairing,
    joinDevice: startInitiatorPairing,
    resetSync: resetAll,
  };
}
