// @vitest-environment jsdom
// Habits Slice 单元测试(s3)—— add / update / delete / toggleHabitEntry
//
// 不测 saveData 的 IndexedDB 落盘(jsdom 无 IDB,会告警但不阻断);
// 只验证 set 后的 state 与返回值。
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../index';

beforeEach(() => {
  useAppStore.setState({ habits: [] });
});

describe('habitsSlice', () => {
  describe('addHabit', () => {
    it('返回新 id,habits 增 1,默认值正确', () => {
      const id = useAppStore.getState().addHabit({ name: '阅读', cadence: 'daily' });
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);

      const habits = useAppStore.getState().habits;
      expect(habits).toHaveLength(1);
      expect(habits[0].id).toBe(id);
      expect(habits[0].name).toBe('阅读');
      expect(habits[0].cadence).toBe('daily');
      expect(habits[0].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(habits[0].archived).toBe(false);
      expect(habits[0].completedDates).toEqual([]);
      // createdAt/updatedAt 是 Date 对象
      expect(habits[0].createdAt).toBeInstanceOf(Date);
      expect(habits[0].updatedAt).toBeInstanceOf(Date);
    });

    it('name 含空白 → trim 后保存', () => {
      useAppStore.getState().addHabit({ name: '  每日阅读  ', cadence: 'daily' });
      expect(useAppStore.getState().habits[0].name).toBe('每日阅读');
    });

    it('description 仅空白 → 落库为 undefined(不存空串)', () => {
      useAppStore.getState().addHabit({ name: 'A', description: '   ', cadence: 'daily' });
      expect(useAppStore.getState().habits[0].description).toBeUndefined();
    });

    it('多条时颜色循环分配(HABIT_COLORS.length=6)', () => {
      for (let i = 0; i < 8; i++) {
        useAppStore.getState().addHabit({ name: `H${i}`, cadence: 'daily' });
      }
      const colors = useAppStore.getState().habits.map((h) => h.color);
      // 第 0 个与第 6 个颜色应相同(模 6 循环)
      expect(colors[0]).toBe(colors[6]);
      // 前 6 个颜色互不相同
      expect(new Set(colors.slice(0, 6)).size).toBe(6);
    });

    it('weekly cadence 正确落库', () => {
      useAppStore.getState().addHabit({ name: '周复盘', cadence: 'weekly' });
      expect(useAppStore.getState().habits[0].cadence).toBe('weekly');
    });
  });

  describe('updateHabit', () => {
    it('更新 name 与 description,updatedAt 推进', async () => {
      const id = useAppStore.getState().addHabit({ name: '原', cadence: 'daily' });
      const before = useAppStore.getState().habits[0];
      await new Promise((r) => setTimeout(r, 5));
      useAppStore.getState().updateHabit(id, { name: '新', description: '备注' });
      const after = useAppStore.getState().habits[0];
      expect(after.name).toBe('新');
      expect(after.description).toBe('备注');
      expect(after.updatedAt).not.toBe(before.updatedAt);
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    });

    it('name 含空白 → trim 后保存', () => {
      const id = useAppStore.getState().addHabit({ name: '原', cadence: 'daily' });
      useAppStore.getState().updateHabit(id, { name: '  新名称  ' });
      expect(useAppStore.getState().habits[0].name).toBe('新名称');
    });

    it('description 仅空白 → 落库为 undefined', () => {
      const id = useAppStore.getState().addHabit({ name: 'A', description: '备注', cadence: 'daily' });
      useAppStore.getState().updateHabit(id, { description: '   ' });
      expect(useAppStore.getState().habits[0].description).toBeUndefined();
    });

    it('archived 切换为 true', () => {
      const id = useAppStore.getState().addHabit({ name: 'A', cadence: 'daily' });
      useAppStore.getState().updateHabit(id, { archived: true });
      expect(useAppStore.getState().habits[0].archived).toBe(true);
    });

    it('不存在的 id → 静默无操作', () => {
      useAppStore.getState().addHabit({ name: 'A', cadence: 'daily' });
      useAppStore.getState().updateHabit('nonexistent', { name: 'X' });
      expect(useAppStore.getState().habits).toHaveLength(1);
      expect(useAppStore.getState().habits[0].name).toBe('A');
    });

    it('id 字段不可被覆盖(updates.id 被忽略)', () => {
      const id = useAppStore.getState().addHabit({ name: 'A', cadence: 'daily' });
      // Partial<Habit> 允许传入 id,但 slice 实现强制保留原 id,验证运行时被忽略。
      useAppStore.getState().updateHabit(id, { id: 'tampered', name: 'B' });
      expect(useAppStore.getState().habits[0].id).toBe(id);
      expect(useAppStore.getState().habits[0].name).toBe('B');
    });
  });

  describe('deleteHabit', () => {
    it('删除后数组减 1', () => {
      const id1 = useAppStore.getState().addHabit({ name: 'A', cadence: 'daily' });
      const id2 = useAppStore.getState().addHabit({ name: 'B', cadence: 'daily' });
      useAppStore.getState().deleteHabit(id1);
      const habits = useAppStore.getState().habits;
      expect(habits).toHaveLength(1);
      expect(habits[0].id).toBe(id2);
    });

    it('不存在的 id → 静默无操作', () => {
      useAppStore.getState().addHabit({ name: 'A', cadence: 'daily' });
      useAppStore.getState().deleteHabit('nonexistent');
      expect(useAppStore.getState().habits).toHaveLength(1);
    });
  });

  describe('toggleHabitEntry', () => {
    it('未打卡日 → 补上,completedDates 含该日期', () => {
      const id = useAppStore.getState().addHabit({ name: 'A', cadence: 'daily' });
      useAppStore.getState().toggleHabitEntry(id, '2026-07-26');
      expect(useAppStore.getState().habits[0].completedDates).toContain('2026-07-26');
    });

    it('已打卡日 → 取消,completedDates 不含该日期', () => {
      const id = useAppStore.getState().addHabit({ name: 'A', cadence: 'daily' });
      useAppStore.getState().toggleHabitEntry(id, '2026-07-26');
      useAppStore.getState().toggleHabitEntry(id, '2026-07-26');
      expect(useAppStore.getState().habits[0].completedDates).not.toContain('2026-07-26');
    });

    it('多次打卡不同日期 → completedDates 排序保存', () => {
      const id = useAppStore.getState().addHabit({ name: 'A', cadence: 'daily' });
      // 故意乱序打卡
      useAppStore.getState().toggleHabitEntry(id, '2026-07-26');
      useAppStore.getState().toggleHabitEntry(id, '2026-07-24');
      useAppStore.getState().toggleHabitEntry(id, '2026-07-25');
      expect(useAppStore.getState().habits[0].completedDates).toEqual([
        '2026-07-24',
        '2026-07-25',
        '2026-07-26',
      ]);
    });

    it('同一日期重复 toggle 不产生重复项', () => {
      const id = useAppStore.getState().addHabit({ name: 'A', cadence: 'daily' });
      useAppStore.getState().toggleHabitEntry(id, '2026-07-26');
      useAppStore.getState().toggleHabitEntry(id, '2026-07-26');
      useAppStore.getState().toggleHabitEntry(id, '2026-07-26');
      // 三次 toggle:补上 → 取消 → 补上,最终 1 条
      expect(useAppStore.getState().habits[0].completedDates).toEqual(['2026-07-26']);
    });

    it('toggle 后 updatedAt 推进', async () => {
      const id = useAppStore.getState().addHabit({ name: 'A', cadence: 'daily' });
      const before = useAppStore.getState().habits[0].updatedAt;
      await new Promise((r) => setTimeout(r, 5));
      useAppStore.getState().toggleHabitEntry(id, '2026-07-26');
      const after = useAppStore.getState().habits[0].updatedAt;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });

    it('不存在的 habitId → 静默无操作', () => {
      useAppStore.getState().toggleHabitEntry('nonexistent', '2026-07-26');
      expect(useAppStore.getState().habits).toHaveLength(0);
    });
  });
});
