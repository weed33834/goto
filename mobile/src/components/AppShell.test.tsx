// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AppShell from './AppShell';

// 纯导航测试:用哨兵视图验证底部 Tab 切换真实改变路由(Outlet 内容)。
function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/today" element={<div data-testid="view-today">今日视图</div>} />
          <Route path="/tasks" element={<div data-testid="view-tasks">任务视图</div>} />
          <Route path="/board" element={<div data-testid="view-board">看板视图</div>} />
          <Route path="/vault" element={<div data-testid="view-vault">保险库视图</div>} />
          <Route path="/sync" element={<div data-testid="view-sync">同步视图</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell 底部导航(移动端)', () => {
  it('默认渲染今日视图', () => {
    renderShell();
    expect(screen.getByTestId('view-today')).toBeInTheDocument();
  });

  it('点击"任务"Tab 切换到任务视图', () => {
    renderShell();
    fireEvent.click(screen.getByTestId('tab-任务'));
    expect(screen.getByTestId('view-tasks')).toBeInTheDocument();
    expect(screen.queryByTestId('view-today')).toBeNull();
  });

  it('点击"看板"Tab 切换到看板视图', () => {
    renderShell();
    fireEvent.click(screen.getByTestId('tab-看板'));
    expect(screen.getByTestId('view-board')).toBeInTheDocument();
  });

  it('点击"同步"Tab 切换到同步视图', () => {
    renderShell();
    fireEvent.click(screen.getByTestId('tab-同步'));
    expect(screen.getByTestId('view-sync')).toBeInTheDocument();
  });
});
