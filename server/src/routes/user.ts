import { FastifyInstance } from 'fastify';
import { query, one, run } from '../db.js';
import { listInventory, getInstance, listHistory } from '../services/inventory.js';
import { createListing, cancelListing, buyListing, listMarket } from '../services/market.js';
import { getSettings, setSetting, validateSettings } from '../services/global.js';
import { httpError } from '../services/opening.js';
import { quickSellItem, quickSellMany } from '../services/sell.js';

export async function registerUserRoutes(app: FastifyInstance) {
  const authed = async (req: any, reply: any) => {
    const user = await app.getUser(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized' }), null;
    if (user.banned) return reply.code(403).send({ error: 'banned' }), null;
    return user;
  };

  // global settings (read-only, used for quick sell previews)
  app.get('/api/global/settings', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    return getSettings();
  });

  // ---------- inventory ----------
  app.get('/api/inventory', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { search, rarity, sort, limit, offset } = req.query as any;
    const num = (v: any, def: number) => (v == null || v === '' || isNaN(Number(v)) ? def : Number(v));
    return listInventory(user.id, { search, rarity, sort, limit: num(limit, 48), offset: num(offset, 0) });
  });

  app.get('/api/inventory/:instanceId', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const inst = await getInstance(user.id, Number(req.params.instanceId));
    if (!inst) return reply.code(404).send({ error: 'not found' });
    const item = await one<any>('SELECT * FROM items WHERE id = $1', [inst.item_id]);
    const prices = await one<any>(
      'SELECT * FROM prices WHERE item_id = $1 AND stattrak = $2 ORDER BY updated_at DESC',
      [inst.item_id, inst.stattrak],
    );
    return { ...inst, item, prices };
  });

  app.post('/api/inventory/:instanceId/sell', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    try {
      const r = await quickSellItem((app as any).ctx.hub, user.id, Number(req.params.instanceId));
      return r;
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  app.post('/api/inventory/sell-many', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { instanceIds } = (req.body ?? {}) as any;
    try {
      return await quickSellMany((app as any).ctx.hub, user.id, instanceIds ?? []);
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  // ---------- market ----------
  app.get('/api/market', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { search, limit, offset } = req.query as any;
    return listMarket(Number(limit) || 48, Number(offset) || 0, search);
  });

  app.post('/api/market/list', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { instanceId, priceCents } = (req.body ?? {}) as any;
    try {
      const l = await createListing(user.id, Number(instanceId), Number(priceCents));
      return l;
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  app.post('/api/market/:listingId/cancel', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    try {
      await cancelListing(user.id, Number(req.params.listingId));
      return { ok: true };
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  app.post('/api/market/:listingId/buy', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    try {
      const r = await buyListing((app as any).ctx.hub, user.id, Number(req.params.listingId));
      return r;
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  // ---------- history ----------
  app.get('/api/history', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    return listHistory(user.id, Number(req.query.limit) || 50, Number(req.query.offset) || 0);
  });

  // ---------- leaderboard ----------
  app.get('/api/leaderboard', async (req: any) => {
    const sort = String(req.query.sort ?? 'openings');
    const order =
      sort === 'spent' ? 'spent DESC, value DESC'
      : sort === 'value' ? 'value DESC, openings DESC'
      : sort === 'best' ? 'best DESC, value DESC'
      : 'openings DESC, value DESC';
    const rows = await query<any>(
      `SELECT u.id, u.username, u.avatar,
              COUNT(o.id)::int AS openings,
              COALESCE(SUM(o.cost_cents),0)::bigint AS spent,
              COALESCE(SUM(o.price_cents),0)::bigint AS value,
              COALESCE(MAX(o.price_cents),0)::int AS best,
              (SELECT i.name FROM openings o2 JOIN items i ON i.name = o2.item_name
                 WHERE o2.user_id = u.id AND o2.price_cents = (SELECT MAX(o3.price_cents) FROM openings o3 WHERE o3.user_id = u.id)
                 LIMIT 1) AS best_name
       FROM users u LEFT JOIN openings o ON o.user_id = u.id
       WHERE u.banned = FALSE
       GROUP BY u.id, u.username, u.avatar
       ORDER BY ${order}
       LIMIT 50`,
    );
    return { items: rows };
  });

  // ---------- profile / settings ----------
  app.get('/api/profile', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const stats = await one<any>(
      `SELECT COUNT(*)::int AS openings,
              COALESCE(SUM(o.cost_cents),0)::bigint AS spent,
              COALESCE(SUM(o.price_cents),0)::bigint AS earned,
              (SELECT COUNT(*) FROM openings o2 WHERE o2.user_id = $1 AND o2.rarity_tier = 'rare_special')::int AS rare_drops,
              COALESCE(MAX(o.price_cents),0)::int AS best,
              (SELECT i.name FROM openings o2 JOIN items i ON i.name = o2.item_name
                 WHERE o2.user_id = $1
                 ORDER BY o2.price_cents DESC NULLS LAST LIMIT 1) AS best_name,
              MIN(o.created_at) AS first_opening
       FROM openings o WHERE o.user_id = $1`,
      [user.id],
    );
    const byTier = await query<any>(
      "SELECT rarity_tier, COUNT(*)::int AS n FROM openings WHERE user_id = $1 GROUP BY rarity_tier",
      [user.id],
    );
    return { id: user.id, username: user.username, stats: { ...stats, byTier } };
  });

  app.patch('/api/profile/settings', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const body = (req.body ?? {}) as any;
    const allowed = new Set(['theme', 'volume', 'reducedMotion', 'confirmOpen', 'autoSkip', 'showPrice', 'showFloat', 'showProbabilities', 'sound', 'language', 'notifications', 'quickSellConfirm', 'skipQuickSellConfirm', 'reelSpeed']);
    const patch: any = {};
    for (const k of Object.keys(body)) {
      if (allowed.has(k)) patch[k] = body[k];
    }
    const merged = { ...(user.settings ?? {}), ...patch };
    await run('UPDATE users SET settings = $2::jsonb, updated_at = now() WHERE id = $1', [user.id, merged]);
    return { settings: merged };
  });

  // ---------- notifications ----------
  app.get('/api/notifications', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const rows = await query<any>(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
      [user.id],
    );
    const unread = await one<any>('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read = FALSE', [user.id]);
    return { items: rows, unread: unread?.n ?? 0 };
  });

  app.post('/api/notifications/read', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    await run('UPDATE notifications SET read = TRUE WHERE user_id = $1', [user.id]);
    return { ok: true };
  });

  app.post('/api/notifications/:id/read', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    await run('UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2', [Number(req.params.id), user.id]);
    return { ok: true };
  });
}
