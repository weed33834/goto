const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8000;

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

function getApiBaseUrl(): string {
  const env =
    typeof process !== 'undefined' && process?.env ? process.env : undefined;

  if (env?.EXPO_PUBLIC_API_URL) {
    return env.EXPO_PUBLIC_API_URL;
  }
  if (env?.REACT_APP_API_URL) {
    return env.REACT_APP_API_URL;
  }
  // Vite 环境变量:Vite 构建时通过 import.meta.env.VITE_API_URL 注入
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (viteEnv?.VITE_API_URL) {
    return viteEnv.VITE_API_URL;
  }
  return `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
}

export const API_BASE_URL = getApiBaseUrl();

export const API_ENDPOINTS = {
  // 集合端点带尾斜杠，与后端路由（"/"）一致，避免 307 重定向丢 body。
  // 单资源拼接 `${base}/${id}` 不受影响（斜杠在中间）。
  tasks: `${API_BASE_URL}/api/v1/tasks/`,
  projects: `${API_BASE_URL}/api/v1/tasks/projects/`,
  categories: `${API_BASE_URL}/api/v1/tasks/categories/`,
  tags: `${API_BASE_URL}/api/v1/tasks/tags/`,
};
