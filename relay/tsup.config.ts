import { defineConfig } from 'tsup';

/**
 * Relay 生产构建配置(A6 §4.3 工具链锁定)
 *
 * 2 target 输出(对齐 §4.3 v3.1 修正):
 *   - CJS(node18):Relay 服务器运行时
 *   - ESM(es2022):未来 packages/core 共享层使用
 *
 * externals:express / cors / helmet / ws / express-rate-limit 等
 * Node 生态包不打包进 bundle,直接从 node_modules 引用,减小 bundle 体积、加快启动。
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node18',
  platform: 'node',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  // Node 生态依赖不打进 bundle
  external: [
    'express',
    'cors',
    'helmet',
    'ws',
    'express-rate-limit',
    'supertest',
  ],
  // 不拆分共享 chunk(Relay 单 entry,无意义)
  splitting: false,
  // 单文件 bundle,提升冷启动速度
  noExternal: [],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
