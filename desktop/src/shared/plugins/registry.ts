// 插件注册表 — 插件系统的运行时核心。
//
// 用法：
//   import { pluginManager, autoTagPlugin } from '../plugins';
//   pluginManager.register(autoTagPlugin);
//   const overrides = pluginManager.invokeSync('taskBeforeCreate', draftTask);
//
// 设计取舍：
//   - invokeSync / invokeAsync 分开。同步钩子（taskBeforeCreate 这类需要返回值
//     覆盖字段的）走 invokeSync；纯副作用的钩子（taskAfterComplete）可异步。
//   - 同步钩子里，前一个插件返回的非 null 结果会作为下一个插件的输入（链式
//     覆盖），最后一个非 null 结果胜出。这匹配 pluggy firstresult 之外的常见
//     "管道" 语义，且对调用方更可预测。
//   - 插件抛错被隔离并报告到 onError，绝不影响其他插件或宿主流程。

import type { HookName, HookContracts, Plugin, PluginHooks } from './types';

export interface PluginManagerOptions {
  /** 插件抛错时的回调，默认 console.error。生产环境可接到遥测/Toast。 */
  onError?: (pluginId: string, hook: HookName, err: unknown) => void;
}

export class PluginManager {
  private readonly plugins = new Map<string, Plugin>();
  private readonly onError: NonNullable<PluginManagerOptions['onError']>;

  constructor(opts: PluginManagerOptions = {}) {
    this.onError =
      opts.onError ??
      ((id, hook, err) => {
        // 默认行为：打印，不抛。CI/测试可注入自定义回调断言。
        // eslint-disable-next-line no-console
        console.error(`[plugin:${id}] hook "${hook}" threw:`, err);
      });
  }

  /** 注册插件。同 id 重复注册会覆盖旧实例并返回它（便于测试断言）。 */
  register(plugin: Plugin): Plugin | undefined {
    const prev = this.plugins.get(plugin.id);
    this.plugins.set(plugin.id, plugin);
    return prev;
  }

  /** 卸载插件。返回是否确实卸载了。 */
  unregister(id: string): boolean {
    return this.plugins.delete(id);
  }

  /** 是否已注册某插件。 */
  has(id: string): boolean {
    return this.plugins.has(id);
  }

  /** 当前已注册插件列表（按注册顺序）。 */
  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /** 清空所有插件。主要给测试用。 */
  clear(): void {
    this.plugins.clear();
  }

  /**
   * 同步调用一个"管道型"钩子：按注册顺序依次调用实现了该钩子的插件，
   * 前一个非 null 返回值作为下一个的输入，最终返回最后一个非 null 结果。
   * 任一插件抛错被隔离（走 onError），按返回上一个有效结果继续。
   */
  invokeSync<K extends HookName>(
    hook: K,
    initial: HookContracts[K]['args'][0],
  ): HookContracts[K]['result'] {
    let current: HookContracts[K]['args'][0] = initial;
    let lastResult: HookContracts[K]['result'] = null;
    for (const plugin of this.plugins.values()) {
      const impl = (plugin.hooks as PluginHooks)[hook] as
        | ((arg: typeof current) => HookContracts[K]['result'])
        | undefined;
      if (!impl) continue;
      try {
        const out = impl(current);
        // 同步钩子不应返回 Promise；若误返回，忽略其结果并报告。
        if (out && typeof (out as Promise<unknown>).then === 'function') {
          this.onError(plugin.id, hook, new Error('invokeSync hook returned a Promise'));
          continue;
        }
        if (out != null) {
          lastResult = out;
          // 链式覆盖：下一个插件拿到的是已被改过的对象。
          current = { ...(current as object), ...(out as object) } as typeof current;
        }
      } catch (err) {
        this.onError(plugin.id, hook, err);
      }
    }
    return lastResult;
  }

  /**
   * 异步调用一个钩子（通常是副作用型，如 taskAfterComplete）。
   * 收集每个实现了该钩子的插件的（await 后）结果，按注册顺序返回。
   * 任一插件抛错被隔离，对应位置结果为 undefined。
   */
  async invokeAsync<K extends HookName>(
    hook: K,
    ...args: HookContracts[K]['args']
  ): Promise<NonNullable<HookContracts[K]['result']>[]> {
    const results: NonNullable<HookContracts[K]['result']>[] = [];
    for (const plugin of this.plugins.values()) {
      const impl = (plugin.hooks as PluginHooks)[hook] as
        | ((...a: HookContracts[K]['args']) => unknown)
        | undefined;
      if (!impl) continue;
      try {
        const out = await impl(...args);
        if (out != null) {
          results.push(out as NonNullable<HookContracts[K]['result']>);
        }
      } catch (err) {
        this.onError(plugin.id, hook, err);
      }
    }
    return results;
  }
}

/** 全局单例。组件/切片直接 import 使用；测试可 new PluginManager() 隔离。 */
export const pluginManager = new PluginManager();
