import { FastifyInstance } from 'fastify';
import { query, one, run } from '../db.js';
import { requireAdmin, verifyPassword, createSession } from '../services/auth.js';
import { getSettings, setSetting, validateSettings } from '../services/global.js';
import { loadCsgoApiData } from '../data/api.js';
import { syncCatalog } from '../data/sync.js';
import { config } from '../config.js';
import { RARITY_TIERS, type RarityTier } from 'shared';
import { runAdminCommand } from '../services/commands.js';

export async function registerAdminRoutes(app: FastifyInstance) {
  const authedAdmin = async (req: any, reply: any) => {
    const user = await app.getUser(req);
    try {
      return requireAdmin(user);
    } catch (e: any) {
      reply.code(e.statusCode ?? 403).send({ error: e.message });
      return null;
    }
  };

  const audit = (actor: number, action: string, target: string, detail: unknown) =>
    run('INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)', [
      actor,
      action,
      target,
      detail,
    ]);

  // enter the admin password to get an admin session token
  app.post('/api/admin/unlock', async (req: any, reply) => {
    const password = String((req.body ?? {}).password ?? '');
    if (!password) return reply.code(400).send({ error: 'password required' });
    const admin = await one<any>("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
    if (!admin) return reply.code(404).send({ error: 'no admin account' });
    const ok = await verifyPassword(password, String(admin.pass_hash));
    if (!ok) return reply.code(401).send({ error: 'invalid admin password' });
    const token = await createSession(Number(admin.id));
    await run('INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)', [
      null,
      'admin_unlock',
      admin.username,
      {},
    ]).catch(() => {});
    return { token, user: { id: admin.id, username: admin.username, role: admin.role } };
  });

  app.get('/api/admin/stats', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    const s = await one<any>(
      `SELECT (SELECT COUNT(*) FROM users)::int AS users,
              (SELECT COUNT(*) FROM items WHERE kind != 'case')::int AS items,
              (SELECT COUNT(*) FROM cases)::int AS cases,
              (SELECT COUNT(*) FROM item_instances)::int AS instances,
              (SELECT COUNT(*) FROM openings)::int AS openings,
              (SELECT COUNT(*) FROM market_listings WHERE status = 'active')::int AS active_listings,
              (SELECT COALESCE(SUM(price_cents),0)::bigint FROM openings) AS total_dropped_value,
              (SELECT COALESCE(SUM(cost_cents),0)::bigint FROM openings) AS total_spent`,
    );
    const perTier = await query<any>(
      "SELECT rarity_tier, COUNT(*)::int AS n FROM openings GROUP BY rarity_tier ORDER BY rarity_tier",
    );
    const recent = await query<any>('SELECT * FROM openings ORDER BY created_at DESC LIMIT 15');
    return { stats: s, perTier, recent };
  });

  app.get('/api/admin/users', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    const search = req.query.search ? `%${req.query.search}%` : null;
    const rows = search
      ? await query<any>('SELECT id, username, role, balance_cents, banned, created_at FROM users WHERE username ILIKE $1 ORDER BY id LIMIT 100', [search])
      : await query<any>('SELECT id, username, role, balance_cents, banned, created_at FROM users ORDER BY id LIMIT 100');
    return { items: rows };
  });

  app.post('/api/admin/users/:id/ban', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    const id = Number(req.params.id);
    const { banned } = (req.body ?? {}) as any;
    const target = await one<any>('SELECT id, username FROM users WHERE id = $1', [id]);
    if (!target) return reply.code(404).send({ error: 'user not found' });
    if (target.role === 'admin') return reply.code(400).send({ error: 'cannot ban admin' });
    await run('UPDATE users SET banned = $2, updated_at = now() WHERE id = $1', [id, Boolean(banned)]);
    await run('DELETE FROM sessions WHERE user_id = $1', [id]);
    await audit(admin.id, banned ? 'user_banned' : 'user_unbanned', target.username, {});
    return { ok: true };
  });

  app.post('/api/admin/users/:id/balance', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    const id = Number(req.params.id);
    const { deltaCents, reason } = (req.body ?? {}) as any;
    if (!Number.isInteger(deltaCents) || Math.abs(deltaCents) > 1_000_000_00) {
      return reply.code(400).send({ error: 'invalid deltaCents' });
    }
    const target = await one<any>('SELECT id, username, balance_cents FROM users WHERE id = $1', [id]);
    if (!target) return reply.code(404).send({ error: 'user not found' });
    if (Number(target.balance_cents) + deltaCents < 0) return reply.code(400).send({ error: 'resulting balance negative' });
    await run('UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1', [id, deltaCents]);
    await run(
      'INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)',
      [id, 'admin_adjust', deltaCents, Number(target.balance_cents) + deltaCents, reason ?? 'admin'],
    );
    await audit(admin.id, 'balance_adjust', target.username, { deltaCents, reason });
    return { ok: true, newBalance: Number(target.balance_cents) + deltaCents };
  });

  app.get('/api/admin/users/:id/inventory', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    const rows = await query<any>(
      `SELECT ii.id, i.name, ii.rarity_tier, ii.float_value, ii.wear, ii.price_cents, ii.created_at
       FROM item_instances ii JOIN items i ON i.id = ii.item_id
       WHERE ii.user_id = $1 ORDER BY ii.created_at DESC LIMIT 200`,
      [Number(req.params.id)],
    );
    return { items: rows };
  });

  app.patch('/api/admin/cases/:id', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    const id = Number(req.params.id);
    const { costCents, probabilities, active } = (req.body ?? {}) as any;
    const c = await one<any>('SELECT id, name FROM cases WHERE id = $1', [id]);
    if (!c) return reply.code(404).send({ error: 'case not found' });
    if (costCents != null && (!Number.isInteger(costCents) || costCents < 0)) {
      return reply.code(400).send({ error: 'invalid costCents' });
    }
    if (probabilities != null) {
      for (const k of Object.keys(probabilities)) {
        if (!(RARITY_TIERS as string[]).includes(k) || typeof probabilities[k] !== 'number') {
          return reply.code(400).send({ error: `invalid probability for ${k}` });
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
      updates.push(`probabilities = $${params.length}::jsonb`);
    }
    if (active != null) {
      params.push(Boolean(active));
      updates.push(`active = $${params.length}`);
    }
    if (!updates.length) return { ok: true };
    params.push(id);
    await run(`UPDATE cases SET ${updates.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    await audit(admin.id, 'case_updated', c.name, { costCents, probabilities, active });
    return { ok: true };
  });

  app.post('/api/admin/cases/:id/pools/:tier/items', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    const id = Number(req.params.id);
    const tier = req.params.tier as RarityTier;
    const { itemName } = (req.body ?? {}) as any;
    if (!(RARITY_TIERS as string[]).includes(tier)) return reply.code(400).send({ error: 'bad tier' });
    if (!itemName || typeof itemName !== 'string') return reply.code(400).send({ error: 'itemName required' });
    const item = await one<any>('SELECT id, name FROM items WHERE name = $1 AND kind != \'case\'', [itemName]);
    if (!item) return reply.code(404).send({ error: 'item not in catalog' });
    const pool = await one<any>('SELECT id FROM case_pools WHERE case_id = $1 AND tier = $2', [id, tier]);
    if (!pool) return reply.code(404).send({ error: 'pool not found' });
    await run('INSERT INTO case_pool_items (case_pool_id, item_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [pool.id, item.id]);
    for (const t of RARITY_TIERS) {
      if (t !== tier) {
        const other = await one<any>('SELECT id FROM case_pools WHERE case_id = $1 AND tier = $2', [id, t]);
        if (other) await run('DELETE FROM case_pool_items WHERE case_pool_id = $1 AND item_id = $2', [other.id, item.id]);
      }
    }
    await audit(admin.id, 'pool_item_added', `case:${id}:${tier}`, { item: item.name });
    return { ok: true, itemId: item.id };
  });

  app.delete('/api/admin/cases/:id/pools/:tier/items/:itemId', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    const id = Number(req.params.id);
    const tier = req.params.tier as RarityTier;
    const itemId = Number(req.params.itemId);
    const pool = await one<any>('SELECT id FROM case_pools WHERE case_id = $1 AND tier = $2', [id, tier]);
    if (pool) await run('DELETE FROM case_pool_items WHERE case_pool_id = $1 AND item_id = $2', [pool.id, itemId]);
    await audit(admin.id, 'pool_item_removed', `case:${id}:${tier}`, { itemId });
    return { ok: true };
  });

  app.post('/api/admin/sync/catalog', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    try {
      const data = await loadCsgoApiData(config.csgoApiBase);
      const result = await syncCatalog(data);
      await audit(admin.id, 'catalog_sync_triggered', 'catalog', result);
      return result;
    } catch (e: any) {
      await audit(admin.id, 'catalog_sync_failed', 'catalog', { error: e.message });
      return reply.code(502).send({ error: e.message });
    }
  });

  app.post('/api/admin/sync/prices', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    const { caseIds } = (req.body ?? {}) as any;
    const prices = (app as any).ctx.prices;
    let list: any[];
    if (Array.isArray(caseIds) && caseIds.length) {
      list = await query<any>('SELECT * FROM cases WHERE id = ANY($1::int[])', [caseIds]);
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
    return { ok: true, queued: enqueued, pending: prices.pending };
  });

  app.get('/api/admin/prices', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    const search = req.query.search ? `%${req.query.search}%` : null;
    const rows = search
      ? await query<any>(
          `SELECT p.item_id, i.name, p.wear, p.stattrak, p.lowest_price_cents, p.volume, p.source, p.updated_at
           FROM prices p JOIN items i ON i.id = p.item_id WHERE i.name ILIKE $1 ORDER BY p.updated_at DESC LIMIT 100`,
          [search],
        )
      : await query<any>(
          `SELECT p.item_id, i.name, p.wear, p.stattrak, p.lowest_price_cents, p.volume, p.source, p.updated_at
           FROM prices p JOIN items i ON i.id = p.item_id ORDER BY p.updated_at DESC LIMIT 100`,
        );
    return { items: rows, pending: (app as any).ctx.prices.pending };
  });

  app.get('/api/admin/audit', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    const rows = await query<any>('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200');
    return { items: rows };
  });

  // console command: client submits the raw command, backend validates + audits
  app.post('/api/admin/command', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    const cmd = String((req.body ?? {}).cmd ?? '');
    const r = await runAdminCommand(admin, cmd);
    return r;
  });

  app.get('/api/admin/settings', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    return getSettings();
  });

  app.patch('/api/admin/settings', async (req: any, reply) => {
    const admin = await authedAdmin(req, reply);
    if (!admin) return;
    try {
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
      return getSettings();
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });
}
