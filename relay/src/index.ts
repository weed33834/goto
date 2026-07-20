#!/usr/bin/env node
import { createRelayServer } from './server';

const DEFAULT_PORT = 8787;
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000);

const port = parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
const publicWsUrl = process.env.PUBLIC_WS_URL;
const host = process.env.HOST;

const relay = createRelayServer({ port, publicWsUrl, host });

relay.start()
  .then(() => {
    // 启动日志已在 server.ts 内打印，此处不再重复输出，避免双份日志
  })
  .catch((err) => {
    console.error('[relay] failed to start', err);
    process.exit(1);
  });

function shutdown() {
  // 强制超时退出兜底：避免 stop() 在 ws.close / server.close 上永久挂起导致进程僵死。
  // unref() 保证该定时器不阻止事件循环正常退出。
  const forceExit = setTimeout(() => {
    console.error('[relay] shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  relay
    .stop()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[relay] stop failed', err);
      process.exit(1);
    });
}

// 异常退出：先尝试优雅 stop() 再 exit(1)，复用 shutdown 的超时兜底模式
function forceShutdown() {
  const forceExit = setTimeout(() => {
    console.error('[relay] force shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  relay
    .stop()
    .then(() => process.exit(1))
    .catch((err) => {
      console.error('[relay] stop failed during force shutdown', err);
      process.exit(1);
    });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// 兜底：未捕获的同步异常与未处理的 Promise 拒绝，先调用 relay.stop() 清理资源再退出，
// 避免进程静默挂起或继续运行在异常状态。
process.on('uncaughtException', (err) => {
  console.error('[relay] uncaughtException', err);
  forceShutdown();
});

process.on('unhandledRejection', (reason) => {
  console.error('[relay] unhandledRejection', reason);
  forceShutdown();
});
