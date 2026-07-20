import { WebSocketServer, WebSocket, RawData } from 'ws';
import { RelayStore, MAX_FRAME_SIZE } from './store';
import { ConnectionManager } from './connectionManager';

const PING_INTERVAL_MS = Number(process.env.PING_INTERVAL_MS ?? 30_000);
const MAX_TARGET_LENGTH = 128;
const MAX_PAIRING_CODE_LENGTH = 32;
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS ?? 1000);
const MAX_CONNECTIONS_PER_IP = Number(process.env.MAX_CONNECTIONS_PER_IP ?? 10);
const IP_RATE_LIMIT_WINDOW_MS = Number(process.env.IP_RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_CONNECTIONS_PER_IP_WINDOW = Number(process.env.MAX_CONNECTIONS_PER_IP_WINDOW ?? 20);
export const SYNC_PATH = process.env.WS_PATH ?? '/sync';

function getClientIp(req: { headers: Record<string, unknown>; socket: { remoteAddress?: string } }): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    return xff.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function attachWsRelay(
  wss: WebSocketServer,
  store: RelayStore,
  connections: ConnectionManager
): void {
  const alive = new WeakMap<WebSocket, boolean>();
  const ipConnectionCounts = new Map<string, number>();
  const ipConnectionTimestamps = new Map<string, number[]>();

  function cleanupIpTracking(ip: string): void {
    const now = Date.now();
    const timestamps = ipConnectionTimestamps.get(ip);
    if (timestamps) {
      const windowStart = now - IP_RATE_LIMIT_WINDOW_MS;
      const recent = timestamps.filter(t => t > windowStart);
      if (recent.length === 0) {
        ipConnectionTimestamps.delete(ip);
        ipConnectionCounts.delete(ip);
      } else {
        ipConnectionTimestamps.set(ip, recent);
        ipConnectionCounts.set(ip, recent.length);
      }
    }
  }

  wss.on('connection', (ws, req) => {
    const clientIp = getClientIp(req);
    const now = Date.now();

    if (wss.clients.size >= MAX_CONNECTIONS) {
      console.log(`[relay] Connection rejected: global connection limit reached (${MAX_CONNECTIONS})`);
      ws.close(1013, 'server busy');
      return;
    }

    cleanupIpTracking(clientIp);
    const currentCount = ipConnectionCounts.get(clientIp) ?? 0;
    const timestamps = ipConnectionTimestamps.get(clientIp) ?? [];

    if (currentCount >= MAX_CONNECTIONS_PER_IP) {
      console.log(`[relay] Connection rejected from ${clientIp}: per-IP connection limit reached (${MAX_CONNECTIONS_PER_IP})`);
      ws.close(1008, 'too many connections from your IP');
      return;
    }

    const windowStart = now - IP_RATE_LIMIT_WINDOW_MS;
    const recentConnections = timestamps.filter(t => t > windowStart);
    if (recentConnections.length >= MAX_CONNECTIONS_PER_IP_WINDOW) {
      console.log(`[relay] Connection rate limited from ${clientIp}: too many connection attempts`);
      ws.close(1008, 'rate limited');
      return;
    }

    timestamps.push(now);
    ipConnectionTimestamps.set(clientIp, timestamps);
    ipConnectionCounts.set(clientIp, currentCount + 1);

    const url = new URL(req.url ?? '', 'http://localhost');
    const targetDeviceId = url.searchParams.get('target');
    const pairingCode = url.searchParams.get('pairingCode');

    if (
      (targetDeviceId !== null &&
        (targetDeviceId.length === 0 || targetDeviceId.length > MAX_TARGET_LENGTH)) ||
      (pairingCode !== null &&
        (pairingCode.length === 0 || pairingCode.length > MAX_PAIRING_CODE_LENGTH))
    ) {
      console.log(`[relay] WebSocket auth failed: invalid target or pairingCode query parameter`);
      ws.close(4001, 'invalid target or pairingCode');
      ipConnectionCounts.set(clientIp, (ipConnectionCounts.get(clientIp) ?? 1) - 1);
      return;
    }

    const authHeader = req.headers['authorization'];
    const authMatch = typeof authHeader === 'string' ? /^Bearer\s+(.+)$/i.exec(authHeader) : null;
    const queryToken = url.searchParams.get('token');

    if (!authMatch && !queryToken) {
      console.log(`[relay] WebSocket auth failed: missing Authorization header or token query param`);
      ws.close(4001, 'missing authorization');
      ipConnectionCounts.set(clientIp, (ipConnectionCounts.get(clientIp) ?? 1) - 1);
      return;
    }

    if (!targetDeviceId && !pairingCode) {
      console.log(`[relay] WebSocket auth failed: missing target or pairingCode query parameter`);
      ws.close(4001, 'missing target or pairingCode');
      ipConnectionCounts.set(clientIp, (ipConnectionCounts.get(clientIp) ?? 1) - 1);
      return;
    }

    const token = authMatch ? authMatch[1] : queryToken!;
    const deviceId = store.validateToken(token);
    if (!deviceId) {
      console.log(`[relay] WebSocket auth failed: invalid token`);
      ws.close(4001, 'invalid token');
      ipConnectionCounts.set(clientIp, (ipConnectionCounts.get(clientIp) ?? 1) - 1);
      return;
    }

    if (pairingCode && !store.validatePairingCodeForWs(pairingCode)) {
      console.log(`[relay] WebSocket auth failed: invalid or expired pairingCode`);
      ws.close(4001, 'invalid pairingCode');
      ipConnectionCounts.set(clientIp, (ipConnectionCounts.get(clientIp) ?? 1) - 1);
      return;
    }

    alive.set(ws, true);
    connections.add(ws, deviceId, targetDeviceId ?? '', pairingCode ?? undefined);

    ws.on('ping', () => {
      ws.pong();
    });

    ws.on('pong', () => {
      alive.set(ws, true);
    });

    ws.on('message', (data: RawData) => {
      const buffer = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data);
      if (buffer.length > MAX_FRAME_SIZE) {
        ws.close(1009, 'frame too large');
        return;
      }
      connections.forward(deviceId, targetDeviceId ?? '', buffer, pairingCode ?? undefined);
    });

    const handleClose = () => {
      connections.remove(ws);
      const count = ipConnectionCounts.get(clientIp);
      if (count !== undefined) {
        const newCount = count - 1;
        if (newCount <= 0) {
          ipConnectionCounts.delete(clientIp);
        } else {
          ipConnectionCounts.set(clientIp, newCount);
        }
      }
    };

    ws.on('close', handleClose);

    ws.on('error', () => {
      handleClose();
      try {
        ws.terminate();
      } catch {
        /* ignore terminate errors on already-closed sockets */
      }
    });
  });

  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, PING_INTERVAL_MS);

  wss.on('close', () => clearInterval(interval));
}
