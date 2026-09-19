import type { Env } from '../env.js';
import { config } from '../config.js';
import type { RealtimeHub } from '../services/realtime.js';
import type { PriceSyncService } from '../services/pricing.js';
import { userFromToken, requireAdmin } from '../services/auth.js';

export interface HandlerCtx {
  env: Env;
  hub: RealtimeHub;
  prices: PriceSyncService;
}

export interface Req {
  url: URL;
  method: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  headers: Headers;
  raw: Request;
}

export type Handler = (req: Req, ctx: HandlerCtx) => Promise<Response> | Response;

interface Route {
  method: string;
  segs: string[];
  keys: boolean[];
  handler: Handler;
}

const routes: Route[] = [];

function parse(path: string): { segs: string[]; keys: boolean[] } {
  const segs = path.split('/').filter(Boolean);
  return { segs, keys: segs.map((s) => s.startsWith(':')) };
}

export const route = {
  get: (p: string, h: Handler) => routes.push({ method: 'GET', ...parse(p), handler: h }),
  post: (p: string, h: Handler) => routes.push({ method: 'POST', ...parse(p), handler: h }),
  patch: (p: string, h: Handler) => routes.push({ method: 'PATCH', ...parse(p), handler: h }),
  del: (p: string, h: Handler) => routes.push({ method: 'DELETE', ...parse(p), handler: h }),
};

export function json(status: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const notFound = (msg = 'not found') => new Response(JSON.stringify({ error: msg }), {
  status: 404,
  headers: { 'Content-Type': 'application/json' },
});

export function bearer(req: { headers: Headers }): string | null {
  const h = req.headers.get('Authorization');
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return null;
}

/** Load the authenticated user, or throw an httpError. */
export async function authUser(req: Req): Promise<any> {
  const token = bearer(req);
  if (!token) throw httpError(401, 'authentication required');
  const user = await userFromToken(token);
  if (!user) throw httpError(401, 'invalid or expired session');
  if (user.banned) throw httpError(403, 'account suspended');
  return user;
}

export function adminUser(user: any) {
  return requireAdmin(user);
}

export function httpError(status: number, message: string): Error {
  const e: any = new Error(message);
  e.statusCode = status;
  return e;
}

export async function dispatch(request: Request, ctx: HandlerCtx): Promise<Response> {
  const url = new URL(request.url);
  const segs = url.pathname.split('/').filter(Boolean);
  const method = request.method.toUpperCase();
  for (const r of routes) {
    if (r.method !== method || r.segs.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      if (r.keys[i]) params[r.segs[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (r.segs[i] !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let body: any = null;
    if (request.body !== undefined || ['POST', 'PATCH', 'DELETE'].includes(method)) {
      try {
        body = await request.clone().json();
      } catch {
        body = null;
      }
    }
    const req: Req = { url, method, params, query: url.searchParams, body, headers: request.headers, raw: request };
    return await r.handler(req, ctx);
  }
  return notFound('no such endpoint');
}

// ---------------------------------------------------------------------------
// tiny in-memory rate limiter (per isolate; Cloudflare's own WAF covers the
// rest in production). Buckets: /auth 20/min, /admin 50/min, rest 240/min.
// ---------------------------------------------------------------------------
const buckets = new Map<string, number[]>();

export function rateLimited(request: Request, path: string): boolean {
  const base = path.includes('/auth/')
    ? config.rateLimit.auth
    : path.includes('/admin')
      ? config.rateLimit.admin
      : config.rateLimit.api;
  const limit = base * (config.scale ?? 1);
  const key = `${request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip') ?? 'x'}|${path}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < config.rateLimit.windowMs);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > config.rateLimit.windowMs) buckets.delete(k);
  }
  return hits.length > limit;
}
