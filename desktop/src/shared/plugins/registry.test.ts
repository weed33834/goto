import { describe, it, expect, vi } from 'vitest';
import { PluginManager } from './registry';
import { autoTagPlugin } from './builtinPlugins';
import type { Plugin, HookName } from './types';

function newManager() {
  return new PluginManager();
}

describe('PluginManager — register / unregister', () => {
  const make = (id: string): Plugin => ({
    id, name: id, version: '1.0.0', hooks: {},
  });

  it('register stores a plugin and has() reflects it', () => {
    const m = newManager();
    m.register(make('a'));
    expect(m.has('a')).toBe(true);
    expect(m.list()).toHaveLength(1);
  });

  it('register returns the previous plugin with the same id', () => {
    const m = newManager();
    const first = make('a');
    const second = make('a');
    m.register(first);
    const prev = m.register(second);
    expect(prev).toBe(first);
    expect(m.list()).toHaveLength(1);
    expect(m.list()[0]).toBe(second);
  });

  it('unregister removes and returns whether it existed', () => {
    const m = newManager();
    m.register(make('a'));
    expect(m.unregister('a')).toBe(true);
    expect(m.unregister('a')).toBe(false);
  });

  it('clear empties all plugins', () => {
    const m = newManager();
    m.register(make('a'));
    m.register(make('b'));
    m.clear();
    expect(m.list()).toHaveLength(0);
  });
});

describe('PluginManager — invokeSync (pipeline)', () => {
  const HOOK = 'taskBeforeCreate' as HookName;

  it('returns null when no plugin implements the hook', () => {
    const m = newManager();
    m.register({ id: 'p', name: 'p', version: '1.0.0', hooks: {} });
    expect(m.invokeSync(HOOK, { title: 'x' })).toBeNull();
  });

  it('returns the first plugin result when only one implements', () => {
    const m = newManager();
    m.register({
      id: 'p', name: 'p', version: '1.0.0',
      hooks: { taskBeforeCreate: () => ({ priority: 'high' }) } as Plugin['hooks'],
    });
    const out = m.invokeSync(HOOK, { title: 'x' });
    expect(out).toEqual({ priority: 'high' });
  });

  it('chains results: later plugin sees merged input', () => {
    const m = newManager();
    m.register({
      id: 'a', name: 'a', version: '1.0.0',
      hooks: { taskBeforeCreate: (t) => ({ ...t, tags: ['x'] }) } as Plugin['hooks'],
    });
    m.register({
      id: 'b', name: 'b', version: '1.0.0',
      hooks: { taskBeforeCreate: (t) => ({ description: `tagged:${(t as { tags?: string[] }).tags?.join(',')}` }) } as Plugin['hooks'],
    });
    const out = m.invokeSync(HOOK, { title: 'buy milk' });
    // 最后一个非 null 结果胜出，且它看到了 a 的合并结果
    expect(out).toEqual({ description: 'tagged:x' });
  });

  it('isolates a throwing plugin: others still run, error reported', () => {
    const onError = vi.fn();
    const m = new PluginManager({ onError });
    m.register({
      id: 'thrower', name: 't', version: '1.0.0',
      hooks: { taskBeforeCreate: () => { throw new Error('boom'); } } as Plugin['hooks'],
    });
    m.register({
      id: 'ok', name: 'ok', version: '1.0.0',
      hooks: { taskBeforeCreate: () => ({ priority: 'low' }) } as Plugin['hooks'],
    });
    const out = m.invokeSync(HOOK, { title: 'x' });
    expect(out).toEqual({ priority: 'low' });
    expect(onError).toHaveBeenCalledWith('thrower', HOOK, expect.any(Error));
  });

  it('ignores a Promise return in invokeSync and reports it', () => {
    const onError = vi.fn();
    const m = new PluginManager({ onError });
    m.register({
      id: 'async', name: 'a', version: '1.0.0',
      hooks: { taskBeforeCreate: () => Promise.resolve({ priority: 'high' }) as unknown as null } as Plugin['hooks'],
    });
    expect(m.invokeSync(HOOK, { title: 'x' })).toBeNull();
    expect(onError).toHaveBeenCalled();
  });
});

describe('PluginManager — invokeAsync', () => {
  const HOOK = 'taskAfterComplete' as HookName;

  it('awaits async side-effect hooks and collects non-null results', async () => {
    const m = newManager();
    const seen: string[] = [];
    m.register({
      id: 'a', name: 'a', version: '1.0.0',
      hooks: { taskAfterComplete: async () => { seen.push('a'); } } as Plugin['hooks'],
    });
    m.register({
      id: 'b', name: 'b', version: '1.0.0',
      hooks: { taskAfterComplete: () => { seen.push('b'); } } as Plugin['hooks'],
    });
    await m.invokeAsync(HOOK, { id: 't1', title: 'x' } as never);
    expect(seen).toEqual(['a', 'b']);
  });

  it('isolates throwing async plugins', async () => {
    const onError = vi.fn();
    const m = new PluginManager({ onError });
    m.register({
      id: 'bad', name: 'b', version: '1.0.0',
      hooks: { taskAfterComplete: async () => { throw new Error('nope'); } } as Plugin['hooks'],
    });
    m.register({
      id: 'good', name: 'g', version: '1.0.0',
      hooks: { taskAfterComplete: () => undefined } as Plugin['hooks'],
    });
    await expect(m.invokeAsync(HOOK, { id: 't1' } as never)).resolves.toBeDefined();
    expect(onError).toHaveBeenCalledWith('bad', HOOK, expect.any(Error));
  });
});

describe('autoTagPlugin (builtin)', () => {
  it('adds tags for matching keywords', () => {
    const out = autoTagPlugin.hooks.taskBeforeCreate!({ title: 'buy milk at supermarket' } as never) as { tags?: string[] } | null;
    expect(out?.tags).toContain('购物');
  });

  it('matches Chinese keywords', () => {
    const out = autoTagPlugin.hooks.taskBeforeCreate!({ title: '准备周会报告' } as never) as { tags?: string[] } | null;
    expect(out?.tags).toContain('工作');
  });

  it('returns null when no keyword matches', () => {
    expect(autoTagPlugin.hooks.taskBeforeCreate!({ title: 'random thing' } as never)).toBeNull();
  });

  it('does not duplicate existing tags', () => {
    const out = autoTagPlugin.hooks.taskBeforeCreate!({
      title: 'buy milk', tags: ['购物'],
    } as never);
    // 已有「购物」，不应再添加
    expect(out).toBeNull();
  });

  it('integrates with PluginManager.invokeSync', () => {
    const m = newManager();
    m.register(autoTagPlugin);
    const out = m.invokeSync('taskBeforeCreate', { title: 'go for a run' });
    expect(out?.tags).toContain('健康');
  });
});
