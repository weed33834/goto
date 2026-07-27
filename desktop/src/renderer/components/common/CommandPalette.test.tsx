// @vitest-environment jsdom
/**
 * CommandPalette 测试(b2)
 *
 * 覆盖:
 * - 默认不渲染(activeModal !== 'command-palette')
 * - 打开时渲染输入框 + 命令列表
 * - 输入过滤命令(标题/关键词)
 * - 键盘导航:↓ ↑ Enter Esc
 * - 任务搜索:输入匹配任务标题
 * - backdrop 点击关闭
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAppStore } from '../../../shared/store';
import { CommandPalette } from './CommandPalette';

// mock authStore:lock 仅记录调用,不触发真实认证流程
const lockMock = vi.fn();
vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector?: (s: { lock: () => void }) => unknown) =>
    selector ? selector({ lock: lockMock }) : { lock: lockMock },
}));

// mock themeStore:固定 mode='system',setMode 记录调用
const setModeMock = vi.fn();
vi.mock('../../store/themeStore', () => ({
  useThemeStore: (selector?: (s: { mode: string; setMode: (m: string) => void }) => unknown) =>
    selector
      ? selector({ mode: 'system', setMode: setModeMock })
      : { mode: 'system', setMode: setModeMock },
}));

function renderPalette(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <CommandPalette />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAppStore.setState({
    activeModal: null,
    tasks: [],
    sidebarOpen: true,
  });
  lockMock.mockClear();
  setModeMock.mockClear();
});

describe('CommandPalette', () => {
  it('activeModal 非 command-palette 时不渲染', () => {
    useAppStore.setState({ activeModal: null });
    renderPalette();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('activeModal=command-palette 时渲染对话框与输入框', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('命令搜索')).toBeInTheDocument();
  });

  it('打开时默认展示全部导航与操作命令', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    // 导航分组下的若干命令
    expect(screen.getByText('时间织锦')).toBeInTheDocument();
    expect(screen.getByText('今日任务')).toBeInTheDocument();
    expect(screen.getByText('设置')).toBeInTheDocument();
    // 操作分组
    expect(screen.getByText('锁定应用')).toBeInTheDocument();
    expect(screen.getByText('折叠 / 展开侧栏')).toBeInTheDocument();
  });

  it('输入文字过滤命令:只展示命中项', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    const input = screen.getByLabelText('命令搜索');
    fireEvent.change(input, { target: { value: '主题' } });
    // 命中三个主题命令
    expect(screen.getByText('切换到浅色主题')).toBeInTheDocument();
    expect(screen.getByText('切换到深色主题')).toBeInTheDocument();
    expect(screen.getByText('跟随系统主题')).toBeInTheDocument();
    // 未命中的不展示
    expect(screen.queryByText('今日任务')).not.toBeInTheDocument();
    expect(screen.queryByText('设置')).not.toBeInTheDocument();
  });

  it('关键词匹配:输入 lock 命中"锁定应用"', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    fireEvent.change(screen.getByLabelText('命令搜索'), { target: { value: 'lock' } });
    expect(screen.getByText('锁定应用')).toBeInTheDocument();
  });

  it('↓ 键移动选中项到下一条命令', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    const input = screen.getByLabelText('命令搜索');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // 第 0 项(时间织锦)被选中后,↓ 应切到第 1 项(今日任务)
    const items = screen.getAllByRole('button').filter(
      (b) => b.dataset.cmdIndex !== undefined,
    );
    const active = items.find((b) => b.className.includes('bg-primary'));
    expect(active).toBeDefined();
    expect(active?.textContent).toContain('今日任务');
  });

  it('↑ 键在第一项时回环到最后一项', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    const input = screen.getByLabelText('命令搜索');
    // 默认 activeIndex=0,按 ↑ 应回环到最后一项(显示快捷键帮助)
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const items = screen.getAllByRole('button').filter(
      (b) => b.dataset.cmdIndex !== undefined,
    );
    const active = items.find((b) => b.className.includes('bg-primary'));
    expect(active).toBeDefined();
    expect(active?.textContent).toContain('显示快捷键帮助');
  });

  it('Enter 执行选中命令并关闭面板(导航命令)', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    const input = screen.getByLabelText('命令搜索');
    // 默认选中第 0 项(时间织锦),Enter 应关闭面板
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useAppStore.getState().activeModal).toBeNull();
  });

  it('Enter 执行操作命令:锁定应用调用 lock', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    const input = screen.getByLabelText('命令搜索');
    // 过滤到只剩锁定应用
    fireEvent.change(input, { target: { value: '锁定' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(lockMock).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().activeModal).toBeNull();
  });

  it('Esc 关闭面板', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    const input = screen.getByLabelText('命令搜索');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useAppStore.getState().activeModal).toBeNull();
  });

  it('backdrop 点击关闭面板', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    const dialog = screen.getByRole('dialog');
    // 点击 dialog 本身(backdrop 区域)
    fireEvent.click(dialog);
    expect(useAppStore.getState().activeModal).toBeNull();
  });

  it('点击命令项执行该命令', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    // 点击"锁定应用"
    fireEvent.click(screen.getByText('锁定应用'));
    expect(lockMock).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().activeModal).toBeNull();
  });

  it('任务搜索:输入文字匹配任务标题并展示为命令', () => {
    useAppStore.setState({
      activeModal: 'command-palette',
      tasks: [
        { id: 't1', title: '写周报', completed: false } as never,
        { id: 't2', title: '买牛奶', completed: false } as never,
      ],
    });
    renderPalette();
    fireEvent.change(screen.getByLabelText('命令搜索'), { target: { value: '周报' } });
    // 任务命中展示
    expect(screen.getByText('写周报')).toBeInTheDocument();
    // 未命中任务不展示
    expect(screen.queryByText('买牛奶')).not.toBeInTheDocument();
  });

  it('无匹配命令时展示空态文案', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    fireEvent.change(screen.getByLabelText('命令搜索'), { target: { value: 'zzz不存在的命令zzz' } });
    expect(screen.getByText('没有匹配的命令')).toBeInTheDocument();
  });

  it('主题命令展示当前主题标记', () => {
    useAppStore.setState({ activeModal: 'command-palette' });
    renderPalette();
    // themeStore mock 为 system,所以"跟随系统主题"应显示"当前"标记
    const systemItem = screen.getByText('跟随系统主题').closest('button');
    expect(systemItem).toHaveTextContent('当前');
    // 浅色/深色不应显示"当前"
    const lightItem = screen.getByText('切换到浅色主题').closest('button');
    expect(lightItem).not.toHaveTextContent('当前');
  });
});
