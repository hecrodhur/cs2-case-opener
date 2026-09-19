import { query, one, run, js } from '../db.js';
import { requireAdmin, verifyPassword, createSession } from '../services/auth.js';
import { getSettings, setSetting, validateSettings } from '../services/global.js';
import { loadCsgoApiData } from '../data/api.js';
import { syncCatalog } from '../data/sync.js';
import { config } from '../config.js';
import { RARITY_TIERS, type RarityTier } from 'shared';
import { runAdminCommand } from '../services/commands.js';
import { route, json, authUser, httpError } from './index.js';

const audit = (actor: number | null, action: string, target: string, detail: unknown) =>
  run('INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4)', [actor, action, target, detail]);

route.post('/api/admin/unlock', async (req) => {
  const password = String((req.body ?? {}).password ?? '');
  if (!password) throw httpError(400, 'password required');
  const admin = await one<any>("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  if (!admin) throw httpError(404, 'no admin account');
  const ok = await verifyPassword(password, String(admin.pass_hash));
  if (!ok) throw httpError(401, 'invalid admin password');
  const token = await createSession(Number(admin.id));
  await audit(null, 'admin_unlock', admin.username, {}).catch(() => {});
  return json(200, { token, user: { id: Number(admin.id), username: admin.username, role: admin.role } });
});

route.get('/api/admin/stats', async (req) => {
  requireAdmin(await authUser(req));
  const s = await one<any>(
    `SELECT (SELECT COUNT(*) FROM users) AS users,
            (SELECT COUNT(*) FROM items WHERE kind != 'case') AS items,
            (SELECT COUNT(*) FROM cases) AS cases,
            (SELECT COUNT(*) FROM item_instances) AS instances,
            (SELECT COUNT(*) FROM openings) AS openings,
            (SELECT COUNT(*) FROM market_listings WHERE status = 'active') AS active_listings,
            (SELECT COALESCE(SUM(price_cents),0) FROM openings) AS total_dropped_value,
            (SELECT COALESCE(SUM(cost_cents),0) FROM openings) AS total_spent`,
  );
  const perTier = await query<any>(
    'SELECT rarity_tier, COUNT(*) AS n FROM openings GROUP BY rarity_tier ORDER BY rarity_tier',
  );
  const recent = await query<any>('SELECT * FROM openings ORDER BY created_at DESC LIMIT 15');
  return json(200, {
    stats: {
      users: Number(s?.users ?? 0),
      items: Number(s?.items ?? 0),
      cases: Number(s?.cases ?? 0),
      instances: Number(s?.instances ?? 0),
      openings: Number(s?.openings ?? 0),
      active_listings: Number(s?.active_listings ?? 0),
      total_dropped_value: Number(s?.total_dropped_value ?? 0),
      total_spent: Number(s?.total_spent ?? 0),
    },
    perTier,
    recent,
  });
});

route.get('/api/admin/users', async (req) => {
  requireAdmin(await authUser(req));
  const search = req.query.get('search') ? `%${req.query.get('search')}%` : null;
  const rows = search
    ? await query<any>('SELECT id, username, role, balance_cents, banned, created_at FROM users WHERE username LIKE $1 ORDER BY id LIMIT 100', [search])
    : await query<any>('SELECT id, username, role, balance_cents, banned, created_at FROM users ORDER BY id LIMIT 100');
  return json(200, { items: rows.map((r) => ({ ...r, id: Number(r.id), balance_cents: Number(r.balance_cents), banned: Boolean(r.banned) })) });
});

route.post('/api/admin/users/:id/ban', async (req) => {
  const admin = requireAdmin(await authUser(req));
  const id = Number(req.params.id);
  const { banned } = (req.body ?? {}) as any;
  const target = await one<any>('SELECT id, username FROM users WHERE id = $1', [id]);
  if (!target) throw httpError(404, 'user not found');
  if (target.role === 'admin') throw httpError(400, 'cannot ban admin');
  await run('UPDATE users SET banned = $2, updated_at = now() WHERE id = $1', [id, Boolean(banned)]);
  await run('DELETE FROM sessions WHERE user_id = $1', [id]);
  await audit(admin.id, banned ? 'user_banned' : 'user_unbanned', target.username, {});
  return json(200, { ok: true });
});

route.post('/api/admin/users/:id/balance', async (req) => {
  const admin = requireAdmin(await authUser(req));
  const id = Number(req.params.id);
  const { deltaCents, reason } = (req.body ?? {}) as any;
  if (!Number.isInteger(deltaCents) || Math.abs(deltaCents) > 1_000_000_00) {
    throw httpError(400, 'invalid deltaCents');
  }
  const target = await one<any>('SELECT id, username, balance_cents FROM users WHERE id = $1', [id]);
  if (!target) throw httpError(404, 'user not found');
  if (Number(target.balance_cents) + deltaCents < 0) throw httpError(400, 'resulting balance negative');
  await run('UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1', [id, deltaCents]);
  await run(
    'INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)',
    [id, 'admin_adjust', deltaCents, Number(target.balance_cents) + deltaCents, reason ?? 'admin'],
  );
  await audit(admin.id, 'balance_adjust', target.username, { deltaCents, reason });
  return json(200, { ok: true, newBalance: Number(target.balance_cents) + deltaCents });
});

route.get('/api/admin/users/:id/inventory', async (req) => {
  requireAdmin(await authUser(req));
  const rows = await query<any>(
    `SELECT ii.id, i.name, ii.rarity_tier, ii.float_value, ii.wear, ii.price_cents, ii.created_at
     FROM item_instances ii JOIN items i ON i.id = ii.item_id
     WHERE ii.user_id = $1 ORDER BY ii.created_at DESC LIMIT 200`,
    [Number(req.params.id)],
  );
  return json(200, { items: rows });
});

route.patch('/api/admin/cases/:id', async (req) => {
  const admin = requireAdmin(await authUser(req));
  const id = Number(req.params.id);
  const { costCents, probabilities, active } = (req.body ?? {}) as any;
  const c = await one<any>('SELECT id, name FROM cases WHERE id = $1', [id]);
  if (!c) throw httpError(404, 'case not found');
  if (costCents != null && (!Number.isInteger(costCents) || costCents < 0)) {
    throw httpError(400, 'invalid costCents');
  }
  if (probabilities != null) {
    for (const k of Object.keys(probabilities)) {
      if (!(RARITY_TIERS as string[]).includes(k) || typeof probabilities[k] !== 'number') {
        throw httpError(400, `invalid probability for ${k}`);
      }
    }
  }
  const updates: string[] = [];
  const params: any[] = [];
  if (costCents != null) {
    params.push(costCents);
    updates.push(`cost_cents = $${params.length}`);
  }
  if (probabilities != null) {
    params.push(JSON.stringify(probabilities));
    updates.push(`probabilities = $${params.length}`);
  }
  if (active != null) {
    params.push(Boolean(active));
    updates.push(`active = $${params.length}`);
  }
  if (!updates.length) return json(200, { ok: true });
  params.push(id);
  await run(`UPDATE cases SET ${updates.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
  await audit(admin.id, 'case_updated', c.name, { costCents, probabilities, active });
  return json(200, { ok: true });
});

route.post('/api/admin/cases/:id/pools/:tier/items', async (req) => {
  const admin = requireAdmin(await authUser(req));
  const id = Number(req.params.id);
  const tier = req.params.tier as RarityTier;
  const { itemName } = (req.body ?? {}) as any;
  if (!(RARITY_TIERS as string[]).includes(tier)) throw httpError(400, 'bad tier');
  if (!itemName || typeof itemName !== 'string') throw httpError(400, 'itemName required');
  const item = await one<any>("SELECT id, name FROM items WHERE name = $1 AND kind != 'case'", [itemName]);
  if (!item) throw httpError(404, 'item not in catalog');
  const pool = await one<any>('SELECT id FROM case_pools WHERE case_id = $1 AND tier = $2', [id, tier]);
  if (!pool) throw httpError(404, 'pool not found');
  await run('INSERT INTO case_pool_items (case_pool_id, item_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [pool.id, item.id]);
  for (const t of RARITY_TIERS) {
    if (t !== tier) {
      const other = await one<any>('SELECT id FROM case_pools WHERE case_id = $1 AND tier = $2', [id, t]);
      if (other) await run('DELETE FROM case_pool_items WHERE case_pool_id = $1 AND item_id = $2', [other.id, item.id]);
    }
  }
  await audit(admin.id, 'pool_item_added', `case:${id}:${tier}`, { item: item.name });
  return json(200, { ok: true, itemId: item.id });
});

route.del('/api/admin/cases/:id/pools/:tier/items/:itemId', async (req) => {
  const admin = requireAdmin(await authUser(req));
  const id = Number(req.params.id);
  const tier = req.params.tier as RarityTier;
  const itemId = Number(req.params.itemId);
  const pool = await one<any>('SELECT id FROM case_pools WHERE case_id = $1 AND tier = $2', [id, tier]);
  if (pool) await run('DELETE FROM case_pool_items WHERE case_pool_id = $1 AND item_id = $2', [pool.id, itemId]);
  await audit(admin.id, 'pool_item_removed', `case:${id}:${tier}`, { itemId });
  return json(200, { ok: true });
});

route.post('/api/admin/sync/catalog', async (req) => {
  const admin = requireAdmin(await authUser(req));
  try {
    const data = await loadCsgoApiData(config.csgoApiBase);
    const result = await syncCatalog(data);
    await audit(admin.id, 'catalog_sync_triggered', 'catalog', result);
    return json(200, result);
  } catch (e: any) {
    await audit(admin.id, 'catalog_sync_failed', 'catalog', { error: e.message });
    throw httpError(502, e.message);
  }
});

route.post('/api/admin/sync/prices', async (req, ctx) => {
  const admin = requireAdmin(await authUser(req));
  const { caseIds } = (req.body ?? {}) as any;
  const prices = ctx.prices;
  let list: any[];
  if (Array.isArray(caseIds) && caseIds.length) {
    list = await query<any>('SELECT * FROM cases WHERE id = ANY($1)', [caseIds]);
  } else {
    list = await query<any>('SELECT * FROM cases WHERE active = TRUE ORDER BY name LIMIT 25');
  }
  let enqueued = 0;
  for (const c of list) {
    const item = await one<any>('SELECT * FROM items WHERE id = $1', [c.item_id]);
    if (item) enqueued += prices.request({ itemId: item.id, mhn: c.market_hash_name ?? c.name, wear: 'any', stattrak: false }) ? 1 : 0;
  }
  await audit(admin.id, 'price_sync_triggered', 'prices', { caseCount: list.length, enqueued });
  void prices.run();
  return json(200, { ok: true, queued: enqueued, pending: prices.pending });
});

route.get('/api/admin/prices', async (req, ctx) => {
  requireAdmin(await authUser(req));
  const search = req.query.get('search') ? `%${req.query.get('search')}%` : null;
  const rows = search
    ? await query<any>(
        `SELECT p.item_id, i.name, p.wear, p.stattrak, p.lowest_price_cents, p.volume, p.source, p.updated_at
         FROM prices p JOIN items i ON i.id = p.item_id WHERE i.name LIKE $1 ORDER BY p.updated_at DESC LIMIT 100`,
        [search],
      )
    : await query<any>(
        `SELECT p.item_id, i.name, p.wear, p.stattrak, p.lowest_price_cents, p.volume, p.source, p.updated_at
         FROM prices p JOIN items i ON i.id = p.item_id ORDER BY p.updated_at DESC LIMIT 100`,
      );
  return json(200, { items: rows, pending: ctx.prices.pending });
});

route.get('/api/admin/audit', async (req) => {
  requireAdmin(await authUser(req));
  const rows = await query<any>('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200');
  return json(200, { items: rows.map((r) => ({ ...r, id: Number(r.id), detail: js(r.detail) ?? null })) });
});

route.post('/api/admin/command', async (req) => {
  const admin = requireAdmin(await authUser(req));
  const cmd = String((req.body ?? {}).cmd ?? '');
  return json(200, await runAdminCommand(admin, cmd));
});

route.get('/api/admin/settings', async (req) => {
  requireAdmin(await authUser(req));
  return json(200, await getSettings());
});

route.patch('/api/admin/settings', async (req) => {
  const admin = requireAdmin(await authUser(req));
  const patch = validateSettings((req.body ?? {}) as any);
  const map: Record<string, string> = {
    stattrakChance: 'stattrak_chance',
    souvenirChance: 'souvenir_chance',
    marketFeePct: 'market_fee_pct',
    welcomeBalanceCents: 'welcome_balance_cents',
    quickSellPct: 'quick_sell_pct',
  };
  for (const [k, v] of Object.entries(patch)) await setSetting(map[k as keyof typeof map], v);
  await audit(admin.id, 'settings_updated', 'global', patch);
  return json(200, await getSettings());
});
