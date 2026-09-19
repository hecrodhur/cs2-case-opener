import { query, one, js } from '../db.js';
import { openCase } from '../services/opening.js';
import { itemPricesByWear } from '../services/pricing.js';
import { RARITY_TIERS, type RarityTier } from 'shared';
import { route, json, authUser, httpError } from './index.js';

const PRICE_SUB = `COALESCE(
  (SELECT p.lowest_price_cents FROM prices p WHERE p.item_id = i.id AND p.stattrak = FALSE AND p.wear = 'Field-Tested'),
  (SELECT MIN(p.lowest_price_cents) FROM prices p WHERE p.item_id = i.id AND p.stattrak = FALSE)
)`;

route.get('/api/cases', async (req) => {
  const sort = req.query.get('sort') === 'price' ? 'price' : req.query.get('sort') === 'name' ? 'name' : 'popular';
  const minPrice = req.query.get('minPrice') ? Number(req.query.get('minPrice')) : null;
  const maxPrice = req.query.get('maxPrice') ? Number(req.query.get('maxPrice')) : null;
  const collection = req.query.get('collection') ? String(req.query.get('collection')) : null;
  const limit = Math.min(Number(req.query.get('limit') ?? 48), 200);
  const offset = Number(req.query.get('offset') ?? 0);

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
    where += ` AND EXISTS (SELECT 1 FROM items i WHERE i.id = c.item_id AND i.collections LIKE $${params.length})`;
  }
  params.push(limit, offset);
  const rows = await query<any>(
    `SELECT c.id, c.name, c.image, c.cost_cents, c.probabilities, c.first_sale_date,
            (SELECT COUNT(*) FROM case_pools p JOIN case_pool_items pi ON pi.case_pool_id = p.id WHERE p.case_id = c.id) AS item_count,
            (SELECT COUNT(*) FROM openings o WHERE o.case_id = c.id) AS openings,
            (SELECT p.lowest_price_cents FROM prices p JOIN items i ON i.id = p.item_id WHERE i.id = c.item_id LIMIT 1) AS steam_price,
            (SELECT p.volume FROM prices p JOIN items i ON i.id = p.item_id WHERE i.id = c.item_id LIMIT 1) AS steam_volume,
            (SELECT p.updated_at FROM prices p JOIN items i ON i.id = p.item_id WHERE i.id = c.item_id LIMIT 1) AS price_updated_at
     FROM cases c
     WHERE ${where}
     ORDER BY ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const total = await one<any>(`SELECT COUNT(*) AS n FROM cases c WHERE ${where}`, params.slice(0, params.length - 2));
  return json(200, {
    items: rows.map((r) => ({ ...r, probabilities: js(r.probabilities) ?? {} })),
    total: Number(total?.n ?? 0),
  });
});

route.get('/api/cases/:id', async (req) => {
  const c = await one<any>('SELECT * FROM cases WHERE id = $1', [Number(req.params.id)]);
  if (!c) throw httpError(404, 'case not found');
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
  return json(200, {
    ...c,
    probabilities: js(c.probabilities) ?? {},
    contents,
    price: price?.lowest_price_cents ?? null,
    volume: price?.volume ?? null,
    priceUpdatedAt: price?.updated_at ?? null,
  });
});

route.post('/api/cases/:id/open', async (req, ctx) => {
  const user = await authUser(req);
  const result = await openCase(ctx.hub, user, Number(req.params.id));
  return json(200, result);
});

route.get('/api/items/popular', async () => {
  const rows = await query<any>(
    `SELECT i.id, i.name, i.weapon, i.category, i.image, i.rarity_tier,
            ${PRICE_SUB} AS price_cents,
            (SELECT MAX(p.volume) FROM prices p WHERE p.item_id = i.id) AS volume
     FROM items i
     WHERE i.kind IN ('skin', 'knife', 'glove')
     ORDER BY volume DESC NULLS LAST, i.name
     LIMIT 24`,
  );
  return json(200, { items: rows });
});

route.get('/api/items/:id', async (req) => {
  const i = await one<any>('SELECT * FROM items WHERE id = $1', [Number(req.params.id)]);
  if (!i) throw httpError(404, 'item not found');
  const prices = await itemPricesByWear(i.id);
  return json(200, { ...i, prices });
});

route.get('/api/home', async () => {
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
  return json(200, { featured, cases, popularSkins, recentDrops, activity });
});
