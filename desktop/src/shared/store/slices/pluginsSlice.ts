// Plugins Slice — 插件管理状态(启停、新建、删除、导入)。
//
// 设计:
//   - userPlugins: 用户自建/导入的插件配置,持久化到 AsyncStorage。
//   - disabledPluginIds: 被禁用的插件 id(包括 builtin 与 user),持久化。
//   - 启动时(store/index.ts):先 register builtin,再 register userPlugins 中
//     未在 disabledPluginIds 内的;disabledPluginIds 内的不 register。
//   - togglePlugin:切换启停 → register/unregister + 更新 disabledPluginIds。
//   - addUserPlugin:新建用户插件 → register + 加入 userPlugins。
//   - removeUserPlugin:删除用户插件 → unregister + 从 userPlugins 移除。
//
// 与 PluginManager 的协作:本 slice 是"配置源",PluginManager 是"运行时"。
// slice 状态变化时同步到 PluginManager,PluginManager 抛错不影响 slice 状态。
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { UserPluginConfig } from '../../plugins';
import {
  pluginManager,
  buildUserPlugin,
  BUILTIN_PLUGINS,
} from '../../plugins';
import { generateId } from '../constants';

export interface PluginsSlice {
  /** 用户自建/导入的插件配置(持久化)。 */
  userPlugins: UserPluginConfig[];
  /** 被禁用的插件 id 列表(持久化;含 builtin 与 user)。 */
  disabledPluginIds: string[];
  /** 新建一个用户 auto-tag 插件。返回插件 id。 */
  addUserPlugin: (config: Omit<UserPluginConfig, 'id' | 'createdAt'>) => string;
  /** 删除用户插件。builtin 插件不允许删除(调用方应过滤)。 */
  removeUserPlugin: (id: string) => void;
  /** 启用/禁用插件(对 builtin 与 user 均可)。 */
  togglePlugin: (id: string, enabled: boolean) => void;
  /** 从 JSON 字符串导入插件配置。返回新插件 id;解析失败抛错。 */
  importPluginFromJson: (json: string) => string;
  /** 导出指定插件的配置为 JSON 字符串(便于分享)。 */
  exportPluginToJson: (id: string) => string;
}

export const createPluginsSlice: StateCreator<AppStore, [], [], PluginsSlice> = (
  set,
  get,
) => ({
  userPlugins: [],
  disabledPluginIds: [],

  addUserPlugin: (config) => {
    const id = generateId();
    const fullConfig: UserPluginConfig = {
      ...config,
      id,
      createdAt: new Date().toISOString(),
    };
    const plugin = buildUserPlugin(fullConfig);
    pluginManager.register(plugin);
    set((state) => ({ userPlugins: [...state.userPlugins, fullConfig] }));
    get().saveData();
    return id;
  },

  removeUserPlugin: (id) => {
    // 仅允许删除 user 插件;builtin 通过 togglePlugin 禁用。
    const exists = get().userPlugins.some((p) => p.id === id);
    if (!exists) return;
    pluginManager.unregister(id);
    set((state) => ({
      userPlugins: state.userPlugins.filter((p) => p.id !== id),
      // 清理 disabledPluginIds 中的残留,避免脏数据。
      disabledPluginIds: state.disabledPluginIds.filter((pid) => pid !== id),
    }));
    get().saveData();
  },

  togglePlugin: (id, enabled) => {
    set((state) => {
      const next = enabled
        ? state.disabledPluginIds.filter((pid) => pid !== id)
        : [...state.disabledPluginIds, id];
      return { disabledPluginIds: next };
    });

    // 同步到运行时 PluginManager。
    if (enabled) {
      // user 插件:从配置重建并 register
      const userConfig = get().userPlugins.find((p) => p.id === id);
      if (userConfig) {
        pluginManager.register(buildUserPlugin(userConfig));
      } else {
        // builtin 插件:重新 register 同一个对象引用。
        // BUILTIN_PLUGINS 表是固定的,从这查回即可。
        const builtin = BUILTIN_PLUGINS.find((p) => p.id === id);
        if (builtin) pluginManager.register(builtin);
      }
    } else {
      pluginManager.unregister(id);
    }
    get().saveData();
  },

  importPluginFromJson: (json) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      throw new Error(`JSON 解析失败:${e instanceof Error ? e.message : String(e)}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('导入数据必须是 JSON 对象');
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.name !== 'string' || !obj.name.trim()) {
      throw new Error('字段 name 必须为非空字符串');
    }
    if (!Array.isArray(obj.rules)) {
      throw new Error('字段 rules 必须为数组');
    }
    // 校验每条规则
    const rules = obj.rules.map((r, i) => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) {
        throw new Error(`规则 #${i + 1} 必须为对象`);
      }
      const rule = r as Record<string, unknown>;
      if (!Array.isArray(rule.tags) || !Array.isArray(rule.words)) {
        throw new Error(`规则 #${i + 1} 必须包含 tags 与 words 数组`);
      }
      return {
        tags: (rule.tags as unknown[]).filter((t): t is string => typeof t === 'string'),
        words: (rule.words as unknown[]).filter((w): w is string => typeof w === 'string'),
      };
    });
    return get().addUserPlugin({
      name: obj.name.trim(),
      description: typeof obj.description === 'string' ? obj.description : undefined,
      rules,
    });
  },

  exportPluginToJson: (id) => {
    const config = get().userPlugins.find((p) => p.id === id);
    if (!config) throw new Error(`插件 ${id} 不存在或为内置插件(不可导出)`);
    return JSON.stringify(config, null, 2);
  },
});
