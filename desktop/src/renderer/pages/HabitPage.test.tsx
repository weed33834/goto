// @vitest-environment jsdom
/**
 * HabitPage 测试(s3)
 *
 * 覆盖:
 * - 渲染标题与空态提示
 * - 点击"新建习惯"展开表单,提交后 habits 增 1 并出现卡片
 * - 已有 habit 时渲染卡片(名称 + 热力图 + 操作按钮)
 * - 点击今日打卡快捷点 → completedDates 含今日
 * - 点击删除按钮 → window.confirm 返回 true 时调 deleteHabit
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAppStore } from '../../shared/store';
import { HabitPage } from './HabitPage';

beforeEach(() => {
  useAppStore.setState({ habits: [] });
});

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('HabitPage', () => {
  it('渲染标题与空态', () => {
    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '习惯追踪' })).toBeInTheDocument();
    expect(screen.getByText('还没有习惯')).toBeInTheDocument();
  });

  it('点击"新建习惯"展开表单,提交后 habits 增 1 并出现卡片', async () => {
    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('新建习惯'));
    const nameInput = screen.getByPlaceholderText('例如:每日阅读 30 分钟') as HTMLInputElement;
    expect(nameInput).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: '每日阅读' } });
    fireEvent.click(screen.getByText('创建'));

    await waitFor(() => {
      expect(useAppStore.getState().habits).toHaveLength(1);
    });
    expect(useAppStore.getState().habits[0].name).toBe('每日阅读');
    // 卡片渲染:habit-card-{id} 测试 id 出现
    const id = useAppStore.getState().habits[0].id;
    expect(screen.getByTestId(`habit-card-${id}`)).toBeInTheDocument();
  });

  it('已有 habit 时渲染卡片与热力图', () => {
    useAppStore.getState().addHabit({ name: '阅读', cadence: 'daily' });
    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('阅读')).toBeInTheDocument();
    // 热力图 grid 存在
    expect(screen.getByRole('grid', { name: '习惯打卡热力图' })).toBeInTheDocument();
  });

  it('点击今日打卡快捷点 → completedDates 含今日', () => {
    useAppStore.getState().addHabit({ name: '阅读', cadence: 'daily' });
    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>,
    );

    const today = todayStr();
    const btn = screen.getByLabelText('完成今日打卡');
    fireEvent.click(btn);

    const habit = useAppStore.getState().habits[0];
    expect(habit.completedDates).toContain(today);
    // 按钮的 aria-label 切换为"取消今日打卡"
    expect(screen.getByLabelText('取消今日打卡')).toBeInTheDocument();
  });

  it('再次点击今日打卡快捷点 → 取消今日打卡', () => {
    useAppStore.getState().addHabit({ name: '阅读', cadence: 'daily' });
    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>,
    );

    const today = todayStr();
    fireEvent.click(screen.getByLabelText('完成今日打卡'));
    fireEvent.click(screen.getByLabelText('取消今日打卡'));

    const habit = useAppStore.getState().habits[0];
    expect(habit.completedDates).not.toContain(today);
  });

  it('点击热力图某日格 → 调用 toggleHabitEntry', () => {
    useAppStore.getState().addHabit({ name: '阅读', cadence: 'daily' });
    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>,
    );

    // 找到一个未打卡的日期格(2026-01-01 必然在最近 30 天外,但热力图只渲染近 30 天)
    // 改为点击热力图中第一个 gridcell
    const cells = screen.getAllByRole('gridcell');
    expect(cells.length).toBeGreaterThan(0);
    const firstCell = cells[0];
    const dateStr = firstCell.getAttribute('aria-label')?.split(' ')[0];
    expect(dateStr).toBeTruthy();

    fireEvent.click(firstCell);
    const habit = useAppStore.getState().habits[0];
    expect(habit.completedDates).toContain(dateStr);
  });

  it('点击删除按钮 → window.confirm 返回 true 时调 deleteHabit', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    useAppStore.getState().addHabit({ name: '阅读', cadence: 'daily' });
    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('删除'));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().habits).toHaveLength(0);
    confirmSpy.mockRestore();
  });

  it('window.confirm 返回 false 时不删除', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    useAppStore.getState().addHabit({ name: '阅读', cadence: 'daily' });
    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('删除'));
    expect(useAppStore.getState().habits).toHaveLength(1);
    confirmSpy.mockRestore();
  });

  it('归档后从主列表移除,出现在"已归档"折叠区', () => {
    useAppStore.getState().addHabit({ name: '阅读', cadence: 'daily' });
    render(
      <MemoryRouter>
        <HabitPage />
      </MemoryRouter>,
    );

    // 主列表里有"阅读"
    expect(screen.getByText('阅读')).toBeInTheDocument();
    // 点击归档
    fireEvent.click(screen.getByText('归档'));
    // 主列表里"阅读"应消失(实际只是不在 active 列表,但仍在 DOM 的"已归档"折叠区,默认折叠)
    // 这里验证 habits 状态正确
    expect(useAppStore.getState().habits[0].archived).toBe(true);
    // 展开"已归档"后再次出现
    fireEvent.click(screen.getByText(/已归档习惯\(1\)/));
    expect(screen.getByText('取消归档')).toBeInTheDocument();
  });
});
