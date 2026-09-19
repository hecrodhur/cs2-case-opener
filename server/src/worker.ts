import type { Env } from './env.js';
import { setAdminPassword } from './config.js';
import { runWithDb } from './db.js';
import { seedAdmin } from './services/auth.js';
import { RealtimeHub } from './services/realtime.js';
import { PriceSyncService } from './services/pricing.js';
import { refreshPricesForCases } from './services/priceJobs.js';
import { dispatch, rateLimited, type HandlerCtx } from './routes/index.js';
// route modules self-register on import
import './routes/auth.js';
import './routes/catalog.js';
import './routes/user.js';
import './routes/admin.js';
import './routes/battles.js';
import './routes/social.js';
import './routes/realtime.js';
import { Realtime } from './realtime.js';

export { Realtime };

let adminSeeded = false;

function makeCtx(env: Env): HandlerCtx {
  const hub = new RealtimeHub(env.RT);
  const prices = new PriceSyncService();
  prices.setHub(hub);
  return { env, hub, prices };
}

export default {
  async fetch(request: Request, env: Env, _ctx: unknown): Promise<Response> {
    if (env.ADMIN_PASSWORD) setAdminPassword(env.ADMIN_PASSWORD);
    const url = new URL(request.url);
    const path = url.pathname;
    return runWithDb(env.DB, async () => {
      // one admin seed check per isolate
      if (!adminSeeded) {
        if (env.SEED_CATALOG === 'false') {
          adminSeeded = true;
        } else {
          await seedAdmin().catch(() => {});
          adminSeeded = true;
        }
      }
      if (path.startsWith('/api/')) {
        const ctx = makeCtx(env);
        if (rateLimited(request, path)) {
          return new Response(JSON.stringify({ error: 'rate limit exceeded' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        try {
          return await dispatch(request, ctx);
        } catch (e: any) {
          const status = Number(e.statusCode) >= 400 ? Number(e.statusCode) : 500;
          return new Response(JSON.stringify({ error: e.message ?? 'internal error' }), {
            status,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      // static assets (React build) with SPA fallback to index.html
      if (env.ASSETS) {
        const res = await env.ASSETS.fetch(request);
        if (res.status === 404 && (request.headers.get('accept') ?? '').includes('text/html')) {
          const base = new URL('.', request.url);
          const idx = await env.ASSETS.fetch(new Request(new URL('index.html', base), request));
          if (idx.status === 200) {
            return new Response(idx.body, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
            });
          }
        }
        return res;
      }
      return new Response('assets binding missing (run `npm run build` in web/)', { status: 500 });
    });
  },

  async cron(_event: { scheduledTime: Date }, env: Env): Promise<void> {
    if (env.ADMIN_PASSWORD) setAdminPassword(env.ADMIN_PASSWORD);
    const ctx = makeCtx(env);
    await runWithDb(env.DB, async () => {
      await refreshPricesForCases(ctx.prices, 60);
      await ctx.prices.run();
    });
  },
};

