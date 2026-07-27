// 插件系统公共出口。
export type {
  Plugin,
  PluginHooks,
  HookName,
  HookContracts,
  HookImpl,
  UserPluginConfig,
} from './types';
export { PluginManager, pluginManager } from './registry';
export { autoTagPlugin, BUILTIN_PLUGINS, buildUserPlugin } from './builtinPlugins';
