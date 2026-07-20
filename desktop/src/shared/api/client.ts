import { getStoredAuth } from '../utils/secureStorage';
import { API_BASE_URL } from './config';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.detail || data.message || JSON.stringify(data);
  } catch {
    return response.statusText;
  }
}

/**
 * 从安全存储读取 token，为后续请求附加 Bearer 认证头。
 * 优先使用 expo-secure-store（Keychain/Keystore），不可用时回退到 AsyncStorage。
 */
async function getAuthToken(): Promise<string | null> {
  try {
    const auth = await getStoredAuth();
    return auth?.token ?? null;
  } catch {
    return null;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const token = await getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function get<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    headers: await authHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  return response.json() as Promise<T>;
}

export async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  return response.json() as Promise<T>;
}

export async function patch<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  return response.json() as Promise<T>;
}

export async function del(url: string): Promise<void> {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
}

export function isApiAvailable(): Promise<boolean> {
  return fetch(`${API_BASE_URL}/health`, { method: 'GET' })
    .then((r) => r.ok)
    .catch(() => false);
}
