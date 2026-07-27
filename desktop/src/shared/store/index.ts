// Store 入口文件 — 组合所有 slice
// 使用 Zustand slice 模式，将单一 store 拆分为多个 slice 文件
// 所有现有代码通过 useAppStore(s => s.xxx) 或 const { xxx } = useAppStore() 访问 store 的方式保持不变

import { create } from 'zustand';
import type { AppStore } from './types';
import { createTasksSlice } from './slices/tasksSlice';
import { createProjectsSlice } from './slices/projectsSlice';
import { createCategoriesSlice } from './slices/categoriesSlice';
import { createTagsSlice } from './slices/tagsSlice';
import { createVaultSlice } from './slices/vaultSlice';
import { createUISlice } from './slices/uiSlice';
import { createPreferencesSlice } from './slices/preferencesSlice';
import { createSyncSlice } from './slices/syncSlice';
import { createSearchSlice } from './slices/searchSlice';
import { createSmartListsSlice } from './slices/smartListsSlice';
import { createHabitsSlice } from './slices/habitsSlice';
import { createTemplatesSlice } from './slices/templatesSlice';
import { createGoalsSlice } from './slices/goalsSlice';
import { createPluginsSlice } from './slices/pluginsSlice';
import { createPersistenceSlice } from './slices/persistenceSlice';
import { pluginManager, autoTagPlugin, buildUserPlugin } from '../plugins';
import type { UserPluginConfig } from '../plugins';
import { STORAGE_KEYS } from './constants';
import { browserStorage } from '../utils/browserStorage';

// 注册内置插件。第三方插件可在应用启动后追加注册。
// 放在 store 创建之前，确保 addTask 等动作首次触发时插件已就位。
if (!pluginManager.has(autoTagPlugin.id)) {
  pluginManager.register(autoTagPlugin);
}

/**
 * 启动时从持久化存储恢复插件状态(userPlugins + disabledPluginIds)。
 *
 * 流程:
 *   1. 读取并校验 userPlugins / disabledPluginIds
 *   2. set 到 store(让 PluginPage 能立即展示)
 *   3. 同步到运行时 PluginManager:disabled 中的 unregister,未禁用的 user 重建注册
 *
 * 异步执行不阻塞 store 创建;首帧 PluginPage 可能短暂为空,可接受。
 * 失败仅 warn,不让插件持久化错误阻断应用启动。
 */
async function restorePluginState() {
  try {
    const [userPluginsRaw, disabledRaw] = await Promise.all([
      browserStorage.getItem(STORAGE_KEYS.PLUGINS),
      browserStorage.getItem(`${STORAGE_KEYS.PLUGINS}__disabled`),
    ]);

    let userPlugins: UserPluginConfig[] = [];
    if (userPluginsRaw) {
      try {
        const parsed = JSON.parse(userPluginsRaw);
        if (Array.isArray(parsed)) {
          // 仅保留形状合法的项,过滤掉损坏数据
          userPlugins = parsed.filter(
            (p): p is UserPluginConfig =>
              p != null &&
              typeof p === 'object' &&
              typeof p.id === 'string' &&
              typeof p.name === 'string' &&
              Array.isArray(p.rules),
          );
        }
      } catch (e) {
        console.warn('userPlugins 数据损坏,跳过恢复:', e);
      }
    }

    let disabledIds: string[] = [];
    if (disabledRaw) {
      try {
        const parsed = JSON.parse(disabledRaw);
        if (Array.isArray(parsed)) {
          disabledIds = parsed.filter((id): id is string => typeof id === 'string');
        }
      } catch (e) {
        console.warn('disabledPluginIds 数据损坏,跳过恢复:', e);
      }
    }

    // 1. set 到 store,让 PluginPage 立即反映持久化状态
    useAppStore.setState({ userPlugins, disabledPluginIds: disabledIds });

    // 2. 同步到运行时 PluginManager
    for (const id of disabledIds) {
      if (pluginManager.has(id)) pluginManager.unregister(id);
    }
    for (const cfg of userPlugins) {
      if (!disabledIds.includes(cfg.id)) {
        pluginManager.register(buildUserPlugin(cfg));
      }
    }
  } catch (e) {
    console.warn('插件状态恢复失败:', e);
  }
}

export const useAppStore = create<AppStore>()((...a) => ({
  ...createTasksSlice(...a),
  ...createProjectsSlice(...a),
  ...createCategoriesSlice(...a),
  ...createTagsSlice(...a),
  ...createVaultSlice(...a),
  ...createUISlice(...a),
  ...createPreferencesSlice(...a),
  ...createSyncSlice(...a),
  ...createSearchSlice(...a),
  ...createSmartListsSlice(...a),
  ...createHabitsSlice(...a),
  ...createTemplatesSlice(...a),
  ...createGoalsSlice(...a),
  ...createPluginsSlice(...a),
  ...createPersistenceSlice(...a),
}));

// 异步恢复持久化的插件状态。useAppStore 已创建,setState 可直接调用。
void restorePluginState();
