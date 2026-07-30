import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// @shared 指向 desktop 的共享内核源码 —— 业务内核单一真相源。
// 移动端不复制业务代码,只复用 store / types / api / sync / crypto / utils。
// 刻意不暴露 desktop/src 根(含旧桌面端 renderer),避免旧桌面端内容参与移动端。
const sharedAlias = path.resolve(__dirname, '../desktop/src/shared');

// PWA:移动端可"添加到主屏",standalone 全屏运行。
// Service Worker 缓存 App Shell;不缓存动态 API / sync 路径(本地优先应用)。
const pwaConfig = VitePWA({
  registerType: 'autoUpdate',
  // 用外部脚本注册 SW(CSP 不允许 inline script)。
  injectRegister: 'script',
  manifest: {
    name: 'Goto 移动端 — 本地优先加密任务管理',
    short_name: 'Goto',
    description: '移动端专属适配:底部导航、触摸手势、本地优先加密。',
    theme_color: '#0E1117',
    background_color: '#0E1117',
    display: 'standalone',
    orientation: 'portrait',
    scope: '/',
    start_url: '/',
    lang: 'zh-CN',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: '今日', url: '/#/today' },
      { name: '任务', url: '/#/tasks' },
      { name: '看板', url: '/#/board' },
      { name: '保险库', url: '/#/vault' },
      { name: '同步', url: '/#/sync' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api\//, /^\/ws\//],
    runtimeCaching: [
      {
        // 同源 /assets/ 静态资源:长缓存(带 hash 文件名)。
        urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
        handler: 'CacheFirst',
        options: {
          cacheName: 'goto-mobile-assets',
          expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
    ],
  },
  devOptions: { enabled: false },
});

export default defineConfig({
  plugins: [react(), pwaConfig],
  resolve: {
    alias: { '@shared': sharedAlias },
    // 单一 React / Zustand 实例,避免桌面内核与移动端重复打包导致 hooks 失效。
    dedupe: ['react', 'react-dom', 'react-router-dom', 'zustand'],
  },
  // 移动端独立入口(不是桌面 renderer)。
  root: path.resolve(__dirname, 'src'),
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
  },
});
