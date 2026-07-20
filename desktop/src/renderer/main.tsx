import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initWebAPI } from './lib/webAPI';

// 初始化 Web API:替代 Electron preload 的 IPC 桥,
// 让 renderer 直接通过 IndexedDB 读写数据(纯 Web 应用模式)。
initWebAPI();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 注：app:lock / app:newTask 事件统一由 App.tsx 的 useEffect
// 注册并在卸载时清理。之前在模块级重复注册会导致 main.tsx 与 App.tsx 各触发一次，
// lock 重复调用（M-1）。已移除此处重复注册。
