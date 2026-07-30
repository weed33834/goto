// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskRow from './TaskRow';
import { buildTaskInput } from '../lib/taskInput';
import type { Task } from '@shared/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return { ...buildTaskInput(), id: 'abc', createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

describe('TaskRow(移动端)', () => {
  it('点击勾选调用 onToggle(id)', () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    render(<TaskRow task={makeTask({ id: 'abc', title: '任务1' })} onToggle={onToggle} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('toggle-abc'));
    expect(onToggle).toHaveBeenCalledWith('abc');
  });

  it('点击删除调用 onDelete(id)', () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    render(<TaskRow task={makeTask({ id: 'abc' })} onToggle={onToggle} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('delete-abc'));
    expect(onDelete).toHaveBeenCalledWith('abc');
  });

  it('展示标题与优先级标签', () => {
    render(
      <TaskRow task={makeTask({ id: 'abc', title: '写报告', priority: 'high' })} onToggle={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText('写报告')).toBeInTheDocument();
    expect(screen.getByText('高')).toBeInTheDocument();
  });
});
