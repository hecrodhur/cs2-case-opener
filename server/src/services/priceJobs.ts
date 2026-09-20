import { query, one, run } from '../db.js';
import type { PriceSyncService, PriceJob } from './pricing.js';

const STALE_HOURS = 6;

/**
 * Price refresh queue.
 * The queue is persistent: it is derived from the DB every time (oldest or
 * never-fetched first), so a restart or a new Worker isolate always resumes
 * where it left off and never re-fetches the same batch twice while newer
 * items are still waiting.
 * Priority: active cases first, then pool skins.
 */

const CUTOFF = `strftime('%Y-%m-%dT%H:%M:%fZ','now', '-${STALE_HOURS} hours')`;

export async function pickPriceJobs(limit: number): Promise<PriceJob[]> {
  const jobs: PriceJob[] = [];
  if (limit <= 0) return jobs;
  // 1) active cases (the mhn is the case's own market_hash_name)
  const caseRows = await query<any>(
    `SELECT i.id AS item_id, COALESCE(c.market_hash_name, c.name) AS mhn
     FROM cases c
     JOIN items i ON i.id = c.item_id
     LEFT JOIN prices p ON p.item_id = i.id AND p.wear = 'any' AND p.stattrak = 0
     WHERE c.active = 1
       AND (p.updated_at IS NULL OR p.updated_at < ${CUTOFF})
     ORDER BY (p.updated_at IS NULL) DESC, p.updated_at ASC, c.id ASC
     LIMIT $1`,
    [Math.min(limit, 100)],
  );
  for (const r of caseRows) {
    jobs.push({ itemId: r.item_id, mhn: r.mhn, wear: 'any', stattrak: false });
    if (jobs.length >= limit) return jobs;
  }
  // 2) pool skins (Field-Tested when the item has a float, 'any' otherwise)
  const skinLimit = limit - jobs.length;
  if (skinLimit > 0) {
    const skinRows = await query<any>(
      `SELECT DISTINCT i.id AS item_id, i.name, i.min_float, p.updated_at
       FROM case_pools cp
       JOIN cases c ON c.id = cp.case_id AND c.active = 1
       JOIN case_pool_items pi ON pi.case_pool_id = cp.id
       JOIN items i ON i.id = pi.item_id
       LEFT JOIN prices p ON p.item_id = i.id
         AND p.wear = CASE WHEN i.min_float IS NOT NULL THEN 'Field-Tested' ELSE 'any' END
         AND p.stattrak = 0
       WHERE p.updated_at IS NULL OR p.updated_at < ${CUTOFF}
       ORDER BY (p.updated_at IS NULL) DESC, p.updated_at ASC, i.id ASC
       LIMIT $1`,
      [skinLimit],
    );
    for (const r of skinRows) {
      const wear = r.min_float != null ? 'Field-Tested' : 'any';
      const mhn = wear === 'Field-Tested' ? `${r.name} (Field-Tested)` : r.name;
      jobs.push({ itemId: r.item_id, mhn, wear, stattrak: false });
    }
  }
  return jobs;
}

export interface PriceStats {
  cases: number;
  casesPriced: number;
  casesNoPrice: number;
  steamPriced: number;
  fallbackPriced: number;
  pending: number;
  lastSyncedAt: string | null;
}

/** Aggregate price state for the admin UI. */
export async function priceStats(): Promise<PriceStats> {
  const c = (await query<any>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN cost_cents IS NOT NULL THEN 1 ELSE 0 END) AS priced,
            SUM(CASE WHEN cost_cents IS NULL THEN 1 ELSE 0 END) AS no_price
     FROM cases WHERE active = 1`,
  ))[0];
  const src = await query<any>(
    `SELECT COALESCE(SUM(CASE WHEN source = 'steam_market' THEN 1 ELSE 0 END), 0) AS steam,
            COALESCE(SUM(CASE WHEN source <> 'steam_market' THEN 1 ELSE 0 END), 0) AS fallback
     FROM prices
     JOIN items i ON i.id = prices.item_id
     JOIN cases c ON c.item_id = i.id
     WHERE prices.lowest_price_cents IS NOT NULL`,
  );
  const pendingCase = (await query<any>(
    `SELECT COUNT(*) AS n FROM cases c
     JOIN items i ON i.id = c.item_id
     LEFT JOIN prices p ON p.item_id = i.id AND p.wear = 'any' AND p.stattrak = 0
     WHERE c.active = 1 AND (p.updated_at IS NULL OR p.updated_at < ${CUTOFF})`,
  ))[0].n;
  const pendingSkin = (await query<any>(
    `SELECT COUNT(DISTINCT i.id) AS n FROM case_pools cp
     JOIN cases c ON c.id = cp.case_id AND c.active = 1
     JOIN case_pool_items pi ON pi.case_pool_id = cp.id
     JOIN items i ON i.id = pi.item_id
     LEFT JOIN prices p ON p.item_id = i.id
       AND p.wear = CASE WHEN i.min_float IS NOT NULL THEN 'Field-Tested' ELSE 'any' END
       AND p.stattrak = 0
     WHERE p.updated_at IS NULL OR p.updated_at < ${CUTOFF}`,
  ))[0].n;
  const last = (await one<any>('SELECT MAX(updated_at) AS t FROM prices'))?.t ?? null;
  return {
    cases: Number(c.total),
    casesPriced: Number(c.priced ?? 0),
    casesNoPrice: Number(c.no_price ?? 0),
    steamPriced: Number(src[0].steam),
    fallbackPriced: Number(src[0].fallback),
    pending: Number(pendingCase) + Number(pendingSkin),
    lastSyncedAt: last,
  };
}

/**
 * Build the next refresh batch and enqueue it. Returns the number of jobs
 * enqueued. The caller decides when to run() it (the worker does so via
 * waitUntil so the request is not held open).
 */
export async function refreshPricesForCases(prices: PriceSyncService, limit = 60): Promise<number> {
  const jobs = await pickPriceJobs(limit);
  for (const j of jobs) prices.request(j);
  return jobs.length;
}

/**
 * One-shot repair: invalidates every active case cost so the next price sync
 * re-derives it from real Steam data (or leaves it NULL when Steam has no
 * listing). Balances, inventories, openings and battles are untouched.
 */
export async function repairCaseCosts(): Promise<number> {
  return run('UPDATE cases SET cost_cents = NULL, updated_at = now() WHERE active = 1 AND cost_cents IS NOT NULL');
}
