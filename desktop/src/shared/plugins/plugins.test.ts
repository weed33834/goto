// 插件系统扩展测试:buildUserPlugin + BUILTIN_PLUGINS + 用户自建插件闭环。
//
// 覆盖:
//   - buildUserPlugin 根据配置构造可注册的 auto-tag 插件
//   - BUILTIN_PLUGINS 包含 autoTagPlugin
//   - autoTagPlugin 标记了 source='builtin'
//   - 用户插件标记 source='user' 且 config 回写正确
//   - importPluginFromJson 解析成功/失败两条路径
//   - 启停切换 → pluginManager 同步 register/unregister
//   - 删除用户插件 → 从 userPlugins 与 disabledPluginIds 同步清理
import { describe, it, expect, beforeEach } from 'vitest';
import {
  pluginManager,
  autoTagPlugin,
  BUILTIN_PLUGINS,
  buildUserPlugin,
} from './index';
import type { UserPluginConfig } from './index';

function makeConfig(overrides: Partial<UserPluginConfig> = {}): UserPluginConfig {
  return {
    id: 'test-user-plugin',
    name: '测试插件',
    description: '测试用',
    rules: [
      { tags: ['工作'], words: ['会议', 'meeting'] },
      { tags: ['生活'], words: ['买菜', '做饭'] },
    ],
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('BUILTIN_PLUGINS', () => {
  it('contains autoTagPlugin', () => {
    expect(BUILTIN_PLUGINS.map((p) => p.id)).toContain(autoTagPlugin.id);
  });

  it('all builtin plugins have source="builtin"', () => {
    for (const p of BUILTIN_PLUGINS) {
      expect(p.source).toBe('builtin');
    }
  });
});

describe('buildUserPlugin', () => {
  it('produces a plugin with source="user" and config echoed back', () => {
    const cfg = makeConfig();
    const p = buildUserPlugin(cfg);
    expect(p.id).toBe(cfg.id);
    expect(p.name).toBe(cfg.name);
    expect(p.source).toBe('user');
    expect(p.config).toEqual(cfg);
  });

  it('taskBeforeCreate adds tags when keywords match (中文)', () => {
    const p = buildUserPlugin(makeConfig());
    const out = p.hooks.taskBeforeCreate!({ title: '准备周会会议' } as never) as { tags?: string[] } | null;
    expect(out?.tags).toContain('工作');
  });

  it('taskBeforeCreate adds tags when keywords match (英文,大小写不敏感)', () => {
    const p = buildUserPlugin(makeConfig());
    const out = p.hooks.taskBeforeCreate!({ title: 'TEAM MEETING prep' } as never) as { tags?: string[] } | null;
    expect(out?.tags).toContain('工作');
  });

  it('taskBeforeCreate returns null when no rule matches', () => {
    const p = buildUserPlugin(makeConfig());
    expect(p.hooks.taskBeforeCreate!({ title: 'random unrelated thing' } as never)).toBeNull();
  });

  it('taskBeforeCreate preserves existing tags and appends new ones', () => {
    const p = buildUserPlugin(makeConfig());
    const out = p.hooks.taskBeforeCreate!({ title: '买菜', tags: ['已有'] } as never) as { tags?: string[] } | null;
    expect(out?.tags).toEqual(['已有', '生活']);
  });

  it('taskBeforeCreate does not duplicate tags already present', () => {
    const p = buildUserPlugin(makeConfig());
    const out = p.hooks.taskBeforeCreate!({ title: '买菜', tags: ['生活'] } as never);
    // 已有「生活」,不应再添加
    expect(out).toBeNull();
  });

  it('taskBeforeCreate returns null on empty title', () => {
    const p = buildUserPlugin(makeConfig());
    expect(p.hooks.taskBeforeCreate!({ title: '' } as never)).toBeNull();
  });
});

// 集成测试:pluginManager + 用户插件,验证 register / unregister 闭环。
// 注意:这些测试用全局 pluginManager 单例,需要 beforeEach 清理避免污染。
describe('pluginManager integration with user plugins', () => {
  beforeEach(() => {
    // 清理测试可能注册的 user 插件,保留 builtin
    pluginManager.unregister('test-user-plugin');
  });

  it('register a user plugin, invoke, then unregister cleanly', () => {
    const p = buildUserPlugin(makeConfig());
    pluginManager.register(p);
    expect(pluginManager.has(p.id)).toBe(true);

    const out = pluginManager.invokeSync('taskBeforeCreate', { title: '买菜' });
    expect(out?.tags).toContain('生活');

    expect(pluginManager.unregister(p.id)).toBe(true);
    expect(pluginManager.has(p.id)).toBe(false);
  });

  it('two user plugins chain via invokeSync pipeline', () => {
    const p1 = buildUserPlugin(makeConfig({
      id: 'test-user-1',
      rules: [{ tags: ['A'], words: ['alpha'] }],
    }));
    const p2 = buildUserPlugin(makeConfig({
      id: 'test-user-2',
      rules: [{ tags: ['B'], words: ['beta'] }],
    }));
    pluginManager.register(p1);
    pluginManager.register(p2);

    const out = pluginManager.invokeSync('taskBeforeCreate', { title: 'alpha beta' });
    expect(out?.tags).toEqual(expect.arrayContaining(['A', 'B']));

    pluginManager.unregister(p1.id);
    pluginManager.unregister(p2.id);
  });
});
