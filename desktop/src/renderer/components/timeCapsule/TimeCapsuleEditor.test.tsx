// @vitest-environment jsdom
/**
 * TimeCapsuleEditor 测试(s1)
 *
 * 覆盖:
 * - 新建模式:标题/解锁时间/正文三字段渲染
 * - 校验:标题空 → "请填写标题"
 * - 校验:正文空 → "请写给未来自己的话"
 * - 校验:解锁时间在过去 → "解锁时间必须在未来"
 * - 提交成功:create 被调用,表单清空
 * - 编辑模式:unlockAt 字段 disabled,「保存修改」调用 update
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { VaultItem } from '../../../shared/types';
import { TimeCapsuleEditor } from './TimeCapsuleEditor';

const { createMock, updateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('../../store/vaultStore', () => {
  const state = {
    items: [],
    loading: false,
    fetch: () => {},
    create: createMock,
    update: updateMock,
    delete: () => {},
    generatePassword: async () => '',
  };
  return {
    useVaultStore: (selector?: (s: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

function makeEditingItem(): VaultItem {
  return {
    id: 'cap-edit',
    type: 'timeCapsule',
    title: '原标题',
    fields: [{ id: 'f1', name: 'message', value: '原内容', isSensitive: true }],
    isHidden: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    timeCapsule: { unlockAt: new Date(Date.now() - 86_400_000).toISOString() },
  };
}

beforeEach(() => {
  createMock.mockClear();
  updateMock.mockClear();
});

describe('TimeCapsuleEditor', () => {
  it('新建模式渲染三个字段', () => {
    render(
      <MemoryRouter>
        <TimeCapsuleEditor />
      </MemoryRouter>,
    );
    expect(screen.getByPlaceholderText(/写给一年后的你/)).toBeInTheDocument();
    expect(screen.getByLabelText('解锁时间')).toBeInTheDocument();
    expect(screen.getByLabelText('致未来的自己')).toBeInTheDocument();
    expect(screen.getByText('封存胶囊')).toBeInTheDocument();
  });

  it('标题空:提交显示"请填写标题"', () => {
    render(
      <MemoryRouter>
        <TimeCapsuleEditor />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('封存胶囊'));
    expect(screen.getByText('请填写标题')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('正文空:提交显示"请写给未来自己的话"', () => {
    render(
      <MemoryRouter>
        <TimeCapsuleEditor />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText(/写给一年后的你/), { target: { value: '标题' } });
    fireEvent.click(screen.getByText('封存胶囊'));
    expect(screen.getByText('请写给未来自己的话')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('解锁时间在过去:提交显示"解锁时间必须在未来"', () => {
    render(
      <MemoryRouter>
        <TimeCapsuleEditor />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText(/写给一年后的你/), { target: { value: '标题' } });
    // 设为过去时间(2020-01-01 00:00)
    fireEvent.change(screen.getByLabelText('解锁时间'), { target: { value: '2020-01-01T00:00' } });
    fireEvent.change(screen.getByLabelText('致未来的自己'), { target: { value: '正文' } });
    fireEvent.click(screen.getByText('封存胶囊'));
    expect(screen.getByText('解锁时间必须在未来')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('提交成功:调用 create 且表单清空', async () => {
    render(
      <MemoryRouter>
        <TimeCapsuleEditor />
      </MemoryRouter>,
    );
    const future = new Date(Date.now() + 7 * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;

    fireEvent.change(screen.getByPlaceholderText(/写给一年后的你/), { target: { value: '一年后' } });
    fireEvent.change(screen.getByLabelText('解锁时间'), { target: { value: local } });
    fireEvent.change(screen.getByLabelText('致未来的自己'), { target: { value: '正文内容' } });
    fireEvent.click(screen.getByText('封存胶囊'));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const arg = createMock.mock.calls[0][0];
    expect(arg.type).toBe('timeCapsule');
    expect(arg.title).toBe('一年后');
    expect(arg.fields[0].name).toBe('message');
    expect(arg.fields[0].value).toBe('正文内容');
    expect(arg.fields[0].isSensitive).toBe(true);
    expect(arg.timeCapsule.unlockAt).toBeTypeOf('string');
    expect(Date.parse(arg.timeCapsule.unlockAt)).toBeGreaterThan(Date.now());

    // 表单清空
    expect(screen.getByPlaceholderText(/写给一年后的你/)).toHaveValue('');
  });

  it('编辑模式:unlockAt 字段 disabled,提交调用 update', async () => {
    render(
      <MemoryRouter>
        <TimeCapsuleEditor editingItem={makeEditingItem()} onDone={() => {}} />
      </MemoryRouter>,
    );
    const unlockInput = screen.getByLabelText('解锁时间');
    expect(unlockInput).toBeDisabled();
    // 修改标题与正文
    fireEvent.change(screen.getByPlaceholderText(/写给一年后的你/), { target: { value: '新标题' } });
    fireEvent.change(screen.getByLabelText('致未来的自己'), { target: { value: '新正文' } });
    fireEvent.click(screen.getByText('保存修改'));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith('cap-edit', expect.objectContaining({
      title: '新标题',
      fields: expect.arrayContaining([expect.objectContaining({ name: 'message', value: '新正文' })]),
    }));
  });
});
