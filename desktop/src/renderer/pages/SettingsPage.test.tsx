// @vitest-environment jsdom
/**
 * SettingsPage 冒烟测试
 * 验证:组件能渲染不崩溃 + 关键标题/元素存在 + P0-2 后端连接区交互
 *
 * 说明:SettingsPage 依赖 6 个 store。这里把所有 store mock 成"已加载完成"的
 * 空态,SyncSettingsPanel 也 mock 掉(它依赖同步 runtime),只验证页面本身能
 * 渲染 + 标题在。
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';

// mock 主题 store
vi.mock('../store/themeStore', () => {
  const state = { mode: 'light', setMode: () => {} };
  return { useThemeStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock 安全设置 store:isLoading=false 走主渲染分支
vi.mock('../store/securitySettingsStore', () => {
  const state = {
    isLoading: false,
    lockMethod: 'password',
    autoLockMinutes: 5,
    clipboardClearSeconds: 30,
    screenshotProtection: true,
    privacyModeEnabled: false,
    fetch: () => {},
    update: () => {},
  };
  return { useSecuritySettingsStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock 鉴权 store:提供 changePassword
vi.mock('../store/authStore', () => {
  const state = { changePassword: async () => ({ success: true, message: 'ok' }) };
  return { useAuthStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock task store / vault store:只用 fetch
vi.mock('../store/taskStore', () => {
  const state = { fetch: () => {} };
  return { useTaskStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});
vi.mock('../store/vaultStore', () => {
  const state = { fetch: () => {} };
  return { useVaultStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock 共享 store:提供设置页用到的 setActiveModal / resetData / 显示偏好 / addTask
vi.mock('../../shared/store', () => {
  const state = {
    setActiveModal: () => {},
    resetData: () => {},
    userPreferences: { displaySettings: { fontSize: 'medium' } },
    updateDisplaySettings: () => {},
    addTask: () => 'fake-id',
  };
  return { useAppStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) };
});

// mock 同步设置面板:避免引入同步 runtime 的复杂依赖
vi.mock('../components/sync/SyncSettingsPanel', () => ({
  SyncSettingsPanel: () => <div data-testid="sync-settings-stub" />,
}));

// mock shared/api:验证调用,不依赖真实网络
// 用显式类型签名避免 vi.fn(async () => null) 把返回类型收窄为 Promise<null>
import type { ConnectionTestResult } from '../../shared/api';
const apiMocks = vi.hoisted(() => ({
  setApiBaseUrl: vi.fn<(url: string | null) => void>(),
  saveStoredApiBaseUrl: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
  clearStoredApiBaseUrl: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  loadStoredApiBaseUrl: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
  testApiConnection: vi.fn<(baseUrl: string, token?: string) => Promise<ConnectionTestResult>>().mockResolvedValue({ ok: true, status: 200, latencyMs: 12 }),
}));
vi.mock('../../shared/api', () => ({
  setApiBaseUrl: apiMocks.setApiBaseUrl,
  saveStoredApiBaseUrl: apiMocks.saveStoredApiBaseUrl,
  clearStoredApiBaseUrl: apiMocks.clearStoredApiBaseUrl,
  loadStoredApiBaseUrl: apiMocks.loadStoredApiBaseUrl,
  testApiConnection: apiMocks.testApiConnection,
}));

// mock secureStorage:用内存实现,避免 IndexedDB 依赖
import type { StoredAuth } from '../../shared/utils/secureStorage';
const secureMocks = vi.hoisted(() => ({
  setStoredAuth: vi.fn<(user: unknown, token: string) => Promise<void>>().mockResolvedValue(undefined),
  clearStoredAuth: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getStoredAuth: vi.fn<() => Promise<StoredAuth | null>>().mockResolvedValue(null),
}));
vi.mock('../../shared/utils/secureStorage', () => ({
  setStoredAuth: secureMocks.setStoredAuth,
  clearStoredAuth: secureMocks.clearStoredAuth,
  getStoredAuth: secureMocks.getStoredAuth,
}));

// mock 第三方导入器:避免依赖真实解析,聚焦 SettingsPage 的 UI 与 addTask 调用链
import type { ImportResult, ImportFormat } from '../../shared/importers';
const importerMocks = vi.hoisted(() => ({
  importTasksFromFile: vi.fn<(file: File) => Promise<ImportResult & { format: ImportFormat }>>(),
}));
vi.mock('../../shared/importers', () => ({
  importTasksFromFile: importerMocks.importTasksFromFile,
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.loadStoredApiBaseUrl.mockResolvedValue(null);
    secureMocks.getStoredAuth.mockResolvedValue(null);
    importerMocks.importTasksFromFile.mockReset();
  });

  it('渲染时不崩溃', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
  });

  it('显示"设置"标题', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument();
  });

  it('渲染"安全"与"外观"分区标题', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '安全' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '外观' })).toBeInTheDocument();
  });

  it('P0-2:渲染"后端连接"分区标题', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '后端连接' })).toBeInTheDocument();
  });

  it('P0-2:启动时从持久化存储加载已存的 URL/token 回填', async () => {
    apiMocks.loadStoredApiBaseUrl.mockResolvedValue('https://stored.example.com');
    secureMocks.getStoredAuth.mockResolvedValue({ token: 'stored-token', user: {} });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect((screen.getByPlaceholderText(/https:\/\/api\.goto\.app/) as HTMLInputElement).value).toBe('https://stored.example.com');
    });
    expect((screen.getByPlaceholderText('留空表示不使用 token') as HTMLInputElement).value).toBe('stored-token');
  });

  it('P0-2:点击"测试连接"调用 testApiConnection 并显示成功结果', async () => {
    apiMocks.testApiConnection.mockResolvedValue({ ok: true, status: 200, latencyMs: 42 });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const urlInput = screen.getByPlaceholderText(/https:\/\/api\.goto\.app/) as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://api.test.com' } });

    const testBtn = screen.getByRole('button', { name: '测试连接' });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(apiMocks.testApiConnection).toHaveBeenCalledWith('https://api.test.com', undefined);
    });
    await waitFor(() => {
      expect(screen.getByText(/连接成功/)).toBeInTheDocument();
    });
  });

  it('P0-2:点击"测试连接"显示失败结果(网络错误)', async () => {
    apiMocks.testApiConnection.mockResolvedValue({
      ok: false,
      status: 0,
      latencyMs: 5000,
      error: '连接超时(5s)',
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const urlInput = screen.getByPlaceholderText(/https:\/\/api\.goto\.app/) as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://unreachable.example.com' } });

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() => {
      expect(screen.getByText(/连接失败/)).toBeInTheDocument();
      expect(screen.getByText(/连接超时/)).toBeInTheDocument();
    });
  });

  it('P0-2:点击"保存配置"持久化 URL + token 并应用到运行时', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const urlInput = screen.getByPlaceholderText(/https:\/\/api\.goto\.app/) as HTMLInputElement;
    const tokenInput = screen.getByPlaceholderText('留空表示不使用 token') as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://api.goto.app/' } });
    fireEvent.change(tokenInput, { target: { value: 'my-secret-token' } });

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    // handler 把 trimmedUrl(去空白,但保留尾部斜杠)交给 api 层;
    // 真实 setApiBaseUrl/saveStoredApiBaseUrl 内部再去斜杠,mock 不做处理。
    await waitFor(() => {
      expect(apiMocks.setApiBaseUrl).toHaveBeenCalledWith('https://api.goto.app/');
      expect(apiMocks.saveStoredApiBaseUrl).toHaveBeenCalledWith('https://api.goto.app/');
      expect(secureMocks.setStoredAuth).toHaveBeenCalledWith({ source: 'manual-config' }, 'my-secret-token');
    });
    await waitFor(() => {
      expect(screen.getByText('已保存后端连接配置')).toBeInTheDocument();
    });
  });

  it('P0-2:点击"清除"重置表单 + 清除持久化', async () => {
    apiMocks.loadStoredApiBaseUrl.mockResolvedValue('https://stored.example.com');
    secureMocks.getStoredAuth.mockResolvedValue({ token: 'tok', user: {} });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    // 等回填完成
    await waitFor(() => {
      expect((screen.getByPlaceholderText(/https:\/\/api\.goto\.app/) as HTMLInputElement).value).toBe('https://stored.example.com');
    });

    fireEvent.click(screen.getByRole('button', { name: '清除' }));

    await waitFor(() => {
      expect(apiMocks.clearStoredApiBaseUrl).toHaveBeenCalled();
      expect(secureMocks.clearStoredAuth).toHaveBeenCalled();
      expect((screen.getByPlaceholderText(/https:\/\/api\.goto\.app/) as HTMLInputElement).value).toBe('');
    });
  });

  // ===== P1-1:第三方数据导入 =====

  it('P1-1:渲染"从其他应用导入"子卡片与"选择文件导入"按钮', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('从其他应用导入')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择文件导入' })).toBeInTheDocument();
    expect(screen.getByLabelText('选择 Todoist CSV 或 TickTick JSON 文件')).toBeInTheDocument();
  });

  it('P1-1:选择 Todoist CSV 文件 → 解析 + addTask 调用 + 显示成功结果', async () => {
    // 构造 2 条任务的解析结果
    importerMocks.importTasksFromFile.mockResolvedValue({
      format: 'todoist-csv',
      tasks: [
        { title: '任务A' } as never,
        { title: '任务B' } as never,
      ],
      errors: [],
      skipped: 1,
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('选择 Todoist CSV 或 TickTick JSON 文件') as HTMLInputElement;
    const file = new File(['TYPE,TITLE\ntask,A'], 'todoist.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(importerMocks.importTasksFromFile).toHaveBeenCalledWith(file);
    });
    await waitFor(() => {
      // addTask 在 mock store 里是 () => 'fake-id',无法直接 spy;改验证结果展示
      expect(screen.getByText(/格式 todoist-csv · 导入 2 · 失败 0 · 跳过 1/)).toBeInTheDocument();
    });
    // input value 被清空(允许重选同一文件)
    expect(input.value).toBe('');
  });

  it('P1-1:解析有错误时显示错误详情(最多 5 条)', async () => {
    const errors = Array.from({ length: 7 }, (_, i) => ({ row: i + 2, message: `错误${i}` }));
    importerMocks.importTasksFromFile.mockResolvedValue({
      format: 'ticktick-json',
      tasks: [{ title: '任务X' } as never],
      errors,
      skipped: 0,
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('选择 Todoist CSV 或 TickTick JSON 文件') as HTMLInputElement;
    const file = new File(['[]'], 'ticktick.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/格式 ticktick-json · 导入 1 · 失败 7/)).toBeInTheDocument();
    });
    // 只展示前 5 条
    expect(screen.getByText(/行 2:错误0/)).toBeInTheDocument();
    expect(screen.getByText(/行 6:错误4/)).toBeInTheDocument();
    expect(screen.queryByText(/行 7:错误5/)).not.toBeInTheDocument();
    expect(screen.getByText(/还有 2 条错误未展示/)).toBeInTheDocument();
  });

  it('P1-1:未知格式显示错误结果(0 导入,1 失败)', async () => {
    importerMocks.importTasksFromFile.mockResolvedValue({
      format: 'unknown',
      tasks: [],
      errors: [{ row: 0, message: '无法识别文件格式: weird.txt' }],
      skipped: 0,
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('选择 Todoist CSV 或 TickTick JSON 文件') as HTMLInputElement;
    const file = new File(['???'], 'weird.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/格式 unknown · 导入 0 · 失败 1/)).toBeInTheDocument();
    });
    expect(screen.getByText(/行 0:无法识别文件格式: weird.txt/)).toBeInTheDocument();
  });

  it('P1-1:importTasksFromFile 抛异常 → 显示失败反馈,不崩溃', async () => {
    importerMocks.importTasksFromFile.mockRejectedValue(new Error('文件读取失败'));

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('选择 Todoist CSV 或 TickTick JSON 文件') as HTMLInputElement;
    const file = new File(['x'], 'broken.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/格式 unknown · 导入 0 · 失败 1/)).toBeInTheDocument();
    });
    expect(screen.getByText(/行 0:文件读取失败/)).toBeInTheDocument();
  });
});
