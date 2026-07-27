// pluginsSlice 单元测试 — 验证启停 / 增删 / 导入导出闭环。
//
// 测试范围:
//   - addUserPlugin:写入 userPlugins + 同步 pluginManager
//   - removeUserPlugin:从 userPlugins 与 disabledPluginIds 同步清理
//   - togglePlugin:更新 disabledPluginIds + 同步 pluginManager register/unregister
//   - importPluginFromJson:合法 JSON / 非法 JSON / 缺字段 / 规则字段错类型
//   - exportPluginToJson:仅 user 插件可导出,builtin 抛错
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../index';
import { pluginManager, autoTagPlugin } from '../../plugins';

// 在每个测试前重置 store 的插件状态,避免跨测试污染。
beforeEach(() => {
  // 清掉所有 user 插件注册,保留 builtin(autoTagPlugin)
  const state = useAppStore.getState();
  for (const p of state.userPlugins) {
    pluginManager.unregister(p.id);
  }
  // 重新确保 builtin 注册(可能在之前测试中被 unregister)
  if (!pluginManager.has(autoTagPlugin.id)) {
    pluginManager.register(autoTagPlugin);
  }
  useAppStore.setState({
    userPlugins: [],
    disabledPluginIds: [],
  });
});

describe('pluginsSlice — addUserPlugin', () => {
  it('appends to userPlugins and registers with pluginManager', () => {
    const id = useAppStore.getState().addUserPlugin({
      name: '测试',
      rules: [{ tags: ['工作'], words: ['会议'] }],
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const state = useAppStore.getState();
    expect(state.userPlugins).toHaveLength(1);
    expect(state.userPlugins[0].id).toBe(id);
    expect(pluginManager.has(id)).toBe(true);
  });

  it('generated config has createdAt ISO string', () => {
    const id = useAppStore.getState().addUserPlugin({
      name: '测试',
      rules: [{ tags: ['x'], words: ['y'] }],
    });
    const cfg = useAppStore.getState().userPlugins.find((p) => p.id === id);
    expect(cfg).toBeDefined();
    // ISO 字符串应能被 Date 解析
    expect(() => new Date(cfg!.createdAt)).not.toThrow();
    expect(Number.isNaN(new Date(cfg!.createdAt).getTime())).toBe(false);
  });
});

describe('pluginsSlice — removeUserPlugin', () => {
  it('removes from userPlugins and unregisters from pluginManager', () => {
    const id = useAppStore.getState().addUserPlugin({
      name: '待删除',
      rules: [{ tags: ['x'], words: ['y'] }],
    });
    expect(pluginManager.has(id)).toBe(true);

    useAppStore.getState().removeUserPlugin(id);

    const state = useAppStore.getState();
    expect(state.userPlugins.find((p) => p.id === id)).toBeUndefined();
    expect(pluginManager.has(id)).toBe(false);
  });

  it('cleans up disabledPluginIds when removing a disabled user plugin', () => {
    const id = useAppStore.getState().addUserPlugin({
      name: '禁用后删除',
      rules: [{ tags: ['x'], words: ['y'] }],
    });
    useAppStore.getState().togglePlugin(id, false);
    expect(useAppStore.getState().disabledPluginIds).toContain(id);

    useAppStore.getState().removeUserPlugin(id);
    expect(useAppStore.getState().disabledPluginIds).not.toContain(id);
  });

  it('is a no-op for unknown id', () => {
    const before = useAppStore.getState().userPlugins.length;
    useAppStore.getState().removeUserPlugin('does-not-exist');
    expect(useAppStore.getState().userPlugins.length).toBe(before);
  });
});

describe('pluginsSlice — togglePlugin', () => {
  it('disabling a user plugin unregisters it from pluginManager', () => {
    const id = useAppStore.getState().addUserPlugin({
      name: '禁用测试',
      rules: [{ tags: ['x'], words: ['y'] }],
    });
    expect(pluginManager.has(id)).toBe(true);

    useAppStore.getState().togglePlugin(id, false);
    expect(useAppStore.getState().disabledPluginIds).toContain(id);
    expect(pluginManager.has(id)).toBe(false);
  });

  it('re-enabling a user plugin re-registers it (config preserved)', () => {
    const id = useAppStore.getState().addUserPlugin({
      name: '重新启用',
      rules: [{ tags: ['工作'], words: ['meeting'] }],
    });
    useAppStore.getState().togglePlugin(id, false);
    expect(pluginManager.has(id)).toBe(false);

    useAppStore.getState().togglePlugin(id, true);
    expect(pluginManager.has(id)).toBe(true);

    // 验证插件实际可用(不只是注册了)
    const out = pluginManager.invokeSync('taskBeforeCreate', { title: 'team meeting' });
    expect(out?.tags).toContain('工作');
  });

  it('disabling a builtin plugin unregisters it', () => {
    useAppStore.getState().togglePlugin('builtin.auto-tag', false);
    expect(useAppStore.getState().disabledPluginIds).toContain('builtin.auto-tag');
    expect(pluginManager.has('builtin.auto-tag')).toBe(false);
  });

  it('re-enabling a builtin plugin re-registers it', () => {
    useAppStore.getState().togglePlugin('builtin.auto-tag', false);
    expect(pluginManager.has('builtin.auto-tag')).toBe(false);

    useAppStore.getState().togglePlugin('builtin.auto-tag', true);
    expect(pluginManager.has('builtin.auto-tag')).toBe(true);
    expect(useAppStore.getState().disabledPluginIds).not.toContain('builtin.auto-tag');
  });
});

describe('pluginsSlice — importPluginFromJson', () => {
  it('parses valid JSON and registers a user plugin', () => {
    const json = JSON.stringify({
      name: '导入的插件',
      description: '从 JSON 导入',
      rules: [{ tags: ['工作'], words: ['meeting'] }],
    });
    const id = useAppStore.getState().importPluginFromJson(json);
    expect(typeof id).toBe('string');

    const cfg = useAppStore.getState().userPlugins.find((p) => p.id === id);
    expect(cfg?.name).toBe('导入的插件');
    expect(cfg?.rules).toHaveLength(1);
    expect(pluginManager.has(id)).toBe(true);
  });

  it('throws on invalid JSON', () => {
    expect(() => useAppStore.getState().importPluginFromJson('not json')).toThrow();
  });

  it('throws when name is missing', () => {
    const json = JSON.stringify({ rules: [] });
    expect(() => useAppStore.getState().importPluginFromJson(json)).toThrow(/name/);
  });

  it('throws when rules is not an array', () => {
    const json = JSON.stringify({ name: 'x', rules: 'not array' });
    expect(() => useAppStore.getState().importPluginFromJson(json)).toThrow(/rules/);
  });

  it('throws when a rule lacks tags or words', () => {
    const json = JSON.stringify({
      name: 'x',
      rules: [{ tags: ['ok'] }],  // 缺 words
    });
    expect(() => useAppStore.getState().importPluginFromJson(json)).toThrow(/tags 与 words/);
  });
});

describe('pluginsSlice — exportPluginToJson', () => {
  it('exports a user plugin as JSON containing name and rules', () => {
    const id = useAppStore.getState().addUserPlugin({
      name: '导出测试',
      rules: [{ tags: ['x'], words: ['y'] }],
    });
    const json = useAppStore.getState().exportPluginToJson(id);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('导出测试');
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.id).toBe(id);
  });

  it('exported JSON can be re-imported to produce an equivalent plugin', () => {
    const id = useAppStore.getState().addUserPlugin({
      name: '导出再导入',
      description: 'round-trip',
      rules: [{ tags: ['工作'], words: ['meeting'] }],
    });
    const json = useAppStore.getState().exportPluginToJson(id);
    const newId = useAppStore.getState().importPluginFromJson(json);

    const cfg = useAppStore.getState().userPlugins.find((p) => p.id === newId);
    expect(cfg?.name).toBe('导出再导入');
    expect(cfg?.description).toBe('round-trip');
    expect(cfg?.rules).toHaveLength(1);
  });

  it('throws when exporting a builtin plugin', () => {
    expect(() => useAppStore.getState().exportPluginToJson('builtin.auto-tag')).toThrow();
  });

  it('throws when exporting an unknown id', () => {
    expect(() => useAppStore.getState().exportPluginToJson('no-such-plugin')).toThrow();
  });
});
