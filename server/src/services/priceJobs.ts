import { query, one, run } from '../db.js';
import type { PriceSyncService, PriceJob } from './pricing.js';
import { existingWears, variantMhn } from '../util/marketHash.js';

const STALE_HOURS = 6;

/**
 * Price refresh queue.
 * The queue is persistent: it is derived from the DB every time (oldest or
 * never-fetched first), so a restart or a new Worker isolate always resumes
 * where it left off and never re-fetches the same batch twice while newer
 * items are still waiting.
 *
 * Every job is one concrete variant (item + wear + stattrak + souvenir) with
 * the exact Steam market_hash_name of that variant. The wear list comes from
 * the item's real float range (CSGO-API min_float/max_float): an item only
 * gets a job for wears that actually exist for it.
 *
 * Batch size: Workers Free allows 50 subrequests per invocation. Worst case
 * per job: 2 Steam fetches (overview + search fallback) + 1 prices upsert +
 * 1 price_history + 3 case-cost ops + 1 audit = 8. 5 jobs x 8 = 40, plus a
 * few queue/stats queries = ~43 < 50. So at most 5 prices per invocation;
 * the cron (every 5 min) keeps draining the persistent queue in small lots.
 */
export const PRICE_BATCH_SIZE = 5;

const CUTOFF = `strftime('%Y-%m-%dT%H:%M:%fZ','now', '-${STALE_HOURS} hours')`;

const cutoffValue = () => new Date(Date.now() - STALE_HOURS * 3600_000).toISOString();

interface ItemRow {
  id: number;
  name: string;
  kind: string;
  min_float: number | null;
  max_float: number | null;
  stattrak: number;
  souvenir: number;
}

/** All variants (wears x stattrak x souvenir) that exist for one item. */
function variantsForItem(i: ItemRow): { wear: string; stattrak: boolean; souvenir: boolean; mhn: string }[] {
  const glove = i.kind === 'glove';
  const wears = glove ? ['any'] : existingWears(i.min_float, i.max_float);
  const out: { wear: string; stattrak: boolean; souvenir: boolean; mhn: string }[] = [];
  for (const w of wears) {
    out.push({ wear: w, stattrak: false, souvenir: false, mhn: variantMhn(i.name, { wear: w, glove }) });
    if (i.stattrak) out.push({ wear: w, stattrak: true, souvenir: false, mhn: variantMhn(i.name, { wear: w, stattrak: true, glove }) });
    if (i.souvenir) out.push({ wear: w, stattrak: false, souvenir: true, mhn: variantMhn(i.name, { wear: w, souvenir: true, glove }) });
  }
  return out;
}

/** Stale variants (oldest first) of the given items, as price jobs. */
async function variantJobs(items: ItemRow[], limit: number): Promise<PriceJob[]> {
  if (!items.length || limit <= 0) return [];
  const priceRows = await query<any>(
    `SELECT item_id, wear, stattrak, souvenir, MIN(updated_at) AS updated_at
     FROM prices WHERE item_id = ANY($1::bigint[])
     GROUP BY item_id, wear, stattrak, souvenir`,
    [items.map((i) => i.id)],
  );
  const seen = new Map<string, string>();
  for (const p of priceRows) {
    const k = `${p.item_id}|${p.wear}|${p.stattrak}|${p.souvenir}`;
    const cur = seen.get(k);
    if (cur == null || (p.updated_at as string) < cur) seen.set(k, p.updated_at as string);
  }
  const cutoff = cutoffValue();
  const jobs: { job: PriceJob; at: string | null; itemId: number }[] = [];
  for (const i of items) {
    for (const v of variantsForItem(i)) {
      const at = seen.get(`${i.id}|${v.wear}|${v.stattrak}|${v.souvenir}`) ?? null;
      if (at != null && at >= cutoff) continue;
      jobs.push({ job: { itemId: i.id, mhn: v.mhn, wear: v.wear, stattrak: v.stattrak, souvenir: v.souvenir }, at, itemId: i.id });
    }
  }
  jobs.sort((a, b) => (a.at == null ? -1 : b.at == null ? 1 : a.at.localeCompare(b.at) || a.itemId - b.itemId));
  return jobs.slice(0, limit).map((j) => j.job);
}

const ITEM_SELECT = `SELECT DISTINCT i.id, i.name, i.kind, i.min_float, i.max_float, i.stattrak, i.souvenir
  FROM items i`;

export async function pickPriceJobs(limit: number): Promise<PriceJob[]> {
  const cap = Math.min(limit, 100);
  const jobs: PriceJob[] = [];
  if (cap <= 0) return jobs;
  // 1) active cases first (one variant: the case's own market_hash_name)
  const caseRows = await query<any>(
    `SELECT i.id AS item_id, COALESCE(c.market_hash_name, c.name) AS mhn
     FROM cases c
     JOIN items i ON i.id = c.item_id
     LEFT JOIN prices p ON p.item_id = i.id AND p.wear = 'any' AND p.stattrak = 0 AND p.souvenir = 0
     WHERE c.active = 1
       AND (p.updated_at IS NULL OR p.updated_at < ${CUTOFF})
     ORDER BY (p.updated_at IS NULL) DESC, p.updated_at ASC, c.id ASC
     LIMIT $1`,
    [cap],
  );
  for (const r of caseRows) {
    jobs.push({ itemId: r.item_id, mhn: r.mhn, wear: 'any', stattrak: false, souvenir: false });
    if (jobs.length >= cap) return jobs;
  }
  // 2) every variant of skins in active case pools
  const poolItems = await query<ItemRow>(
    `SELECT DISTINCT i.id, i.name, i.kind, i.min_float, i.max_float, i.stattrak, i.souvenir
     FROM case_pools cp
     JOIN cases c ON c.id = cp.case_id AND c.active = 1
     JOIN case_pool_items pi ON pi.case_pool_id = cp.id
     JOIN items i ON i.id = pi.item_id
     WHERE i.kind IN ('skin', 'knife', 'glove')
     ORDER BY i.id
     LIMIT 400`,
    [],
  );
  for (const j of await variantJobs(poolItems, cap - jobs.length)) {
    jobs.push(j);
    if (jobs.length >= cap) return jobs;
  }
  // 3) variants of items users already own (inventory/history valuation)
  const limit3 = cap - jobs.length;
  if (limit3 > 0) {
    const ownItems = await query<ItemRow>(
      `${ITEM_SELECT}
       JOIN item_instances ii ON ii.item_id = i.id
       WHERE i.kind IN ('skin', 'knife', 'glove')
         AND NOT EXISTS (SELECT 1 FROM case_pool_items pi
                         JOIN case_pools cp ON cp.id = pi.case_pool_id
                         JOIN cases c ON c.id = cp.case_id AND c.active = 1
                         WHERE pi.item_id = i.id)
       ORDER BY i.id
       LIMIT 400`,
      [],
    );
    for (const j of await variantJobs(ownItems, limit3)) jobs.push(j);
  }
  return jobs.slice(0, cap);
}

export interface PriceStats {
  cases: number;
  casesPriced: number;
  casesNoPrice: number;
  steamPriced: number;
  fallbackPriced: number;
  pending: number;
  lastSyncedAt: string | null;
  steamOk: number;
  notListed: number;
  errors: number;
  http403: number;
  http429: number;
  http5xx: number;
  jsonErrors: number;
  otherErrors: number;
  lastOkAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
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
     LEFT JOIN prices p ON p.item_id = i.id AND p.wear = 'any' AND p.stattrak = 0 AND p.souvenir = 0
     WHERE c.active = 1 AND (p.updated_at IS NULL OR p.updated_at < ${CUTOFF})`,
  ))[0].n;
  // item-level staleness: the item still has variants to (re)fetch
  const pendingSkin = (await query<any>(
    `SELECT COUNT(DISTINCT i.id) AS n FROM case_pools cp
     JOIN cases c ON c.id = cp.case_id AND c.active = 1
     JOIN case_pool_items pi ON pi.case_pool_id = cp.id
     JOIN items i ON i.id = pi.item_id
     WHERE NOT EXISTS (SELECT 1 FROM prices p WHERE p.item_id = i.id AND p.updated_at >= ${CUTOFF})`,
  ))[0].n;
  const last = (await one<any>('SELECT MAX(updated_at) AS t FROM prices WHERE lowest_price_cents IS NOT NULL'))?.t ?? null;
  const rs = (await one<any>('SELECT * FROM price_run_stats WHERE id = 1')) ?? null;
  return {
    cases: Number(c.total),
    casesPriced: Number(c.priced ?? 0),
    casesNoPrice: Number(c.no_price ?? 0),
    steamPriced: Number(src[0].steam),
    fallbackPriced: Number(src[0].fallback),
    pending: Number(pendingCase) + Number(pendingSkin),
    lastSyncedAt: last,
    steamOk: Number(rs?.steam_ok ?? 0),
    notListed: Number(rs?.not_listed ?? 0),
    errors: Number(rs?.errors ?? 0),
    http403: Number(rs?.http_403 ?? 0),
    http429: Number(rs?.http_429 ?? 0),
    http5xx: Number(rs?.http_5xx ?? 0),
    jsonErrors: Number(rs?.json_errors ?? 0),
    otherErrors: Number(rs?.other_errors ?? 0),
    lastOkAt: rs?.last_ok_at ?? null,
    lastError: rs?.last_error ?? null,
    lastErrorAt: rs?.last_error_at ?? null,
  };
}

/**
 * Build the next refresh batch (at most PRICE_BATCH_SIZE) and enqueue it.
 * Returns the number of jobs enqueued. The caller decides when to run() it
 * (the worker does so via waitUntil so the request is not held open).
 */
export async function refreshPricesForCases(prices: PriceSyncService, limit = PRICE_BATCH_SIZE): Promise<number> {
  const jobs = await pickPriceJobs(Math.min(limit, PRICE_BATCH_SIZE));
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
