import { query, one } from '../db.js';
import { PriceSyncService } from './pricing.js';

/**
 * Background price refresh. Enqueues Steam jobs for:
 *  - the case itself (its cost is derived from its lowest ask)
 *  - pool skins at their representative wear (Field-Tested, else first available)
 * Items already priced within the stale window are skipped (DB cache).
 * Runs as a fire-and-forget background loop; Steam is rate limited inside.
 */
export async function refreshPricesForCases(prices: PriceSyncService, caseLimit = 25, force = false) {
  const cases = await query<any>(
    'SELECT c.* FROM cases c WHERE c.active = TRUE ORDER BY c.name LIMIT $1',
    [caseLimit],
  );
  for (const c of cases) {
    const item = await one<any>('SELECT i.* FROM items i WHERE i.id = $1', [c.item_id]);
    if (!item) continue;
    if (force || (await stale(item.id, 'any', false))) {
      prices.request({ itemId: item.id, mhn: c.market_hash_name ?? c.name, wear: 'any', stattrak: false });
    }
    const poolItems = await query<any>(
      `SELECT i.* FROM case_pools p JOIN case_pool_items pi ON pi.case_pool_id = p.id
       JOIN items i ON i.id = pi.item_id WHERE p.case_id = $1 ORDER BY i.name`,
      [c.id],
    );
    for (const i of poolItems) {
      // Field-Tested is the representative wear (most liquid listing)
      const wear = i.min_float != null ? 'Field-Tested' : 'any';
      if (force || (await stale(i.id, wear, false))) {
        const mhn = buildMhn(i, wear);
        prices.request({ itemId: i.id, mhn, wear, stattrak: false });
      }
    }
  }
  void prices.run();
}

async function stale(itemId: number, wear: string, stattrak: boolean): Promise<boolean> {
  const p = await one<any>('SELECT updated_at, lowest_price_cents FROM prices WHERE item_id = $1 AND wear = $2 AND stattrak = $3', [itemId, wear, stattrak]);
  if (!p) return true;
  if (p.lowest_price_cents == null) return true; // never had a real price, retry
  const ageMs = Date.now() - new Date(p.updated_at).getTime();
  return ageMs > 6 * 3600_000;
}

function buildMhn(item: any, wear: string): string {
  const base = item.name;
  if (wear === 'any') return base;
  return `${base} (${wear})`;
}
