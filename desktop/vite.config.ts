import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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
          'vendor-utils': ['zustand', 'date-fns', 'clsx', 'tailwind-merge', 'lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
