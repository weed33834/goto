import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// PWA 配置:Service Worker + Web App Manifest
// - registerType: 'autoUpdate' — 应用有新版自动更新(SW 跳过 waiting)
// - manifest:安装到桌面/手机主屏,应用名 + 图标 + 启动 URL
// - workbox:运行时缓存策略 — App Shell 走 NetworkFirst(快速看到最新 UI),
//   静态资源(assets/)走 CacheFirst(长缓存),其他走 StaleWhileRevalidate
// - 不缓存 sync / API 等动态路径,避免本地优先应用读到旧数据
const pwaConfig = VitePWA({
  registerType: 'autoUpdate',
  // injectRegister: 'script' — 用外部脚本而非 inline 注册 SW
  // (CSP script-src 'self' 'wasm-unsafe-eval' 不允许 inline script)
  injectRegister: 'script',
  manifest: {
    name: 'Goto — 本地优先加密任务管理',
    short_name: 'Goto',
    description: '本地优先、端到端加密的私人时间资产管理器。数据在你的 IndexedDB,跨设备同步全程加密。',
    theme_color: '#3b2d8a',
    background_color: '#1f1b4d',
    display: 'standalone',
    orientation: 'any',
    scope: '/',
    start_url: '/',
    lang: 'zh-CN',
    icons: [
      {
        // 矢量图标 — 任意尺寸清晰,Chrome/Edge/Safari 17+ 支持 SVG manifest 图标。
        // 旧浏览器(PWA 安装提示)需要 PNG,但 Lighthouse PWA 审计在 SVG 下也能过。
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        // maskable 模式同样用 SVG(自带 padding 已在 viewBox 内)
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: '今日任务', url: '/#/today' },
      { name: '时间织锦', url: '/#/mosaic' },
      { name: '保险库', url: '/#/vault' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api\//, /^\/ws\//],
    runtimeCaching: [
      {
        // 同源 /assets/ 静态资源:CacheFirst(长缓存,带 hash 文件名)
        urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
        handler: 'CacheFirst',
        options: {
          cacheName: 'goto-assets',
          expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        // 同源其他文档:NetworkFirst(应用 shell 优先用最新版)
        urlPattern: ({ url }) => url.pathname === '/' || url.pathname.endsWith('.html'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'goto-app-shell',
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
        },
      },
    ],
  },
  devOptions: {
    enabled: false,
  },
});

export default defineConfig({
  plugins: [react(), pwaConfig],
  root: path.resolve(__dirname, 'src/renderer'),
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // A7+ 主 chunk 拆分:原 256KB 单包 → 拆为 vendor 三段
        // 框架 / 动画 / 工具,长缓存友好且首屏只载框架 + TodayPage chunk
        manualChunks: {
          // React 全家桶(稳定,长缓存)
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // framer-motion(动画库,体积大,单独拆)
          'vendor-motion': ['framer-motion'],
          // 状态 + 工具(轻量但多页面共享)
          'vendor-utils': ['zustand', 'date-fns', 'clsx', 'lucide-react'],
          // Phase 1.7:拖拽库单独拆(KanbanView + TaskList 共用)
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
