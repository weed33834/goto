import { getStoredAuth } from '../utils/secureStorage';
import { getApiBaseUrl } from './config';

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

// -- 请求重试 --

const RETRY_MAX = 2;
const RETRY_BASE_MS = 500;
const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);

function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // 网络错误
  if (err instanceof DOMException && err.name === 'AbortError') return false;
  if (err instanceof ApiError) return RETRYABLE_STATUSES.has(err.status);
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (attempt < RETRY_MAX && isRetryableError(err)) {
      const delay = RETRY_BASE_MS * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
      return withRetry(fn, attempt + 1);
    }
    throw err;
  }
}

/** 测试连接结果:供 SettingsPage 后端连接区显示状态反馈。 */
export interface ConnectionTestResult {
  ok: boolean;
  /** HTTP 状态码,网络错误时为 0。 */
  status: number;
  /** 请求耗时(毫秒),便于用户感知后端响应速度。 */
  latencyMs: number;
  /** 失败原因(ok=false 时有值)。 */
  error?: string;
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
  return withRetry(async () => {
    const response = await fetch(url, {
      method: 'GET',
      headers: await authHeaders(),
    });
    if (!response.ok) {
      throw new ApiError(await parseError(response), response.status);
    }
    return response.json() as Promise<T>;
  });
}

export async function post<T>(url: string, body: unknown): Promise<T> {
  return withRetry(async () => {
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
  });
}

export async function patch<T>(url: string, body: unknown): Promise<T> {
  return withRetry(async () => {
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
  });
}

export async function del(url: string): Promise<void> {
  return withRetry(async () => {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    if (!response.ok) {
      throw new ApiError(await parseError(response), response.status);
    }
  });
}

export function isApiAvailable(): Promise<boolean> {
  return fetch(`${getApiBaseUrl()}/health`, { method: 'GET' })
    .then((r) => r.ok)
    .catch(() => false);
}

/**
 * 测试与指定后端的连接,返回结构化结果供 UI 反馈。
 * 不依赖全局配置:接受 baseUrl + token 直接探测,避免影响当前会话的 API_BASE_URL。
 *
 * 探测策略:GET `${baseUrl}/health`,后端 FastAPI 默认暴露该端点。
 *   - 2xx:ok=true
 *   - 401/403:后端可达但 token 无效(仍报 ok=true,因为目标是验证"后端可达")
 *   - 其他 4xx/5xx:ok=false,附带状态码
 *   - 网络错误:ok=false, status=0, error 含错误信息
 *
 * @param baseUrl 后端 base URL,如 `https://api.goto.app` 或 `http://127.0.0.1:8000`
 * @param token   可选 Bearer token。提供时附加 Authorization 头,用于验证 token 是否被后端接受。
 */
export async function testApiConnection(
  baseUrl: string,
  token?: string,
): Promise<ConnectionTestResult> {
  const start = Date.now();
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${trimmedBase}/health`, {
      method: 'GET',
      headers,
      // 5 秒超时,避免 UI 长时间等待不可达的后端
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    // 401/403 表示后端可达但 token 无效 —— 后端本身是通的,只是认证失败
    if (response.ok || response.status === 401 || response.status === 403) {
      return { ok: true, status: response.status, latencyMs };
    }
    return {
      ok: false,
      status: response.status,
      latencyMs,
      error: `HTTP ${response.status} ${response.statusText}`.trim(),
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const error =
      err instanceof Error
        ? err.name === 'TimeoutError' || err.name === 'AbortError'
          ? '连接超时(5s)'
          : err.message
        : String(err);
    return { ok: false, status: 0, latencyMs, error };
  }
}
