import type { Env } from './env.js';
import { setAdminPassword, setPricempireKey } from './config.js';
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
  return {
    env,
    hub,
    prices,
    waitUntil: (p) => {
      void p.catch(() => {}); // node/tests: let background work run without crashing
    },
  };
}

export default {
  async fetch(request: Request, env: Env, _ctx: { waitUntil?: (p: Promise<unknown>) => void }): Promise<Response> {
    if (env.ADMIN_PASSWORD) setAdminPassword(env.ADMIN_PASSWORD);
    if (env.PRICEMPIRE_API_KEY) setPricempireKey(env.PRICEMPIRE_API_KEY);
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
        if (_ctx?.waitUntil) {
          ctx.waitUntil = (p) => _ctx.waitUntil!(p.catch(() => {}));
        }
        if (rateLimited(request, path)) {
          return new Response(JSON.stringify({ error: 'rate limit exceeded' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        try {
          const res = await dispatch(request, ctx);
          // Keep the price queue running after the response is sent so a sync
          // trigger never holds the request open for minutes of Steam fetches.
          if (ctx.prices.pending > 0) ctx.waitUntil(ctx.prices.run());
          return res;
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
    if (env.PRICEMPIRE_API_KEY) setPricempireKey(env.PRICEMPIRE_API_KEY);
    const ctx = makeCtx(env);
    await runWithDb(env.DB, async () => {
      await refreshPricesForCases(ctx.prices, 60);
      await ctx.prices.run();
    });
  },
};

