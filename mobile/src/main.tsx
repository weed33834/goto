import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

// 移动端用 HashRouter 与桌面端一致(/#/today 等),便于 PWA 静态托管。
const container = document.getElementById('root');
if (!container) throw new Error('未找到 #root 挂载点');

createRoot(container).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
