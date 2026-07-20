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
import { createPersistenceSlice } from './slices/persistenceSlice';
import { pluginManager, autoTagPlugin } from '../plugins';

// 注册内置插件。第三方插件可在应用启动后追加注册。
// 放在 store 创建之前，确保 addTask 等动作首次触发时插件已就位。
if (!pluginManager.has(autoTagPlugin.id)) {
  pluginManager.register(autoTagPlugin);
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
  ...createPersistenceSlice(...a),
}));
