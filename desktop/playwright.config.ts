import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 配置 — Goto 桌面端(Vite + React + HashRouter)
 *
 * webServer 自动启动 `vite` dev server(port 5173),测试结束后自动关闭。
 * 测试目录 e2e/ 与 vitest 的 src/ 分离,避免 vitest 误收集 spec 文件。
 * 每个测试用例通过 page.addInitScript 预置 localStorage 跳过 Onboarding。
 * 首次运行需先 `pnpm exec playwright install chromium`。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // 共享 IndexedDB origin,串行避免数据竞争
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // 单 worker:所有测试共享同一个 origin,避免 IDB 冲突
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // 每个测试用全新 context(清空 IndexedDB + localStorage)
    // 确保测试隔离,不依赖前一个测试的副作用
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
