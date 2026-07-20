import http from 'http';
import express, { Express, Request, Response, NextFunction } from 'express';
import { WebSocketServer } from 'ws';
import helmet from 'helmet';
import cors from 'cors';
import { RelayStore } from './store';
import { createRoutes } from './routes';
import { ConnectionManager } from './connectionManager';
import { attachWsRelay, SYNC_PATH } from './wsRelay';

export interface RelayServerOptions {
  port: number;
  host?: string;
  publicWsUrl?: string;
}

export interface RelayServer {
  app: Express;
  server: http.Server;
  store: RelayStore;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createRelayServer(opts: RelayServerOptions): RelayServer {
  const app = express();

  // 信任一级反代，让 express-rate-limit 能读到 X-Forwarded-For
  app.set('trust proxy', 1);

  // 安全头中间件
  app.use(helmet());

  // CORS：origin 通过 ALLOWED_ORIGINS 配置，逗号分隔，默认 *
  const rawOrigin = process.env.ALLOWED_ORIGINS;
  const corsOrigin: string | string[] = rawOrigin
    ? rawOrigin.split(',').map((s) => s.trim()).filter(Boolean)
    : '*';
  app.use(cors({ origin: corsOrigin }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: SYNC_PATH });
  const store = new RelayStore();
  const connections = new ConnectionManager(store);
  // 注意：?? 只在 null/undefined 时兜底，docker-compose 把空串作为默认值会绕过兜底，
  // 因此显式判断空串，避免客户端拿到空 wsUrl。
  const publicWsUrl =
    opts.publicWsUrl && opts.publicWsUrl.length > 0
      ? opts.publicWsUrl
      : `ws://localhost:${opts.port}/sync`;
  const host = opts.host ?? '0.0.0.0';

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use(createRoutes(store, publicWsUrl));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[relay] unhandled error', err);
    const isDev = process.env.NODE_ENV === 'development';
    res.status(500).json({ error: isDev ? err.message : 'Internal server error' });
  });

  attachWsRelay(wss, store, connections);

  const cleanupInterval = setInterval(
    () => store.cleanup(),
    Number(process.env.CLEANUP_INTERVAL_MS ?? 60_000)
  );
  // unref 防止异常退出时定时器阻止进程退出
  cleanupInterval.unref();

  const start = (): Promise<void> =>
    new Promise((resolve) => {
      server.listen(opts.port, host, () => {
        console.log(`Goto relay listening on ${host}:${opts.port}`);
        console.log(`WebSocket path: ${publicWsUrl}`);
        resolve();
      });
    });

  const stop = (): Promise<void> =>
    new Promise((resolve) => {
      clearInterval(cleanupInterval);
      // 优雅关闭：先发 1001 close 帧，500ms 后 terminate 残留连接
      wss.clients.forEach((ws) => {
        try {
          ws.close(1001, 'server shutdown');
        } catch {
          /* ignore close errors */
        }
      });
      const forceTimer = setTimeout(() => {
        wss.clients.forEach((ws) => {
          try {
            ws.terminate();
          } catch {
            /* ignore terminate errors */
          }
        });
      }, 500);
      forceTimer.unref();
      wss.close(() => {
        server.close(() => {
          // connections 通过 wsRelay.ts 的 close 事件回调自动清理
          resolve();
        });
      });
    });

  return { app, server, store, start, stop };
}
