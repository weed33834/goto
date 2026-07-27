// AppStore 类型定义：组合所有 slice 接口
// 使用 import type 避免运行时循环依赖

import type { TasksSlice } from './slices/tasksSlice';
import type { ProjectsSlice } from './slices/projectsSlice';
import type { CategoriesSlice } from './slices/categoriesSlice';
import type { TagsSlice } from './slices/tagsSlice';
import type { VaultSlice } from './slices/vaultSlice';
import type { UISlice } from './slices/uiSlice';
import type { PreferencesSlice } from './slices/preferencesSlice';
import type { SyncSlice } from './slices/syncSlice';
import type { SearchSlice } from './slices/searchSlice';
import type { SmartListsSlice } from './slices/smartListsSlice';
import type { HabitsSlice } from './slices/habitsSlice';
import type { TemplatesSlice } from './slices/templatesSlice';
import type { GoalsSlice } from './slices/goalsSlice';
import type { PluginsSlice } from './slices/pluginsSlice';
import type { PersistenceSlice } from './slices/persistenceSlice';

// AppStore 通过 extends 所有 slice 接口组合而成
export interface AppStore extends
  TasksSlice,
  ProjectsSlice,
  CategoriesSlice,
  TagsSlice,
  VaultSlice,
  UISlice,
  PreferencesSlice,
  SyncSlice,
  SearchSlice,
  SmartListsSlice,
  HabitsSlice,
  TemplatesSlice,
  GoalsSlice,
  PluginsSlice,
  PersistenceSlice {}
