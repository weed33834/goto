// @vitest-environment jsdom
// SmartLists Slice 单元测试 —— add / update / delete + order 自增 + 空值拒绝。
//
// 不测 saveData 的 IndexedDB 落盘(jsdom 无 IDB,会告警但不阻断);
// 只验证 set 后的 state 与返回值。
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../index';

beforeEach(() => {
  useAppStore.setState({ smartLists: [] });
});

describe('smartListsSlice', () => {
  it('addSmartList:返回新 id,smartLists 增 1,order 从 1 开始', () => {
    const id = useAppStore.getState().addSmartList({ name: '今日紧急', query: 'today & p1' });
    expect(id).not.toBeNull();
    const lists = useAppStore.getState().smartLists;
    expect(lists).toHaveLength(1);
    expect(lists[0].id).toBe(id);
    expect(lists[0].name).toBe('今日紧急');
    expect(lists[0].query).toBe('today & p1');
    expect(lists[0].order).toBe(1);
    expect(lists[0].createdAt).toBeInstanceOf(Date);
    expect(lists[0].updatedAt).toBeInstanceOf(Date);
  });

  it('addSmartList:多条时 order 单调递增', () => {
    useAppStore.getState().addSmartList({ name: 'A', query: 'today' });
    useAppStore.getState().addSmartList({ name: 'B', query: 'tomorrow' });
    useAppStore.getState().addSmartList({ name: 'C', query: 'overdue' });
    const lists = useAppStore.getState().smartLists;
    expect(lists.map((l) => l.order)).toEqual([1, 2, 3]);
  });

  it('addSmartList:name 含空白 → trim 后保存', () => {
    const id = useAppStore.getState().addSmartList({ name: '  今日  ', query: 'today' });
    expect(id).not.toBeNull();
    expect(useAppStore.getState().smartLists[0].name).toBe('今日');
  });

  it('addSmartList:空 name 或空 query → 拒绝(返 null,不入数组)', () => {
    expect(useAppStore.getState().addSmartList({ name: '', query: 'today' })).toBeNull();
    expect(useAppStore.getState().addSmartList({ name: 'X', query: '   ' })).toBeNull();
    expect(useAppStore.getState().smartLists).toHaveLength(0);
  });

  it('updateSmartList:更新 name 与 query,updatedAt 为新 Date 实例', async () => {
    const id = useAppStore.getState().addSmartList({ name: '原', query: 'today' });
    const before = useAppStore.getState().smartLists[0];
    // 让时钟推进至少 1ms,避免 new Date() 与 before.updatedAt 同毫秒
    await new Promise((r) => setTimeout(r, 5));
    useAppStore.getState().updateSmartList(id!, { name: '新', query: 'tomorrow & p1' });
    const after = useAppStore.getState().smartLists[0];
    expect(after.name).toBe('新');
    expect(after.query).toBe('tomorrow & p1');
    expect(after.updatedAt).toBeInstanceOf(Date);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('updateSmartList:传入空 name → 不覆盖(保留原值)', () => {
    const id = useAppStore.getState().addSmartList({ name: '原', query: 'today' });
    useAppStore.getState().updateSmartList(id!, { name: '   ' });
    expect(useAppStore.getState().smartLists[0].name).toBe('原');
  });

  it('updateSmartList:不存在的 id → 静默无操作', () => {
    useAppStore.getState().addSmartList({ name: 'A', query: 'today' });
    useAppStore.getState().updateSmartList('nonexistent', { name: 'X' });
    expect(useAppStore.getState().smartLists).toHaveLength(1);
    expect(useAppStore.getState().smartLists[0].name).toBe('A');
  });

  it('deleteSmartList:删除后数组减 1', () => {
    const id1 = useAppStore.getState().addSmartList({ name: 'A', query: 'today' });
    const id2 = useAppStore.getState().addSmartList({ name: 'B', query: 'tomorrow' });
    useAppStore.getState().deleteSmartList(id1!);
    const lists = useAppStore.getState().smartLists;
    expect(lists).toHaveLength(1);
    expect(lists[0].id).toBe(id2);
  });

  it('deleteSmartList:不存在的 id → 静默无操作', () => {
    useAppStore.getState().addSmartList({ name: 'A', query: 'today' });
    useAppStore.getState().deleteSmartList('nonexistent');
    expect(useAppStore.getState().smartLists).toHaveLength(1);
  });
});
