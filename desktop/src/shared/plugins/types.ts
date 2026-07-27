// 移动端插件系统 — 类型与钩子规范。
//
// 后端用 Python pluggy（见 backend/app/plugins/hookspecs.py），移动端没有
// 等价运行时，这里实现一个最小的 TS 插件注册表：插件声明它实现的钩子，
// 宿主在关键点调用 PluginManager.invoke 收集结果。设计上和 pluggy 对齐：
//   - 钩子名是字符串契约，由 HookName 联合类型约束；
//   - 多个插件可实现同一钩子，按注册顺序依次执行，结果收集为数组；
//   - 插件抛错不影响其他插件（invoke 内 try/catch 隔离）。
//
// 刻意不引入装饰器或装饰器元数据反射——RN 的 Babel 配置不一定支持，
// 纯对象 + 类型守卫足够，也更利于测试。

import type { Task, Note, AISuggestion } from '../types';

/** 所有可用钩子名。新增钩子时在此联合类型中登记。 */
export type HookName =
  | 'taskBeforeCreate' // 任务创建前：可返回部分字段覆盖
  | 'taskAfterComplete' // 任务完成后：副作用
  | 'noteBeforeSave' // 笔记保存前：可返回部分字段覆盖
  | 'aiEnhanceSuggestions'; // AI 建议生成后：可追加/过滤建议

/** 钩子参数与返回值的契约映射。 */
export interface HookContracts {
  taskBeforeCreate: {
    args: [task: Partial<Task>];
    result: Partial<Task> | null;
  };
  taskAfterComplete: {
    args: [task: Task];
    result: void;
  };
  noteBeforeSave: {
    args: [note: Partial<Note>];
    result: Partial<Note> | null;
  };
  aiEnhanceSuggestions: {
    args: [suggestions: AISuggestion[], context: { title: string }];
    result: AISuggestion[] | null;
  };
}

/** 单个钩子的实现函数类型，由 HookContracts 派生。 */
export type HookImpl<K extends HookName> = (
  ...args: HookContracts[K]['args']
) => HookContracts[K]['result'] | Promise<HookContracts[K]['result']>;

/** 插件实现的一组钩子。未实现的钩子跳过。 */
export type PluginHooks = {
  [K in HookName]?: HookImpl<K>;
};

export interface Plugin {
  /** 唯一 id，用于注册/卸载/去重。 */
  id: string;
  /** 人类可读名。 */
  name: string;
  /** 语义化版本，便于后续做兼容性校验。 */
  version: string;
  /** 该插件实现的钩子集合。 */
  hooks: PluginHooks;
  /** 可选：插件描述，用于设置页展示。 */
  description?: string;
  /**
   * 插件来源:
   * - 'builtin':随应用分发,不可删除,只能启停。
   * - 'user':用户在插件管理页创建/导入,可删除。
   * 缺省视为 'builtin' 以兼容旧 Plugin 对象。
   */
  source?: 'builtin' | 'user';
  /**
   * 用户自建插件的序列化配置(仅 source='user' 有值)。
   * 用于持久化:存到 AsyncStorage 后,下次启动时反序列化重建 Plugin。
   * builtin 插件不需要此字段(代码里直接 register)。
   */
  config?: UserPluginConfig;
}

/**
 * 用户自建 auto-tag 插件的配置。
 * 持久化时只存配置,启动时 buildUserPlugin(config) 重建 Plugin 对象。
 * 当前只支持 auto-tag 一种类型,后续可扩展为联合类型(discriminated union)。
 */
export interface UserPluginConfig {
  /** 插件 id,持久化键。 */
  id: string;
  name: string;
  description?: string;
  /** 关键词 → 标签 规则;命中任一 keyword 即加上对应 tags。 */
  rules: Array<{ tags: string[]; words: string[] }>;
  /** 创建时间 ISO,用于排序与展示。 */
  createdAt: string;
}
