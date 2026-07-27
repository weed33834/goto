// 内置示例插件：auto-tag。
//
// 在任务创建前根据标题关键词自动补标签。它复用了 AI 引擎的"统计式而非魔法"
// 理念——纯关键词表，无网络、无模型。把它作为插件而非硬编码进 tasksSlice，
// 是为了演示插件机制：用户可以在设置里禁用，第三方也能注册自己的同类插件。

import type { Plugin, UserPluginConfig } from './types';

const KEYWORD_TAGS: Array<{ tags: string[]; words: string[] }> = [
  { tags: ['购物'], words: ['买', '购物', '超市', 'milk', 'buy', 'shopping'] },
  { tags: ['工作'], words: ['会议', '报告', 'review', 'pr', 'meeting', '工作'] },
  { tags: ['健康'], words: ['运动', '跑步', '健身', 'gym', 'run', 'workout'] },
  { tags: ['学习'], words: ['读书', '学习', 'read', 'study', 'book'] },
];

export const autoTagPlugin: Plugin = {
  id: 'builtin.auto-tag',
  name: '自动标签',
  version: '1.0.0',
  description: '根据任务标题关键词自动补标签（本地关键词表，可关闭）',
  source: 'builtin',
  hooks: {
    taskBeforeCreate: (task) => {
      const title = (task.title ?? '').toLowerCase();
      if (!title) return null;
      const existing = new Set(task.tags ?? []);
      const added: string[] = [];
      for (const { tags, words } of KEYWORD_TAGS) {
        if (words.some((w) => title.includes(w.toLowerCase()))) {
          for (const t of tags) {
            if (!existing.has(t) && !added.includes(t)) added.push(t);
          }
        }
      }
      if (added.length === 0) return null;
      return { tags: [...(task.tags ?? []), ...added] } as Partial<typeof task>;
    },
  },
};

/**
 * 所有内置插件清单。用于:
 *   - PluginPage 展示"内置插件"区
 *   - togglePlugin(builtin, true) 时从这里查回 Plugin 对象重新 register
 * 新增内置插件时只需在此数组追加,无需改其他文件。
 */
export const BUILTIN_PLUGINS: readonly Plugin[] = [autoTagPlugin];

/**
 * 根据用户配置构建一个 auto-tag 插件实例。
 *
 * 与 builtin.auto-tag 同样实现 taskBeforeCreate 钩子,但关键词表来自用户配置。
 * 用于插件管理页的"新建插件"与"导入 JSON"流程:
 *   - 新建:表单填 name + rules,buildUserPlugin 后 register
 *   - 导入:解析 JSON 得 UserPluginConfig,buildUserPlugin 后 register
 * 持久化时只存 config,启动时 store 重建时调用本函数批量 register。
 */
export function buildUserPlugin(config: UserPluginConfig): Plugin {
  return {
    id: config.id,
    name: config.name,
    version: '1.0.0',
    description: config.description ?? '用户自建关键词标签插件',
    source: 'user',
    config,
    hooks: {
      taskBeforeCreate: (task) => {
        const title = (task.title ?? '').toLowerCase();
        if (!title) return null;
        const existing = new Set(task.tags ?? []);
        const added: string[] = [];
        for (const { tags, words } of config.rules) {
          if (words.some((w) => title.includes(w.toLowerCase()))) {
            for (const t of tags) {
              if (!existing.has(t) && !added.includes(t)) added.push(t);
            }
          }
        }
        if (added.length === 0) return null;
        return { tags: [...(task.tags ?? []), ...added] } as Partial<typeof task>;
      },
    },
  };
}
