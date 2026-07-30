import { defineConfig, devices } from '@playwright/test';

// 移动端 e2e:用 iPhone 视口验证"本地优先"核心闭环(加载 → 新增 → 完成)。
// 不依赖后端(apiAvailable 默认 false,任务只落本地 IndexedDB)。
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // 模拟手机:视口 + 触摸 + 安全区,验证移动端适配真实生效。
    ...devices['iPhone 13'],
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  // 先 build 再用 preview 起静态服务,贴近真实 PWA 产物。
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
