import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { userFromToken } from './services/auth.js';
import { RealtimeHub } from './services/realtime.js';
import { PriceSyncService } from './services/pricing.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerUserRoutes } from './routes/user.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerBattleRoutes } from './routes/battles.js';
import { registerSocialRoutes } from './routes/social.js';
import { registerRealtimeRoute } from './routes/realtime.js';

export interface AppContext {
  hub: RealtimeHub;
  prices: PriceSyncService;
}

declare module 'fastify' {
  interface FastifyInstance {
    getUser(req: any): Promise<any>;
    ctx: AppContext;
  }
}

/** In-memory sliding window rate limiter (per IP+group). Sufficient for ~50 users. */
function makeRateLimiter() {
  const buckets = new Map<string, number[]>();
  return function limit(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    const ok = arr.length < max;
    arr.push(now);
    buckets.set(key, arr);
    // periodic prune to avoid unbounded memory
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] >= windowMs) buckets.delete(k);
    }
    return ok;
  };
}

export async function buildApp(deps: { pool: any; ctx: AppContext; webDist?: string }) {
  const app = Fastify({
    logger: process.env.LOG_LEVEL === 'silent' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 1_000_000,
  });
  app.ctx = deps.ctx;

  if (deps.webDist) {
    const staticPlugin = (await import('@fastify/static')).default;
    await app.register(staticPlugin, { root: deps.webDist, index: ['index.html'] });
  }

  // explicit origin allow-list (FRONTEND_ORIGIN env); never origin:true in production
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.get('/api/health', async () => ({ ok: true }));

  const limit = makeRateLimiter();
  app.addHook('onRequest', async (req, reply) => {
    const ip = req.ip;
    const path = req.url.split('?')[0];
    let group = 'api';
    let max = 240;
    if (path === '/api/auth/login' || path === '/api/auth/register') {
      group = 'auth';
      max = 20;
    } else if (path.includes('/open')) {
      group = 'open';
      max = 10;
    } else if (path.startsWith('/api/market')) {
      group = 'market';
      max = 40;
    } else if (path.startsWith('/api/admin')) {
      group = 'admin';
      max = 120;
    }
    const scaled = max * config.rateLimitScale;
    if (config.rateLimitScale > 0 && !limit(`${ip}:${group}`, scaled, 60_000)) {
      reply.code(429).send({ error: 'rate limited' });
    }
  });

  // auth: attach user from Bearer token
  app.decorate('getUser', async (req: any) => {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query.token as string | undefined);
    return userFromToken(token);
  });

  // call directly (not app.register) so routes share the root scope decorators
  await registerAuthRoutes(app);
  await registerCatalogRoutes(app);
  await registerUserRoutes(app);
  await registerAdminRoutes(app);
  await registerBattleRoutes(app);
  await registerSocialRoutes(app);
  await registerRealtimeRoute(app);

  app.setNotFoundHandler((req, reply) => {
    // SPA fallback: serve index.html for non-API GET routes
    if (deps.webDist && req.method === 'GET' && !req.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    reply.code(404).send({ error: 'not found' });
  });
  app.setErrorHandler((err: any, req, reply) => {
    const status = err.statusCode ?? (err.validation ? 400 : 500);
    if (status >= 500) req.log?.error(err);
    reply.code(status).send({ error: err.message ?? 'internal error' });
  });

  return app;
}

export async function createApp(deps: { pool: any; ctx?: Partial<AppContext> }) {
  const hub = deps.ctx?.hub ?? new RealtimeHub();
  const prices = deps.ctx?.prices ?? new PriceSyncService();
  prices.setHub(hub);
  const app = await buildApp({ pool: deps.pool, ctx: { hub, prices } });
  return { app, hub, prices };
}

export { config };
