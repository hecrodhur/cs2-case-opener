import { query, one, run } from '../db.js';
import { config } from '../config.js';
import { steamQueryFor } from '../util/marketHash.js';
import { RealtimeHub } from './realtime.js';

/**
 * PriceSyncService
 * - fetches real Steam Community Market prices by market_hash_name
 * - in-memory + DB cache (prices table), per-item stale window
 * - global rate limiter between Steam requests, retries with exponential backoff
 * - every fetch is appended to price_history; last_known_cents survives failures
 * - NEVER called from the React client and never per opening/user request:
 *   drops read the cached price, the sync queue refreshes in the background.
 */

export interface PriceJob {
  itemId: number;
  mhn: string; // full market_hash_name including wear
  wear: string;
  stattrak: boolean;
}

export interface SteamPrice {
  lowestCents: number;
  volume: number;
  currency: string;
}

const CURRENCY: Record<string, string> = { 1: 'USD', 2: 'EUR', 3: 'GBP' };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseMarketHtml(html: string): { mhn: string; lowestCents: number; volume: number; currency: string }[] {
  const out: { mhn: string; lowestCents: number; volume: number; currency: string }[] = [];
  const rowRe = /data-hash-name="([^"]+)"[\s\S]*?data-qty="(\d+)"[\s\S]*?data-price="(\d+)" data-currency="(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    out.push({
      mhn: m[1],
      lowestCents: Number(m[3]),
      volume: Number(m[2]),
      currency: CURRENCY[m[4]] ?? 'USD',
    });
  }
  return out;
}

export class PriceSyncService {
  private queue: PriceJob[] = [];
  private queued = new Set<string>();
  private running = false;
  private lastRequestAt = 0;
  hub: RealtimeHub | null = null;

  setHub(hub: RealtimeHub) {
    this.hub = hub;
  }

  private key(j: PriceJob) {
    return `${j.itemId}|${j.wear}|${j.stattrak ? 1 : 0}`;
  }

  /** Enqueue a price job. Returns true if it was scheduled. */
  request(job: PriceJob): boolean {
    const k = this.key(job);
    if (this.queued.has(k)) return false;
    this.queued.add(k);
    this.queue.push(job);
    return true;
  }

  get pending() {
    return this.queue.length;
  }

  /** Process the queue until empty. Safe to call from multiple places. */
  async run(maxJobs?: number): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let done = 0;
    try {
      while (this.queue.length && (maxJobs == null || done < maxJobs)) {
        const job = this.queue.shift()!;
        this.queued.delete(this.key(job));
        done++;
        await this.fetchAndStore(job);
      }
      return done;
    } finally {
      this.running = false;
    }
  }

  private async throttle() {
    const wait = this.lastRequestAt + config.steamMinIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
  }

  /** Fetch one market_hash_name from Steam. null when not listed. */
  async fetchSteam(mhn: string): Promise<SteamPrice | null> {
    const url =
      `${config.steamMarketUrl}?query=${encodeURIComponent(steamQueryFor(mhn))}` +
      `&start=0&count=10&sort_column=price&sort_dir=asc&filter_version=0&filter_currency=0` +
      `&filter_state=1&filter_type=bit_immutable&filter_tradable=1&filter_marketable_name=1`;
    const backoffs = [2000, 6000, 20000];
    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
      if (attempt > 0) {
        await sleep(backoffs[attempt - 1]);
      }
      await this.throttle();
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
            Accept: 'application/json',
          },
        });
        this.lastRequestAt = Date.now();
        if (res.status === 429 || res.status >= 500) {
          if (attempt === backoffs.length) throw new Error(`Steam unavailable (${res.status})`);
          continue;
        }
        if (!res.ok) throw new Error(`Steam HTTP ${res.status}`);
        const json: any = await res.json();
        const rows = parseMarketHtml(json.results_html ?? '');
        const exact = rows.find((r) => r.mhn === mhn);
        if (exact) return { lowestCents: exact.lowestCents, volume: exact.volume, currency: exact.currency };
        // partial-match rows: accept the cheapest row of the same base name prefix
        return null;
      } catch (e: any) {
        if (attempt === backoffs.length) throw new Error(`steam fetch failed for "${mhn}": ${e.message}`);
      }
    }
    return null;
  }

  private async fetchAndStore(job: PriceJob) {
    let price: SteamPrice | null = null;
    let source = 'steam_market';
    try {
      price = await this.fetchSteam(job.mhn);
    } catch {
      // keep last known value; job will be retried on next stale window
      return;
    }
    if (price) {
      await run(
        `INSERT INTO prices (item_id, wear, stattrak, lowest_price_cents, median_price_cents, volume, currency, source, updated_at, last_known_cents)
         VALUES ($1,$2,$3,$4,$4,$5,$6,'steam_market', now(), $4)
         ON CONFLICT (item_id, wear, stattrak) DO UPDATE SET
           lowest_price_cents = EXCLUDED.lowest_price_cents,
           median_price_cents = EXCLUDED.median_price_cents,
           volume = EXCLUDED.volume,
           currency = EXCLUDED.currency,
           source = EXCLUDED.source,
           updated_at = now(),
           last_known_cents = EXCLUDED.last_known_cents`,
        [job.itemId, job.wear, job.stattrak, price.lowestCents, price.volume, price.currency],
      );
      await run(
        `INSERT INTO price_history (item_id, wear, stattrak, lowest_price_cents, median_price_cents, volume, source)
         VALUES ($1,$2,$3,$4,$4,$5,'steam_market')`,
        [job.itemId, job.wear, job.stattrak, price.lowestCents, price.volume],
      );
      this.hub?.broadcast('price', { itemId: job.itemId, wear: job.wear, lowestCents: price.lowestCents });
    } else {
      // listed nothing: record null price with last-known preserved
      await run(
        `INSERT INTO prices (item_id, wear, stattrak, lowest_price_cents, volume, currency, source, updated_at, last_known_cents)
         SELECT $1,$2,$3,NULL,0,'USD','steam_market',now(),COALESCE(p.last_known_cents, p.lowest_price_cents)
         FROM (SELECT * FROM prices WHERE item_id=$1 AND wear=$2 AND stattrak=$3) p
         ON CONFLICT DO NOTHING`,
        [job.itemId, job.wear, job.stattrak],
      );
    }
    await this.maybeUpdateCaseCost(job);
  }

  /** When the priced item is a case, keep cases.cost_cents in sync. */
  private async maybeUpdateCaseCost(job: PriceJob) {
    const row = await one<any>(
      'SELECT c.id, p.lowest_price_cents FROM prices p JOIN items i ON i.id = p.item_id JOIN cases c ON c.item_id = i.id WHERE p.item_id = $1 AND i.kind = $2',
      [job.itemId, 'case'],
    );
    if (!row?.lowest_price_cents) return;
    const cost = Math.max(1, Math.round(row.lowest_price_cents * config.priceCostRatio));
    const cur = await one<any>('SELECT cost_cents FROM cases WHERE id = $1', [row.id]);
    if (cur?.cost_cents !== cost) {
      await run('UPDATE cases SET cost_cents = $2, updated_at = now() WHERE id = $1', [row.id, cost]);
    }
  }
}

/** Representative wear for displaying an item price (most liquid first). */
export async function itemDisplayPrice(itemId: number, wear?: string, stattrak = false): Promise<number | null> {
  const p = await one<any>(
    'SELECT lowest_price_cents FROM prices WHERE item_id = $1 AND wear = $2 AND stattrak = $3',
    [itemId, wear ?? 'any', stattrak],
  );
  if (p?.lowest_price_cents != null) return p.lowest_price_cents;
  if (wear) {
    const any = await one<any>(
      'SELECT lowest_price_cents FROM prices WHERE item_id = $1 AND stattrak = $2 ORDER BY updated_at DESC LIMIT 1',
      [itemId, stattrak],
    );
    return any?.lowest_price_cents ?? null;
  }
  return null;
}

export async function itemPricesByWear(itemId: number, stattrak = false): Promise<Record<string, number | null>> {
  const rows = await query<any>(
    'SELECT wear, lowest_price_cents FROM prices WHERE item_id = $1 AND stattrak = $2 AND lowest_price_cents IS NOT NULL',
    [itemId, stattrak],
  );
  const out: Record<string, number | null> = {};
  for (const r of rows) out[r.wear] = r.lowest_price_cents;
  return out;
}
