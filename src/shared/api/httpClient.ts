export interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
}

export class HttpError extends Error {
  status: number;
  url: string;
  body?: unknown;

  constructor(status: number, url: string, body?: unknown) {
    super(extractErrorMessage(body) || `HTTP ${status}: ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractErrorMessage(body: unknown): string {
  if (!isRecord(body)) return '';
  const detail = body.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) return JSON.stringify(detail);
  const error = body.error;
  if (typeof error === 'string') return error;
  const message = body.message;
  return typeof message === 'string' ? message : '';
}

function normalizeResponse<T>(path: string, json: unknown): Envelope<T> {
  if (isRecord(json) && typeof json.success === 'boolean') {
    return json as unknown as Envelope<T>;
  }

  // Skill Hub 后端多数接口返回原始 JSON；保留兼容并正确映射 { ok:false,error }。
  if (path.startsWith('/skill-hub/')) {
    if (isRecord(json) && json.ok === false) {
      return {
        success: false,
        data: json as T,
        error: extractErrorMessage(json) || '请求失败',
      };
    }
    return { success: true, data: json as T };
  }

  if (isRecord(json)) {
    return { success: true, data: json as T };
  }

  return json as Envelope<T>;
}

export function isAclError(e: unknown): boolean {
  return e instanceof HttpError && (e.status === 401 || e.status === 403);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<Envelope<T>> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
  });

  let body: unknown;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { body = await res.json(); } catch (_) {}
  } else {
    try { body = await res.text(); } catch (_) {}
  }

  if (!res.ok) {
    throw new HttpError(res.status, path, body);
  }

  if (body === undefined || body === '') {
    return { success: true } as Envelope<T>;
  }

  return normalizeResponse<T>(path, body);
}

export function getJson<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  return request<T>(path, { ...init, method: 'GET' });
}

export function postJson<T>(
  path: string,
  payload?: unknown,
  init?: RequestInit,
): Promise<Envelope<T>> {
  return request<T>(path, {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
}

export function putJson<T>(
  path: string,
  payload?: unknown,
  init?: RequestInit,
): Promise<Envelope<T>> {
  return request<T>(path, {
    ...init,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
}

export function patchJson<T>(
  path: string,
  payload?: unknown,
  init?: RequestInit,
): Promise<Envelope<T>> {
  return request<T>(path, {
    ...init,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
}

export function del<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  return request<T>(path, { ...init, method: 'DELETE' });
}

export function postForm<T>(
  path: string,
  form: FormData,
  init?: RequestInit,
): Promise<Envelope<T>> {
  return request<T>(path, { ...init, method: 'POST', body: form });
}
