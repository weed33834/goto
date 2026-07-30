import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// 与 vite.config 保持一致的 @shared 别名,确保组件测试能解析桌面共享内核。
// 不暴露 desktop/src 根,避免旧桌面端 renderer 内容参与移动端测试。
const sharedAlias = path.resolve(__dirname, '../desktop/src/shared');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': sharedAlias },
    dedupe: ['react', 'react-dom', 'react-router-dom', 'zustand'],
  },
  test: {
    // 默认 node 环境;需要 DOM 的测试文件顶部用注释切换:
    //   // @vitest-environment jsdom
    environment: 'node',
    globals: true,
    // 清除 mock 调用历史,避免跨测试累积导致 toHaveBeenCalled 次数错乱。
    clearMocks: true,
    include: ['src/**/*.test.{ts,tsx}'],
    pool: 'forks',
    setupFiles: ['./src/test-setup.ts'],
  },
});
