// 同步运行时编排 Hook —— 把已建好的 syncSlice 状态机与 pairingService 网络层接起来。
// 仅做编排：状态写进 syncSlice（pairing/e2eeSync/pairedDevices），实际 ECDH 握手与
// SMK 交换由 shared/sync/pairingService 完成。UI（SyncSettingsPanel）只读 store + 调本 hook。

import { useCallback } from 'react';
import { useAppStore } from '../../shared/store';
import {
  generatePairingCode,
  respondToPairing,
  claimPairingCodeAndPair,
  relayHttpUrlToWsUrl,
  createSecureTokenStorage,
  type PairingResult,
} from '../../shared/sync/pairingService';
import {
  loadDeviceIdentity,
  generateDeviceIdentity,
  type DeviceIdentity,
} from '../../shared/sync/syncIdentity';
import { DEFAULT_RELAY_URL } from '../../shared/sync/syncPolicy';

// 复用同一个 token 存储实例，保证 generatePairingCode 写入的 token 能被后续读取
const tokenStorage = createSecureTokenStorage();

// 设备身份懒加载：首次配对时生成并落盘，后续直接读取
async function getOrCreateIdentity(): Promise<DeviceIdentity> {
  const existing = await loadDeviceIdentity();
  if (existing) return existing;
  return generateDeviceIdentity(`Web-${Math.random().toString(36).slice(2, 6)}`);
}

// 把 pairingService 的 PairingResult 转成 store 里的 PairedDevice
function toPairedDevice(peer: PairingResult) {
  return {
    deviceId: peer.peerDeviceId,
    name: peer.peerName,
    publicKeyPem: peer.peerPublicKeyPem,
    pairedAt: new Date(),
    lastSeenAt: new Date(),
  };
}

export function useSyncRuntime() {
  // 发起方（host/responder）：本机生成配对码并展示，等待对端连接后发送 SMK
  const addDevice = useCallback(async () => {
    const store = useAppStore.getState();
    const relayUrl = store.syncConfig.relayUrl ?? DEFAULT_RELAY_URL;
    if (!relayUrl) {
      store.setPairingError('请先配置中继服务器地址');
      return;
    }
    try {
      // 响应方必须先有 SMK，握手 ready 后才能发送给对端
      await store.ensureSyncMasterKey();
      const identity = await getOrCreateIdentity();
      store.startPairing('responder');

      // 1. 在 relay 创建 8 位配对码（同时注册设备并落盘 token）
      const { code, expiresAt } = await generatePairingCode(relayUrl, identity, tokenStorage);
      store.setPairingCode(code, expiresAt);

      // 2. 监听对端连接：握手 ready 后发送本机 SMK。fire-and-forget，错误回写 store
      const wsUrl = relayHttpUrlToWsUrl(relayUrl);
      const token = (await tokenStorage.get()) ?? '';
      void respondToPairing(wsUrl, token, code, identity, (peer) => {
        useAppStore.getState().addPairedDevice(toPairedDevice(peer));
        useAppStore.getState().setE2EESyncStatus('success');
      }).catch((err) => {
        useAppStore.getState().setPairingError(err instanceof Error ? err.message : String(err));
      });
    } catch (err) {
      store.setPairingError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // 认领方（joiner/initiator）：输入对端展示的码，建立连接并接收 SMK
  const joinDevice = useCallback(async (code: string) => {
    const store = useAppStore.getState();
    const relayUrl = store.syncConfig.relayUrl ?? DEFAULT_RELAY_URL;
    if (!relayUrl) {
      store.setPairingError('请先配置中继服务器地址');
      return;
    }
    try {
      const identity = await getOrCreateIdentity();
      store.startPairing('initiator');
      await claimPairingCodeAndPair(relayUrl, identity, code, (peer) => {
        useAppStore.getState().addPairedDevice(toPairedDevice(peer));
        useAppStore.getState().setE2EESyncStatus('success');
      });
    } catch (err) {
      useAppStore.getState().setPairingError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const cancelPairing = useCallback(() => {
    useAppStore.getState().cancelPairing();
  }, []);

  const removeDevice = useCallback(async (deviceId: string) => {
    await useAppStore.getState().removePairedDevice(deviceId);
  }, []);

  const resetSync = useCallback(async () => {
    await useAppStore.getState().resetE2EESync();
  }, []);

  return { addDevice, joinDevice, cancelPairing, removeDevice, resetSync };
}
