// 内置示例插件：auto-tag。
//
// 在任务创建前根据标题关键词自动补标签。它复用了 AI 引擎的"统计式而非魔法"
// 理念——纯关键词表，无网络、无模型。把它作为插件而非硬编码进 tasksSlice，
// 是为了演示插件机制：用户可以在设置里禁用，第三方也能注册自己的同类插件。

import type { Plugin } from './types';

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
