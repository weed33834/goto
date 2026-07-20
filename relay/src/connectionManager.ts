import { WebSocket } from 'ws';
import { RelayStore } from './store';

export class ConnectionManager {
  private connections = new Map<string, WebSocket>();
  private pairingRooms = new Map<string, Map<string, WebSocket>>();

  constructor(private store: RelayStore) {}

  add(ws: WebSocket, deviceId: string, targetDeviceId: string, pairingCode?: string): void {
    const key = `${deviceId}:${targetDeviceId}`;
    const existing = this.connections.get(key);
    if (existing && existing !== ws) {
      // supersede 旧连接：先调用 remove 清理 connections / pairingRooms 中的旧引用，
      // 再关闭旧 ws，避免旧连接残留导致消息错路由。
      this.remove(existing);
      try {
        existing.close(1000, 'superseded');
      } catch {
        /* ignore close errors on stale connections */
      }
    }
    this.connections.set(key, ws);

    if (pairingCode) {
      const room = this.pairingRooms.get(pairingCode) ?? new Map<string, WebSocket>();
      room.set(deviceId, ws);
      this.pairingRooms.set(pairingCode, room);
    }

    const queued = this.store.dequeueFrames(deviceId, targetDeviceId);
    for (const frame of queued) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(frame.payload);
      }
    }
  }

  remove(ws: WebSocket): void {
    for (const [key, value] of this.connections) {
      if (value === ws) {
        this.connections.delete(key);
        break;
      }
    }
    for (const [code, room] of this.pairingRooms) {
      for (const [deviceId, value] of room) {
        if (value === ws) {
          room.delete(deviceId);
          break;
        }
      }
      if (room.size === 0) {
        this.pairingRooms.delete(code);
      }
    }
  }

  forward(
    senderDeviceId: string,
    targetDeviceId: string,
    payload: Buffer,
    pairingCode?: string
  ): void {
    const key = `${targetDeviceId}:${senderDeviceId}`;
    const ws = this.connections.get(key);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      return;
    }

    if (pairingCode) {
      const room = this.pairingRooms.get(pairingCode);
      if (room) {
        for (const [deviceId, peerWs] of room) {
          if (deviceId !== senderDeviceId && peerWs.readyState === WebSocket.OPEN) {
            peerWs.send(payload);
            return;
          }
        }
      }
    }

    this.store.enqueueFrame(targetDeviceId, senderDeviceId, payload);
  }
}
