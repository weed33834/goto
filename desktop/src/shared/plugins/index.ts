// 插件系统公共出口。
export type { Plugin, PluginHooks, HookName, HookContracts, HookImpl } from './types';
export { PluginManager, pluginManager } from './registry';
export { autoTagPlugin } from './builtinPlugins';
