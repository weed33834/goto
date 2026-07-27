import { lazy, Suspense, useEffect, useState, Component, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import { useSecuritySettingsStore } from './store/securitySettingsStore';
import { useAppStore } from '../shared/store';
import { usePrivacyMode } from './hooks/usePrivacyMode';
import { useAutoLock } from './hooks/useAutoLock';
import { useSyncScheduler } from './hooks/useSyncScheduler';
import { useReminders } from '../shared/hooks/useReminders';
import { useKeyboardShortcuts } from '../shared/hooks/useKeyboardShortcuts';
import { LockScreen } from './components/layout/LockScreen';
import { Sidebar } from './components/layout/Sidebar';
import { MobileHeader } from './components/layout/MobileHeader';
import { Toaster } from './components/common/Toaster';
import { KeyboardShortcutsHelp } from './components/common/KeyboardShortcutsHelp';
import { CommandPalette } from './components/common/CommandPalette';
// P1-3:同步冲突解决弹窗,订阅 activeModal === 'conflict-dialog'。
import { ConflictDialog } from './components/sync/ConflictDialog';
// useOnboarding 从独立文件导入,避免静态拉入 framer-motion 破坏 Onboarding 组件的 lazy chunk
import { useOnboarding } from './features/onboarding/useOnboarding';

// A9: Onboarding 3 屏引导懒加载(仅首次启动需要,§7.8 v3.2)
const Onboarding = lazy(() =>
  import('./features/onboarding/Onboarding').then((m) => ({ default: m.Onboarding })),
);

/**
 * ErrorBoundary — 捕获 lazy chunk 加载失败 / 组件运行时错误
 *
 * 用途:
 *   - lazy import 网络失败 / chunk 缺失时给重试机会,而非白屏
 *   - 子组件渲染异常隔离,不让整页崩溃
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReload = () => {
    this.setState({ error: null });
    // 强制重新加载 chunk
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      // lazy chunk 加载失败典型错误
      const isChunkError =
        this.state.error.name === 'ChunkLoadError' ||
        /Failed to fetch dynamically imported module|Loading chunk/.test(this.state.error.message);
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="text-base font-medium text-slate-700 dark:text-slate-200">
            {isChunkError ? '页面资源加载失败' : '页面渲染出错'}
          </div>
          <div className="max-w-md text-sm text-slate-500 dark:text-slate-400">
            {isChunkError
              ? '可能是网络中断或应用已更新。点击下方按钮重新加载。'
              : this.state.error.message}
          </div>
          <button
            onClick={this.handleReload}
            className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// A7: 路由懒加载 — 8 个页面全部 React.lazy,首屏只载 TodayPage chunk
// 原同步 import 会让首屏 bundle 直接吞掉 8 个页面(~180KB),违反 §8.5 首屏预算。
// A10: 新增 MosaicPage 懒加载(P0 核心机制 时间织锦)
const MosaicPage = lazy(() =>
  import('./pages/MosaicPage').then((m) => ({ default: m.MosaicPage })),
);
const TodayPage = lazy(() =>
  import('./pages/TodayPage').then((m) => ({ default: m.TodayPage })),
);
const CalendarPage = lazy(() =>
  import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const VaultPage = lazy(() =>
  import('./pages/VaultPage').then((m) => ({ default: m.VaultPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const ProjectsPage = lazy(() =>
  import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
);
const CategoriesPage = lazy(() =>
  import('./pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage })),
);
const TagsPage = lazy(() =>
  import('./pages/TagsPage').then((m) => ({ default: m.TagsPage })),
);
const SearchPage = lazy(() =>
  import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })),
);
// b1:智能列表(Filter DSL 查询页 + 已保存列表)
const SmartListPage = lazy(() =>
  import('./pages/SmartListPage').then((m) => ({ default: m.SmartListPage })),
);
// Phase 1.10 / 2.1 / 2.2 / 2.3:项目详情 / 看板 / 统计 / 回顾
const ProjectDetailPage = lazy(() =>
  import('./pages/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })),
);
const KanbanPage = lazy(() =>
  import('./pages/KanbanPage').then((m) => ({ default: m.KanbanPage })),
);
const InsightsPage = lazy(() =>
  import('./pages/InsightsPage').then((m) => ({ default: m.InsightsPage })),
);
const ReviewPage = lazy(() =>
  import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })),
);
// s1:加密时间胶囊 — 独立页,复用 VaultItem 体系,自动继承 E2EE 同步。
const TimeCapsulePage = lazy(() =>
  import('./pages/TimeCapsulePage').then((m) => ({ default: m.TimeCapsulePage })),
);
// s2:番茄钟专注页 — 复用 userPreferences.pomodoroSettings,usePomodoro 状态机驱动。
const PomodoroPage = lazy(() =>
  import('./pages/PomodoroPage').then((m) => ({ default: m.PomodoroPage })),
);
// s3:习惯追踪页 — habitsSlice + HabitHeatmap,本地持久化(不走 E2EE 同步)。
const HabitPage = lazy(() =>
  import('./pages/HabitPage').then((m) => ({ default: m.HabitPage })),
);
// D3:任务模板页 — templatesSlice,inline 表单 + 卡片列表,应用模板即创建任务。
const TemplatePage = lazy(() =>
  import('./pages/TemplatePage').then((m) => ({ default: m.TemplatePage })),
);
// D4:OKR 目标页 — goalsSlice,按周期分组,KR 进度自动汇总到目标。
const GoalPage = lazy(() =>
  import('./pages/GoalPage').then((m) => ({ default: m.GoalPage })),
);
// 插件 / Skill 管理页 — pluginsSlice,启停 / 新建 / 导入 / 试用。
const PluginPage = lazy(() =>
  import('./pages/PluginPage').then((m) => ({ default: m.PluginPage })),
);

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
      加载中…
    </div>
  );
}

function HiddenVault() {
  return (
    <div className="text-slate-400 dark:text-slate-500">隐私模式下保险库已隐藏</div>
  );
}

/**
 * PersistenceErrorBanner — 本地数据读写失败时显示顶部 banner。
 *
 * 之前 persistenceSlice 写入 persistenceError 字段,但 UI 0 渲染点,
 * 用户在磁盘满 / IndexedDB 损坏时无任何感知,继续操作会丢数据。
 * 本 banner 在出错时固定顶部显示,直到错误被清除(saveData 成功后清空)。
 *
 * P1-7 修复:
 * - saveData 成功后 persistenceSlice 会清空 persistenceError,banner 自动消失
 * - 加"重试"按钮:用户清理磁盘空间后点击,触发 loadData 重新读取 + saveData 落盘
 * - 加"忽略"按钮:用户已知问题暂时无法解决,可手动关闭 banner(下次保存失败会再出现)
 */
function PersistenceErrorBanner() {
  const persistenceError = useAppStore((s) => s.persistenceError);
  const loadData = useAppStore((s) => s.loadData);
  const [dismissed, setDismissed] = useState(false);

  // 错误内容变化时重置 dismissed(下次出错会再次显示)
  useEffect(() => {
    if (persistenceError) setDismissed(false);
  }, [persistenceError]);

  if (!persistenceError || dismissed) return null;

  const handleRetry = async () => {
    // 触发完整 load + save 周期:loadData 重新读 IDB,saveData 写回。
    // 若磁盘已恢复空间,saveData 成功 → persistenceSlice 清空 persistenceError → banner 自动消失。
    await loadData();
    await useAppStore.getState().saveData();
  };

  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100 sm:px-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <strong className="font-semibold">本地数据读写失败:</strong>{' '}
          <span className="break-all">{persistenceError}</span>
          <span className="ml-1 opacity-75">— 操作可能无法保存</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            data-touch-target
            onClick={handleRetry}
            className="rounded border border-amber-400 px-2 py-1 font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-100 dark:hover:bg-amber-900/50"
          >
            重试
          </button>
          <button
            type="button"
            data-touch-target
            onClick={() => setDismissed(true)}
            className="px-2 py-1 text-amber-900/70 hover:text-amber-900 dark:text-amber-100/70 dark:hover:text-amber-100"
            aria-label="忽略此警告"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { isUnlocked, isLoading, checkStatus, lock } = useAuthStore();
  const navigate = useNavigate();
  const privacyMode = usePrivacyMode();
  const { init: initTheme } = useThemeStore();
  const { autoLockMinutes, fetch: fetchSecuritySettings } =
    useSecuritySettingsStore();
  const loadData = useAppStore((s) => s.loadData);
  const fontSize = useAppStore((s) => s.userPreferences.displaySettings.fontSize);
  const { showOnboarding, complete: completeOnboarding } = useOnboarding();
  useAutoLock(autoLockMinutes);

  // 启动同步调度器:已配对设备自动建立 SyncEngine + 5 分钟周期同步
  useSyncScheduler();
  // Phase 1.1:提醒系统 — 扫描 reminderDate 到期任务,触发浏览器 Notification + toast
  useReminders();

  useEffect(() => {
    checkStatus();
    const cleanupTheme = initTheme();
    fetchSecuritySettings();
    // 加载共享 store 数据（tasks/projects/categories/tags）
    loadData();
    return () => {
      cleanupTheme();
    };
  }, [checkStatus, initTheme, fetchSecuritySettings, loadData]);

  // P1-3:把 userPreferences.displaySettings.fontSize 同步到 root 元素的
  // data-font-size 属性,index.css 据此调整 root font-size,所有 rem-based
  // Tailwind 工具类随之等比例缩放。
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-font-size', fontSize);
  }, [fontSize]);

  // 全局键盘快捷键:
  //   mod+l → 锁定应用 (替代之前 app:lock 事件,webAPI.emitEvent 是死代码)
  //   mod+n → 跳到今日任务
  //   mod+k → 打开命令面板(b2:跳页/操作/搜任务一站式入口)
  //   /     → 跳到搜索(轻量单字符入口,与 mod+k 互补)
  //   mod+b → 折叠/展开侧栏
  //   ?     → 显示快捷键帮助浮层(P1-1)
  useKeyboardShortcuts({
    'mod+l': () => lock(),
    'mod+n': () => navigate('/today'),
    'mod+k': () => useAppStore.getState().setActiveModal('command-palette'),
    '/': () => navigate('/search'),
    'mod+b': () => useAppStore.getState().toggleSidebar(),
    '?': () => useAppStore.getState().setActiveModal('shortcuts-help'),
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">加载中...</div>
    );
  }
  if (!isUnlocked) return <LockScreen />;

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
      <PersistenceErrorBanner />
      <MobileHeader />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar privacyMode={privacyMode} />
        <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
          {/* ErrorBoundary 提到 Routes 外但仍包住主内容,
              Sidebar 在边界外(避免 Sidebar 抛错导致整页白屏,
              但 Sidebar 本身简单且已长期稳定,边界包 Routes 足够) */}
          <ErrorBoundary>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Navigate to="/mosaic" replace />} />
                <Route path="/mosaic" element={<MosaicPage />} />
                <Route path="/today" element={<TodayPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:id" element={<ProjectDetailPage />} />
                <Route path="/kanban" element={<KanbanPage />} />
                <Route path="/insights" element={<InsightsPage />} />
                <Route path="/review" element={<ReviewPage />} />
                <Route path="/time-capsule" element={<TimeCapsulePage />} />
                <Route path="/pomodoro" element={<PomodoroPage />} />
                <Route path="/habits" element={<HabitPage />} />
                <Route path="/templates" element={<TemplatePage />} />
                <Route path="/goals" element={<GoalPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/tags" element={<TagsPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/smart-lists" element={<SmartListPage />} />
                <Route path="/plugins" element={<PluginPage />} />
                <Route
                  path="/vault"
                  element={privacyMode ? <HiddenVault /> : <VaultPage />}
                />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/mosaic" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      {showOnboarding && (
        <Suspense fallback={null}>
          <Onboarding onComplete={completeOnboarding} />
        </Suspense>
      )}
      {/* 快捷键帮助浮层(P1-1):订阅 activeModal === 'shortcuts-help' */}
      <KeyboardShortcutsHelp />
      {/* 命令面板(b2):订阅 activeModal === 'command-palette',mod+k 唤起 */}
      <CommandPalette />
      {/* P1-3:同步冲突解决弹窗,订阅 activeModal === 'conflict-dialog'。
          SyncSettingsPanel 横幅在有未决冲突时 setActiveModal('conflict-dialog') 唤起。 */}
      <ConflictDialog />
      {/* Toaster 挂在所有内容之上,订阅 uiSlice.notifications 渲染 */}
      <Toaster />
    </div>
  );
}

function App() {
  // HashRouter:Electron file:// 协议下 BrowserRouter 会丢 history,
  // HashRouter 用 # 路由兼容 Electron / PWA / 静态托管三端。
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}

export default App;
