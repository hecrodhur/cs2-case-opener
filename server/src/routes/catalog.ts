import { FastifyInstance } from 'fastify';
import { query, one } from '../db.js';
import { openCase, httpError } from '../services/opening.js';
import { itemPricesByWear } from '../services/pricing.js';
import { RARITY_TIERS, type RarityTier } from 'shared';

const PRICE_SUB = `COALESCE(
  (SELECT p.lowest_price_cents FROM prices p WHERE p.item_id = i.id AND p.stattrak = FALSE AND p.wear = 'Field-Tested'),
  (SELECT MIN(p.lowest_price_cents) FROM prices p WHERE p.item_id = i.id AND p.stattrak = FALSE)
)`;

export async function registerCatalogRoutes(app: FastifyInstance) {
  app.get('/api/cases', async (req: any) => {
    const sort = req.query.sort === 'price' ? 'price' : req.query.sort === 'name' ? 'name' : 'popular';
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;
    const collection = req.query.collection ? String(req.query.collection) : null;
    const limit = Math.min(Number(req.query.limit ?? 48), 200);
    const offset = Number(req.query.offset ?? 0);

    const order =
      sort === 'price' ? 'c.cost_cents ASC NULLS LAST' : sort === 'name' ? 'c.name ASC' : 'openings DESC, c.name ASC';
    const params: any[] = [];
    let where = 'c.active = TRUE';
    if (minPrice != null && !Number.isNaN(minPrice)) {
      params.push(minPrice);
      where += ` AND c.cost_cents >= $${params.length}`;
    }
    if (maxPrice != null && !Number.isNaN(maxPrice)) {
      params.push(maxPrice);
      where += ` AND c.cost_cents <= $${params.length}`;
    }
    if (collection) {
      params.push(`%${collection}%`);
      where += ` AND EXISTS (SELECT 1 FROM items i WHERE i.id = c.item_id AND i.collections @> ARRAY[$${params.length}]::text[])`;
    }
    params.push(limit, offset);
    const rows = await query<any>(
      `SELECT c.id, c.name, c.image, c.cost_cents, c.probabilities, c.first_sale_date,
              (SELECT COUNT(*) FROM case_pools p JOIN case_pool_items pi ON pi.case_pool_id = p.id WHERE p.case_id = c.id) AS item_count,
              (SELECT COUNT(*) FROM openings o WHERE o.case_id = c.id) AS openings,
              (SELECT p.lowest_price_cents FROM prices p JOIN items i ON i.id = p.item_id WHERE i.id = c.item_id LIMIT 1) AS steam_price,
              (SELECT p.volume FROM prices p JOIN items i ON i.id = c.item_id WHERE i.id = c.item_id LIMIT 1) AS steam_volume,
              (SELECT p.updated_at FROM prices p JOIN items i ON i.id = c.item_id WHERE i.id = c.item_id LIMIT 1) AS price_updated_at
       FROM cases c
       WHERE ${where}
       ORDER BY ${order}
       LIMIT $${params.length - 1} OFFSET $${params.length}::int`,
      params,
    );
    const total = await one<any>(`SELECT COUNT(*)::int AS n FROM cases c WHERE ${where}`, params.slice(0, params.length - 2));
    return { items: rows, total: total?.n ?? 0 };
  });

  app.get('/api/cases/:id', async (req: any, reply) => {
    const c = await one<any>('SELECT * FROM cases WHERE id = $1', [Number(req.params.id)]);
    if (!c) return reply.code(404).send({ error: 'case not found' });
    const contents: { tier: RarityTier; items: any[] }[] = [];
    for (const tier of RARITY_TIERS) {
      const items = await query<any>(
        `SELECT i.id, i.name, i.weapon, i.category, i.image, i.pattern, i.min_float, i.max_float, i.stattrak, i.souvenir,
                ${PRICE_SUB} AS price_cents
         FROM case_pools p
         JOIN case_pool_items pi ON pi.case_pool_id = p.id
         JOIN items i ON i.id = pi.item_id
         WHERE p.case_id = $1 AND p.tier = $2
         ORDER BY i.name`,
        [c.id, tier],
      );
      contents.push({ tier, items });
    }
    const price = await one<any>('SELECT * FROM prices WHERE item_id = $1', [c.item_id]);
    return {
      ...c,
      probabilities: c.probabilities,
      contents,
      price: price?.lowest_price_cents ?? null,
      volume: price?.volume ?? null,
      priceUpdatedAt: price?.updated_at ?? null,
    };
  });

  app.post('/api/cases/:id/open', async (req: any, reply) => {
    const user = await app.getUser(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    if (user.banned) return reply.code(403).send({ error: 'banned' });
    try {
      const result = await openCase((app as any).ctx.hub, user, Number(req.params.id));
      return result;
    } catch (e: any) {
      const status = e.statusCode ?? 500;
      if (status >= 500) req.log.error(e);
      return reply.code(status).send({ error: e.message });
    }
  });

  app.get('/api/items/popular', async () => {
    const rows = await query<any>(
      `SELECT i.id, i.name, i.weapon, i.category, i.image, i.rarity_tier,
              ${PRICE_SUB} AS price_cents,
              (SELECT MAX(p.volume) FROM prices p WHERE p.item_id = i.id) AS volume
       FROM items i
       WHERE i.kind IN ('skin', 'knife', 'glove')
       ORDER BY volume DESC NULLS LAST, i.name
       LIMIT 24`,
    );
    return { items: rows };
  });

  app.get('/api/items/:id', async (req: any, reply) => {
    const i = await one<any>('SELECT * FROM items WHERE id = $1', [Number(req.params.id)]);
    if (!i) return reply.code(404).send({ error: 'item not found' });
    const prices = await itemPricesByWear(i.id);
    return { ...i, prices };
  });

  app.get('/api/home', async () => {
    const featured = await one<any>(
      `SELECT c.id, c.name, c.image, c.cost_cents
       FROM cases c
       WHERE c.active = TRUE AND c.cost_cents IS NOT NULL
       ORDER BY (SELECT COUNT(*) FROM openings o WHERE o.case_id = c.id) DESC, c.name
       LIMIT 1`,
    );
    const cases = await query<any>(
      `SELECT c.id, c.name, c.image, c.cost_cents,
              (SELECT COUNT(*) FROM openings o WHERE o.case_id = c.id) AS openings
       FROM cases c WHERE c.active = TRUE AND c.cost_cents IS NOT NULL
       ORDER BY openings DESC, c.name LIMIT 10`,
    );
    const popularSkins = await query<any>(
      `SELECT i.id, i.name, i.weapon, i.category, i.image, i.rarity_tier,
              ${PRICE_SUB} AS price_cents
       FROM items i
       WHERE i.kind IN ('skin', 'knife', 'glove')
       ORDER BY (SELECT MAX(p.volume) FROM prices p WHERE p.item_id = i.id) DESC NULLS LAST, i.name
       LIMIT 12`,
    );
    const recentDrops = await query<any>(
      `SELECT o.id, o.item_name, o.rarity_tier, o.price_cents, o.created_at,
              u.username, i.image, i.weapon
       FROM openings o
       JOIN users u ON u.id = o.user_id
       JOIN items i ON i.name = o.item_name
       ORDER BY o.created_at DESC
       LIMIT 12`,
    );
    const activity = await query<any>(
      `SELECT o.id, o.item_name, o.rarity_tier, o.price_cents, o.created_at, u.username
       FROM openings o JOIN users u ON u.id = o.user_id
       WHERE o.rarity_tier = 'rare_special'
       ORDER BY o.created_at DESC LIMIT 8`,
    );
    return { featured, cases, popularSkins, recentDrops, activity };
  });
}
