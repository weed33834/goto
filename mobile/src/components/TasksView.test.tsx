// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '@shared/store';
import { buildTaskInput } from '../lib/taskInput';
import TasksView from './TasksView';

beforeEach(() => {
  vi.spyOn(useAppStore.getState(), 'saveData').mockResolvedValue(undefined);
  useAppStore.setState({ tasks: [], selectedTask: null, apiAvailable: false });
});

describe('TasksView(移动端)', () => {
  it('空列表显示占位提示', () => {
    render(<TasksView />);
    expect(screen.getByText('暂无任务,点右下角 + 新建')).toBeInTheDocument();
  });

  it('FAB 打开抽屉,提交后新增任务并出现于列表', () => {
    render(<TasksView />);
    fireEvent.click(screen.getByTestId('fab-new'));
    fireEvent.change(screen.getByTestId('task-title'), { target: { value: '买牛奶' } });
    fireEvent.click(screen.getByTestId('task-submit'));

    // 任务已写入共享内核
    expect(useAppStore.getState().tasks).toHaveLength(1);
    expect(useAppStore.getState().tasks[0].title).toBe('买牛奶');
    // 列表渲染出该任务
    expect(screen.getByText('买牛奶')).toBeInTheDocument();
  });

  it('勾选复选框标记任务完成', () => {
    const id = useAppStore.getState().addTask(buildTaskInput({ title: 'A' }));
    render(<TasksView />);
    fireEvent.click(screen.getByTestId(`toggle-${id}`));
    expect(useAppStore.getState().tasks[0].completed).toBe(true);
  });
});
