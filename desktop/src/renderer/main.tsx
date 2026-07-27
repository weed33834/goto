import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initWebAPI } from './lib/webAPI';
import { loadStoredApiBaseUrl } from '../shared/api/config';

// 初始化 Web API:替代 Electron preload 的 IPC 桥,
// 让 renderer 直接通过 IndexedDB 读写数据(纯 Web 应用模式)。
initWebAPI();

// P0-2:启动时从持久化存储加载用户配置的后端 URL,应用到运行时。
// 不 await —— 失败时退化为 env/默认值,不阻塞首屏渲染。
void loadStoredApiBaseUrl().catch(() => {
  /* 存储不可用时静默降级 */
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 注：app:lock / app:newTask 事件统一由 App.tsx 的 useEffect
// 注册并在卸载时清理。之前在模块级重复注册会导致 main.tsx 与 App.tsx 各触发一次，
// lock 重复调用（M-1）。已移除此处重复注册。
