import { query, one } from '../db.js';

export interface InventoryFilters {
  search?: string;
  rarity?: string;
  sort?: 'newest' | 'price_desc' | 'price_asc' | 'float_asc' | 'float_desc' | 'name';
  limit?: number;
  offset?: number;
}

const SORTS: Record<string, string> = {
  newest: 'ii.created_at DESC',
  price_desc: 'COALESCE(p.lowest_price_cents, ii.price_cents) DESC NULLS LAST',
  price_asc: 'COALESCE(p.lowest_price_cents, ii.price_cents) ASC NULLS LAST',
  float_asc: 'ii.float_value ASC NULLS LAST',
  float_desc: 'ii.float_value DESC NULLS LAST',
  name: 'i.name ASC',
};

export async function listInventory(userId: number, f: InventoryFilters) {
  const limit = Math.min(Math.max(f.limit ?? 48, 1), 200);
  const offset = Math.max(f.offset ?? 0, 0);
  const where: string[] = ['ii.user_id = $1'];
  const params: any[] = [userId];
  if (f.search) {
    params.push(`%${f.search}%`);
    where.push(`(i.name ILIKE $${params.length} OR i.weapon ILIKE $${params.length})`);
  }
  if (f.rarity) {
    params.push(f.rarity);
    where.push(`ii.rarity_tier = $${params.length}`);
  }
  const sort = SORTS[f.sort ?? 'newest'] ?? SORTS.newest;
  params.push(limit, offset);
  const limitP = `$${params.length - 1}`;
  const offsetP = `$${params.length}`;

  const base = `
    FROM item_instances ii
    JOIN items i ON i.id = ii.item_id
    LEFT JOIN prices p ON p.item_id = ii.item_id AND p.stattrak = ii.stattrak
      AND p.wear = COALESCE(ii.wear, 'any')
    LEFT JOIN cases c ON c.id = ii.case_id
    WHERE ${where.join(' AND ')}`;

  const rows = await query<any>(
    `SELECT ii.id, ii.item_id, i.name, i.weapon, i.category, i.image, i.pattern, i.min_float, i.max_float,
            ii.rarity_tier, ii.float_value, ii.wear, ii.stattrak, ii.souvenir, ii.phase, ii.seed,
            ii.price_cents, p.lowest_price_cents, c.name AS case_name, ii.created_at, ii.listed
     ${base}
     ORDER BY ${sort}
     LIMIT ${limitP} OFFSET ${offsetP}::int`,
    params,
  );
  const countRow = await one<any>(`SELECT COUNT(*)::int AS n ${base}`, params.slice(0, params.length - 2));
  return { items: rows, total: countRow?.n ?? 0 };
}

export async function getInstance(userId: number, instanceId: number) {
  return one<any>(
    `SELECT ii.id, ii.item_id, i.name, i.weapon, i.category, i.image, i.pattern, i.min_float, i.max_float,
            ii.rarity_tier, ii.float_value, ii.wear, ii.stattrak, ii.souvenir, ii.phase, ii.seed,
            ii.price_cents, ii.listed, ii.created_at, ml.id AS listing_id, ml.price_cents AS listing_price
     FROM item_instances ii
     JOIN items i ON i.id = ii.item_id
     LEFT JOIN market_listings ml ON ml.instance_id = ii.id AND ml.status = 'active'
     WHERE ii.id = $1 AND ii.user_id = $2`,
    [instanceId, userId],
  );
}

export async function listHistory(userId: number, limit = 50, offset = 0) {
  const rows = await query<any>(
    `SELECT o.id, o.rarity_tier, o.float_value, o.wear, o.item_name, o.price_cents, o.cost_cents, o.created_at,
            c.name AS case_name, c.image AS case_image, i.image, i.weapon
     FROM openings o
     JOIN cases c ON c.id = o.case_id
     JOIN items i ON i.name = o.item_name
     WHERE o.user_id = $1
     ORDER BY o.created_at DESC
     LIMIT $2 OFFSET $3::int`,
    [userId, Math.min(limit, 200), offset],
  );
  const total = await one<any>('SELECT COUNT(*)::int AS n FROM openings WHERE user_id = $1', [userId]);
  return { items: rows, total: total?.n ?? 0 };
}
