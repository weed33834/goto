// 后端 API 基址配置 —— 支持运行时动态切换 + 持久化。
//
// 优先级(高 → 低):
//   1. setApiBaseUrl() 运行时设置(用户在 Settings → 后端连接 中输入)
//   2. 持久化的用户配置(启动时由 loadStoredApiBaseUrl() 异步载入并应用)
//   3. 构建期环境变量(EXPO_PUBLIC_API_URL / REACT_APP_API_URL / VITE_API_URL)
//   4. 默认 http://127.0.0.1:8000
//
// URL 本身不含敏感信息(只是后端地址),用 browserStorage 明文持久化即可;
// 真正敏感的是 Bearer token,由 secureStorage 加密存储(见 secureStorage.setStoredAuth)。

import { browserStorage } from '../utils/browserStorage';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8000;
const STORAGE_KEY = 'goto_api_base_url';

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

/** 运行时配置的 base URL。null 表示未配置,退化为 env / 默认值。 */
let configuredBaseUrl: string | null = null;

/** 从构建期环境变量读取默认 base URL。 */
function getEnvBaseUrl(): string | null {
  const env =
    typeof process !== 'undefined' && process?.env ? process.env : undefined;

  if (env?.EXPO_PUBLIC_API_URL) return env.EXPO_PUBLIC_API_URL;
  if (env?.REACT_APP_API_URL) return env.REACT_APP_API_URL;
  // Vite 环境变量:Vite 构建时通过 import.meta.env.VITE_API_URL 注入
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (viteEnv?.VITE_API_URL) return viteEnv.VITE_API_URL;
  return null;
}

/**
 * 获取当前生效的 API base URL。
 * 优先级:运行时配置 > 环境变量 > 默认值。
 */
export function getApiBaseUrl(): string {
  if (configuredBaseUrl) return configuredBaseUrl;
  return getEnvBaseUrl() ?? `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
}

/**
 * 运行时设置 API base URL。传入 null 清除配置,退化为环境变量 / 默认值。
 * 自动去除尾部斜杠,避免与 endpoint 拼接产生双斜杠。
 */
export function setApiBaseUrl(url: string | null): void {
  if (!url) {
    configuredBaseUrl = null;
    return;
  }
  configuredBaseUrl = url.replace(/\/+$/, '');
}

// ===== 持久化(用户配置的 URL,非敏感,走 browserStorage 明文存储)=====

/** 从持久化存储加载已保存的 API base URL,并应用到运行时配置。启动时调用一次。 */
export async function loadStoredApiBaseUrl(): Promise<string | null> {
  try {
    const stored = await browserStorage.getItem(STORAGE_KEY);
    if (stored) {
      setApiBaseUrl(stored);
      return stored;
    }
  } catch {
    // 存储不可用时静默降级到 env/默认值
  }
  return null;
}

/** 持久化 API base URL 到 browserStorage。 */
export async function saveStoredApiBaseUrl(url: string): Promise<void> {
  await browserStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ''));
}

/** 清除持久化的 API base URL。 */
export async function clearStoredApiBaseUrl(): Promise<void> {
  setApiBaseUrl(null);
  try {
    await browserStorage.removeItem(STORAGE_KEY);
  } catch {
    // 清除失败不影响运行时
  }
}

// ===== API endpoints =====
//
// 用 getter 形式暴露,确保每次访问都基于最新的 getApiBaseUrl() 计算,
// 用户在 Settings 改 URL 后立即生效,无需刷新页面。

function endpoint(path: string): string {
  return `${getApiBaseUrl()}${path}`;
}

export const API_ENDPOINTS = {
  /** 集合端点带尾斜杠,与后端路由("/")一致,避免 307 重定向丢 body。 */
  get tasks() {
    return endpoint('/api/v1/tasks/');
  },
  get projects() {
    return endpoint('/api/v1/tasks/projects/');
  },
  get categories() {
    return endpoint('/api/v1/tasks/categories/');
  },
  get tags() {
    return endpoint('/api/v1/tasks/tags/');
  },
};
