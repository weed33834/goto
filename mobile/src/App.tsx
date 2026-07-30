import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAppStore } from '@shared/store';
import AppShell from './components/AppShell';
import TodayView from './components/TodayView';
import TasksView from './components/TasksView';
import BoardView from './components/BoardView';
import VaultView from './components/VaultView';
import SyncView from './components/SyncView';

export default function App() {
  const loadData = useAppStore((s) => s.loadData);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 启动即从 IndexedDB 载入本地数据(与 desktop 启动流程一致)。
    loadData()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          // 加载失败也不阻塞 UI:本地优先应用允许空库启动。
          console.warn('[goto-mobile] loadData failed, starting with empty store', error);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-ink text-paper">
        <p className="text-sm-2 text-paper/70">加载中…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<TodayView />} />
        <Route path="/today" element={<TodayView />} />
        <Route path="/tasks" element={<TasksView />} />
        <Route path="/board" element={<BoardView />} />
        <Route path="/vault" element={<VaultView />} />
        <Route path="/sync" element={<SyncView />} />
        <Route path="*" element={<TodayView />} />
      </Route>
    </Routes>
  );
}
