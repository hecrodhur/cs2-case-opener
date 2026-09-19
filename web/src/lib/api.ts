const TOKEN_KEY = 'cs2co_token';

/** Base URL of the API. Set VITE_API_URL at build time for production (Cloudflare Pages); empty in dev (Vite proxy). */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

let token: string | null = localStorage.getItem(TOKEN_KEY);

export function getToken(): string | null {
  return token;
}

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event('auth-changed'));
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body != null) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, {
    method: opts.method ?? (opts.body != null ? 'POST' : 'GET'),
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && token && !path.startsWith('/api/auth/')) {
    setToken(null);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error ?? msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T = any>(path: string) => request<T>(path),
  post: <T = any>(path: string, body?: any) => request<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T = any>(path: string, body?: any) => request<T>(path, { method: 'PATCH', body: body ?? {} }),
  del: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
};
