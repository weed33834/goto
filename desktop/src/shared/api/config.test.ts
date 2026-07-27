// @vitest-environment jsdom
// config.ts 单测 —— 验证动态 base URL 优先级 + 持久化。
//
// 重点:
//   1. setApiBaseUrl 运行时覆盖 env/默认值
//   2. 传 null 清除运行时配置,退化为 env/默认值
//   3. 尾部斜杠被自动去除
//   4. API_ENDPOINTS getter 每次访问反映最新 URL
//   5. loadStoredApiBaseUrl 从 browserStorage 加载并应用
//   6. clearStoredApiBaseUrl 同时清运行时 + 持久化

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock browserStorage:用内存 Map 替代 IndexedDB(测试环境无 IDB)
const memoryKV = new Map<string, string>();
vi.mock('../utils/browserStorage', () => ({
  browserStorage: {
    getItem: async (key: string) => memoryKV.get(key) ?? null,
    setItem: async (key: string, value: string) => { memoryKV.set(key, value); },
    removeItem: async (key: string) => { memoryKV.delete(key); },
    getAllKeys: async () => Array.from(memoryKV.keys()),
    clear: async () => { memoryKV.clear(); },
    multiGet: async (keys: string[]) => keys.map((k) => [k, memoryKV.get(k) ?? null] as [string, string | null]),
    multiSet: async (entries: [string, string][]) => { for (const [k, v] of entries) memoryKV.set(k, v); },
  },
  BrowserStorage: {},
}));

import {
  getApiBaseUrl,
  setApiBaseUrl,
  loadStoredApiBaseUrl,
  saveStoredApiBaseUrl,
  clearStoredApiBaseUrl,
  API_ENDPOINTS,
} from './config';

describe('api/config — 动态 base URL', () => {
  beforeEach(() => {
    // 每个测试前:清运行时配置 + 清存储
    setApiBaseUrl(null);
    memoryKV.clear();
  });

  it('默认退化为 http://127.0.0.1:8000', () => {
    expect(getApiBaseUrl()).toBe('http://127.0.0.1:8000');
  });

  it('setApiBaseUrl 运行时覆盖默认值', () => {
    setApiBaseUrl('https://api.goto.app');
    expect(getApiBaseUrl()).toBe('https://api.goto.app');
  });

  it('setApiBaseUrl(null) 清除运行时配置,退回默认', () => {
    setApiBaseUrl('https://api.goto.app');
    expect(getApiBaseUrl()).toBe('https://api.goto.app');
    setApiBaseUrl(null);
    expect(getApiBaseUrl()).toBe('http://127.0.0.1:8000');
  });

  it('自动去除尾部斜杠(避免与 endpoint 拼接产生双斜杠)', () => {
    setApiBaseUrl('https://api.goto.app/');
    expect(getApiBaseUrl()).toBe('https://api.goto.app');
    setApiBaseUrl('https://api.goto.app///');
    expect(getApiBaseUrl()).toBe('https://api.goto.app');
  });

  it('API_ENDPOINTS getter 反映最新 URL(改 URL 后立即生效)', () => {
    expect(API_ENDPOINTS.tasks).toBe('http://127.0.0.1:8000/api/v1/tasks/');
    setApiBaseUrl('https://api.goto.app');
    expect(API_ENDPOINTS.tasks).toBe('https://api.goto.app/api/v1/tasks/');
    expect(API_ENDPOINTS.projects).toBe('https://api.goto.app/api/v1/tasks/projects/');
    expect(API_ENDPOINTS.categories).toBe('https://api.goto.app/api/v1/tasks/categories/');
    expect(API_ENDPOINTS.tags).toBe('https://api.goto.app/api/v1/tasks/tags/');
  });

  it('saveStoredApiBaseUrl 持久化(去尾部斜杠)', async () => {
    await saveStoredApiBaseUrl('https://api.goto.app/');
    expect(memoryKV.get('goto_api_base_url')).toBe('https://api.goto.app');
  });

  it('loadStoredApiBaseUrl 从存储加载并应用到运行时', async () => {
    memoryKV.set('goto_api_base_url', 'https://custom.backend.com');
    const loaded = await loadStoredApiBaseUrl();
    expect(loaded).toBe('https://custom.backend.com');
    expect(getApiBaseUrl()).toBe('https://custom.backend.com');
  });

  it('loadStoredApiBaseUrl 存储为空时返回 null 且不改变运行时', async () => {
    const loaded = await loadStoredApiBaseUrl();
    expect(loaded).toBeNull();
    expect(getApiBaseUrl()).toBe('http://127.0.0.1:8000');
  });

  it('clearStoredApiBaseUrl 同时清运行时 + 持久化', async () => {
    setApiBaseUrl('https://api.goto.app');
    memoryKV.set('goto_api_base_url', 'https://api.goto.app');
    await clearStoredApiBaseUrl();
    expect(getApiBaseUrl()).toBe('http://127.0.0.1:8000');
    expect(memoryKV.get('goto_api_base_url')).toBeUndefined();
  });

  it('空字符串 setApiBaseUrl 等同于 null(清除配置)', () => {
    setApiBaseUrl('https://api.goto.app');
    setApiBaseUrl('');
    expect(getApiBaseUrl()).toBe('http://127.0.0.1:8000');
  });
});
