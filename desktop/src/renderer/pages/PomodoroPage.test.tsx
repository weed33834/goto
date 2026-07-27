// @vitest-environment jsdom
/**
 * PomodoroPage 测试(s2)
 *
 * 覆盖:
 * - 渲染标题 + 圆盘 + 控制按钮
 * - 初始 phase=idle 显示"准备开始"
 * - 点击"开始专注" → phase=focus,按钮文字变"暂停"
 * - 点击"暂停" → isRunning=false,按钮文字变"继续"
 * - 点击"跳过" → phase 切到 short-break
 * - 点击"停止" → 回 idle
 * - 配置面板展开后,修改"专注(分钟)"输入框 → 调用 updatePomodoroSettings
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAppStore } from '../../shared/store';
import { PomodoroPage } from './PomodoroPage';

beforeEach(() => {
  useAppStore.setState({
    userPreferences: {
      ...useAppStore.getState().userPreferences,
      pomodoroSettings: {
        enabled: true,
        focusDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        longBreakInterval: 4,
        dailyGoal: 4,
        autoStartBreaks: false,
        autoStartFocus: false,
        soundEnabled: true,
        vibrationEnabled: true,
      },
    },
  });
});

describe('PomodoroPage', () => {
  it('渲染标题与圆盘', () => {
    render(
      <MemoryRouter>
        <PomodoroPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '番茄钟' })).toBeInTheDocument();
    expect(screen.getByTestId('pomodoro-clock')).toHaveTextContent('25:00');
  });

  it('初始 phase=idle 显示"准备开始"', () => {
    render(
      <MemoryRouter>
        <PomodoroPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('pomodoro-phase-label')).toHaveTextContent('准备开始');
  });

  it('点击"开始专注"启动 focus,按钮文字变"暂停"', () => {
    render(
      <MemoryRouter>
        <PomodoroPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('开始专注'));
    expect(screen.getByTestId('pomodoro-phase-label')).toHaveTextContent('专注中');
    expect(screen.getByText('暂停')).toBeInTheDocument();
  });

  it('点击"暂停"后按钮变"继续"', () => {
    render(
      <MemoryRouter>
        <PomodoroPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('开始专注'));
    fireEvent.click(screen.getByText('暂停'));
    expect(screen.getByText('继续')).toBeInTheDocument();
  });

  it('点击"跳过"切到 short-break', () => {
    render(
      <MemoryRouter>
        <PomodoroPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('开始专注'));
    fireEvent.click(screen.getByText('跳过'));
    expect(screen.getByTestId('pomodoro-phase-label')).toHaveTextContent('短休息');
    expect(screen.getByTestId('pomodoro-clock')).toHaveTextContent('05:00');
  });

  it('点击"停止"回 idle', () => {
    render(
      <MemoryRouter>
        <PomodoroPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('开始专注'));
    fireEvent.click(screen.getByText('停止'));
    expect(screen.getByTestId('pomodoro-phase-label')).toHaveTextContent('准备开始');
  });

  it('配置面板展开后修改"专注(分钟)"更新 store', () => {
    render(
      <MemoryRouter>
        <PomodoroPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('番茄钟配置'));
    // Input 组件的 label 没用 htmlFor 关联,改用 displayValue 查询。
    const input = screen.getByDisplayValue('25') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '30' } });
    expect(useAppStore.getState().userPreferences.pomodoroSettings.focusDuration).toBe(30);
  });

  it('勾选"专注结束自动进入休息"切换 autoStartBreaks', () => {
    render(
      <MemoryRouter>
        <PomodoroPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('番茄钟配置'));
    // checkbox 用 label 文本定位
    const checkbox = screen.getByLabelText(/专注结束自动进入休息/) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(useAppStore.getState().userPreferences.pomodoroSettings.autoStartBreaks).toBe(true);
  });
});
