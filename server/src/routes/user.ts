import { query, one, run, js } from '../db.js';
import { listInventory, getInstance, listHistory, type InventoryFilters } from '../services/inventory.js';
import { createListing, cancelListing, buyListing, listMarket } from '../services/market.js';
import { getSettings } from '../services/global.js';
import { httpError } from '../services/opening.js';
import { quickSellItem, quickSellMany } from '../services/sell.js';
import { route, json, authUser } from './index.js';

route.get('/api/global/settings', async (req) => {
  await authUser(req);
  return json(200, await getSettings());
});

// ---------- inventory ----------
route.get('/api/inventory', async (req) => {
  const user = await authUser(req);
  const search = req.query.get('search') ?? undefined;
  const rarity = req.query.get('rarity') ?? undefined;
  const sort = (req.query.get('sort') ?? undefined) as InventoryFilters['sort'];
  const num = (v: string | null, def: number) => (v == null || v === '' || isNaN(Number(v)) ? def : Number(v));
  return json(200, await listInventory(user.id, { search, rarity, sort, limit: num(req.query.get('limit'), 48), offset: num(req.query.get('offset'), 0) }));
});

route.get('/api/inventory/:instanceId', async (req) => {
  const user = await authUser(req);
  const inst = await getInstance(user.id, Number(req.params.instanceId));
  if (!inst) throw httpError(404, 'not found');
  const item = await one<any>('SELECT * FROM items WHERE id = $1', [inst.item_id]);
  const prices = await one<any>(
    'SELECT * FROM prices WHERE item_id = $1 AND stattrak = $2 ORDER BY updated_at DESC',
    [inst.item_id, inst.stattrak],
  );
  return json(200, { ...inst, item, prices });
});

route.post('/api/inventory/:instanceId/sell', async (req, ctx) => {
  const user = await authUser(req);
  const r = await quickSellItem(ctx.hub, user.id, Number(req.params.instanceId));
  return json(200, r);
});

route.post('/api/inventory/sell-many', async (req, ctx) => {
  const user = await authUser(req);
  const { instanceIds } = (req.body ?? {}) as any;
  return json(200, await quickSellMany(ctx.hub, user.id, instanceIds ?? []));
});

// ---------- market ----------
route.get('/api/market', async (req) => {
  await authUser(req);
  return json(
    200,
    await listMarket(Number(req.query.get('limit')) || 48, Number(req.query.get('offset')) || 0, req.query.get('search') ?? undefined),
  );
});

route.post('/api/market/list', async (req) => {
  const user = await authUser(req);
  const { instanceId, priceCents } = (req.body ?? {}) as any;
  return json(200, await createListing(user.id, Number(instanceId), Number(priceCents)));
});

route.post('/api/market/:listingId/cancel', async (req) => {
  const user = await authUser(req);
  await cancelListing(user.id, Number(req.params.listingId));
  return json(200, { ok: true });
});

route.post('/api/market/:listingId/buy', async (req, ctx) => {
  const user = await authUser(req);
  return json(200, await buyListing(ctx.hub, user.id, Number(req.params.listingId)));
});

// ---------- history ----------
route.get('/api/history', async (req) => {
  const user = await authUser(req);
  return json(200, await listHistory(user.id, Number(req.query.get('limit')) || 50, Number(req.query.get('offset')) || 0));
});

// ---------- leaderboard ----------
route.get('/api/leaderboard', async (req) => {
  const sort = String(req.query.get('sort') ?? 'openings');
  const order =
    sort === 'spent'
      ? 'spent DESC, value DESC'
      : sort === 'value'
        ? 'value DESC, openings DESC'
        : sort === 'best'
          ? 'best DESC, value DESC'
          : 'openings DESC, value DESC';
  const rows = await query<any>(
    `SELECT u.id, u.username, u.avatar,
            COUNT(o.id) AS openings,
            COALESCE(SUM(o.cost_cents),0) AS spent,
            COALESCE(SUM(o.price_cents),0) AS value,
            COALESCE(MAX(o.price_cents),0) AS best,
            (SELECT i.name FROM openings o2 JOIN items i ON i.name = o2.item_name
               WHERE o2.user_id = u.id AND o2.price_cents = (SELECT MAX(o3.price_cents) FROM openings o3 WHERE o3.user_id = u.id)
               LIMIT 1) AS best_name
     FROM users u LEFT JOIN openings o ON o.user_id = u.id
     WHERE u.banned = FALSE
     GROUP BY u.id, u.username, u.avatar
     ORDER BY ${order}
     LIMIT 50`,
  );
  return json(200, { items: rows.map((r) => ({ ...r, id: Number(r.id), openings: Number(r.openings), spent: Number(r.spent), value: Number(r.value), best: Number(r.best) })) });
});

// ---------- profile / settings ----------
route.get('/api/profile', async (req) => {
  const user = await authUser(req);
  const stats = await one<any>(
    `SELECT COUNT(*) AS openings,
            COALESCE(SUM(o.cost_cents),0) AS spent,
            COALESCE(SUM(o.price_cents),0) AS earned,
            (SELECT COUNT(*) FROM openings o2 WHERE o2.user_id = $1 AND o2.rarity_tier = 'rare_special') AS rare_drops,
            COALESCE(MAX(o.price_cents),0) AS best,
            (SELECT i.name FROM openings o2 JOIN items i ON i.name = o2.item_name
               WHERE o2.user_id = $1
               ORDER BY o2.price_cents DESC NULLS LAST LIMIT 1) AS best_name,
            MIN(o.created_at) AS first_opening
     FROM openings o WHERE o.user_id = $1`,
    [user.id],
  );
  const byTier = await query<any>(
    'SELECT rarity_tier, COUNT(*) AS n FROM openings WHERE user_id = $1 GROUP BY rarity_tier',
    [user.id],
  );
  return json(200, {
    id: user.id,
    username: user.username,
    stats: {
      openings: Number(stats?.openings ?? 0),
      spent: Number(stats?.spent ?? 0),
      earned: Number(stats?.earned ?? 0),
      rare_drops: Number(stats?.rare_drops ?? 0),
      best: Number(stats?.best ?? 0),
      best_name: stats?.best_name ?? null,
      first_opening: stats?.first_opening ?? null,
      byTier,
    },
  });
});

route.patch('/api/profile/settings', async (req) => {
  const user = await authUser(req);
  const body = (req.body ?? {}) as any;
  const allowed = new Set(['theme', 'volume', 'reducedMotion', 'confirmOpen', 'autoSkip', 'showPrice', 'showFloat', 'showProbabilities', 'sound', 'language', 'notifications', 'quickSellConfirm', 'skipQuickSellConfirm', 'reelSpeed']);
  const patch: any = {};
  for (const k of Object.keys(body)) {
    if (allowed.has(k)) patch[k] = body[k];
  }
  const merged = { ...(user.settings ?? {}), ...patch };
  await run('UPDATE users SET settings = $2, updated_at = now() WHERE id = $1', [user.id, merged]);
  return json(200, { settings: merged });
});

// ---------- notifications ----------
route.get('/api/notifications', async (req) => {
  const user = await authUser(req);
  const rows = await query<any>(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
    [user.id],
  );
  const unread = await one<any>('SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read = FALSE', [user.id]);
  return json(200, { items: rows.map((r) => ({ ...r, id: Number(r.id), read: Boolean(r.read), meta: js(r.meta) ?? null })), unread: Number(unread?.n ?? 0) });
});

route.post('/api/notifications/read', async (req) => {
  const user = await authUser(req);
  await run('UPDATE notifications SET read = TRUE WHERE user_id = $1', [user.id]);
  return json(200, { ok: true });
});

route.post('/api/notifications/:id/read', async (req) => {
  const user = await authUser(req);
  await run('UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2', [Number(req.params.id), user.id]);
  return json(200, { ok: true });
});
