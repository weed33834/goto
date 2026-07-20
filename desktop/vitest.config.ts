import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    // 默认 node 环境;需要 DOM 的测试用文件顶部注释切换:
    //   // @vitest-environment jsdom
    environment: 'node',
    globals: true,
    // 清除 mock 调用历史与实现：避免跨测试累积导致 toHaveBeenCalled 次数错乱
    clearMocks: true,
    include: ['src/shared/**/*.test.ts', 'src/renderer/**/*.test.ts'],
    pool: 'forks',
  },
});
