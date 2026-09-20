import { one, query, run } from '../db.js';
import { config, getPricempireKey } from '../config.js';
import { steamQueryFor } from '../util/marketHash.js';
import { RealtimeHub } from './realtime.js';

/**
 * PriceSyncService
 * Steam Community Market is the single source of truth for prices:
 *   1. primary: /market/priceoverview/ (per-item, currency=3 = EUR)
 *   2. fallback: /market/search/render/ (exact data-hash-name match only)
 * If Steam has no listing the price is stored as NULL (never invented,
 * never estimated from case age). An optional Pricempire key
 * (PRICEMPIRE_API_KEY secret) can fill in items Steam does not list.
 * last_known_cents is preserved across failures so a temporary Steam
 * outage never erases the last real price.
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

export type FetchResult =
  | { status: 'priced'; price: SteamPrice; source: 'steam_market' | 'pricempire' }
  | { status: 'not_listed' }
  | { status: 'error'; message: string };

// Steam numeric currency codes (https://help.steampowered.com): 1=USD 2=GBP 3=EUR
export const CURRENCY: Record<string, string> = { 1: 'USD', 2: 'GBP', 3: 'EUR' };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse a localized price string ("136,62€", "$0.18", "£0.14", "1.234,56€") into cents. */
export function parsePriceCents(raw: string): number | null {
  const s = raw.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const parts = s.split(/[,\.]/);
  let intPart: string;
  let decPart: string | null;
  if (parts.length > 2) {
    // "1.234.567,89": every separator but the last is a thousands separator
    intPart = parts.slice(0, -1).join('');
    decPart = parts[parts.length - 1];
  } else if (parts.length === 2) {
    intPart = parts[0];
    decPart = parts[1];
  } else {
    intPart = s;
    decPart = null;
  }
  if (decPart != null && decPart.length === 3) {
    // "85,710" style: 3 digits after the separator is a thousands group, not a decimal
    intPart += decPart;
    decPart = null;
  }
  const cents = Number(intPart) * 100 + (decPart ? Number(decPart.padEnd(2, '0')) : 0);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

/** Parse a volume string ("43", "85,710") into an integer. */
export function parseVolume(raw: string | undefined | null): number {
  if (!raw) return 0;
  const n = Number(String(raw).replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
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
  private peCache: { at: number; map: Map<string, SteamPrice> } | null = null;

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

  private async getJson(url: string): Promise<any> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
    this.lastRequestAt = Date.now();
    if (res.status === 429 || res.status >= 500) throw new Error(`Steam HTTP ${res.status}`);
    if (!res.ok) throw new Error(`Steam HTTP ${res.status}`);
    return res.json();
  }

  /**
   * Fetch one market_hash_name from Steam.
   * not_listed = Steam answered and has no listing (store NULL).
   * error = network/Steam failure (keep last_known_cents, retry later).
   */
  async fetchFromSteam(mhn: string): Promise<FetchResult> {
    const backoffs = config.steamRetryBackoffsMs;
    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
      if (attempt > 0) await sleep(backoffs[attempt - 1]);
      await this.throttle();
      try {
        // 1) priceoverview: per-item summary, EUR forced via currency=3
        const overviewUrl =
          `${config.steamPriceOverviewUrl}?appid=730&currency=${config.steamCurrency}` +
          `&market_hash_name=${encodeURIComponent(mhn)}`;
        try {
          const json: any = await this.getJson(overviewUrl);
          if (json?.success === true) {
            const cents = parsePriceCents(String(json.lowest_price ?? ''));
            if (cents != null) {
              return {
                status: 'priced',
                source: 'steam_market',
                price: { lowestCents: cents, volume: parseVolume(json.volume), currency: CURRENCY[String(config.steamCurrency)] ?? 'EUR' },
              };
            }
            return { status: 'not_listed' };
          }
          if (json?.success === false) return { status: 'not_listed' };
        } catch {
          // priceoverview unavailable: fall back to the search endpoint
        }
        // 2) search/render: only an EXACT data-hash-name match is accepted
        const searchUrl =
          `${config.steamMarketUrl}?query=${encodeURIComponent(steamQueryFor(mhn))}` +
          `&appid=730&currency=${config.steamCurrency}&start=0&count=50&sort_column=price&sort_dir=asc` +
          `&filter_version=0&filter_state=1&filter_type=bit_immutable&filter_tradable=1&filter_marketable_name=1`;
        const json: any = await this.getJson(searchUrl);
        const rows = parseMarketHtml(json.results_html ?? '');
        const exact = rows.find((r) => r.mhn === mhn);
        if (exact) return { status: 'priced', source: 'steam_market', price: { lowestCents: exact.lowestCents, volume: exact.volume, currency: exact.currency } };
        return { status: 'not_listed' };
      } catch (e: any) {
        if (attempt === backoffs.length) return { status: 'error', message: e.message ?? 'steam fetch failed' };
      }
    }
    return { status: 'error', message: 'steam fetch failed' };
  }

  /** Optional fallback source. One bulk request per ~10 minutes, exact mhn lookup. */
  private async pricempire(): Promise<Map<string, SteamPrice> | null> {
    const key = getPricempireKey();
    if (!key) return null;
    if (this.peCache && Date.now() - this.peCache.at < 10 * 60_000) return this.peCache.map;
    const url = `${config.pricempireUrl}?app_id=730&sources=steam&currency=EUR`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`pricempire HTTP ${res.status}`);
    const body: any = await res.json();
    const items: any[] = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
    const map = new Map<string, SteamPrice>();
    for (const it of items) {
      const mhn: string | undefined = it.market_hash_name;
      if (!mhn) continue;
      const prices: any[] = Array.isArray(it.prices) ? it.prices : [];
      const entry = prices.find((p) => p?.provider_key === 'steam') ?? prices[0];
      const cents = Number(entry?.price);
      if (!Number.isFinite(cents) || cents <= 0) continue;
      map.set(mhn, { lowestCents: Math.round(cents), volume: Number(entry.count) || 0, currency: 'EUR' });
    }
    this.peCache = { at: Date.now(), map };
    return map;
  }

  private async fetchAndStore(job: PriceJob): Promise<FetchResult['status']> {
    let result = await this.fetchFromSteam(job.mhn);
    if (result.status === 'not_listed' && getPricempireKey()) {
      try {
        const map = await this.pricempire();
        const p = map?.get(job.mhn);
        if (p) result = { status: 'priced', source: 'pricempire', price: p };
      } catch {
        // fallback source is best-effort; Steam's not_listed stands
      }
    }
    if (result.status === 'error') {
      // keep last_known_cents untouched; the queue retries on the next pass
      return 'error';
    }
    if (result.status === 'priced') {
      const p = result.price;
      await run(
        `INSERT INTO prices (item_id, wear, stattrak, lowest_price_cents, median_price_cents, volume, currency, source, updated_at, last_known_cents)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7, now(), $4)
         ON CONFLICT (item_id, wear, stattrak) DO UPDATE SET
           lowest_price_cents = EXCLUDED.lowest_price_cents,
           median_price_cents = EXCLUDED.median_price_cents,
           volume = EXCLUDED.volume,
           currency = EXCLUDED.currency,
           source = EXCLUDED.source,
           updated_at = now(),
           last_known_cents = EXCLUDED.last_known_cents`,
        [job.itemId, job.wear, job.stattrak, p.lowestCents, p.volume, p.currency, result.source],
      );
      await run(
        `INSERT INTO price_history (item_id, wear, stattrak, lowest_price_cents, median_price_cents, volume, source)
         VALUES ($1,$2,$3,$4,$4,$5,$6)`,
        [job.itemId, job.wear, job.stattrak, p.lowestCents, p.volume, result.source],
      );
      this.hub?.broadcast('price', { itemId: job.itemId, wear: job.wear, lowestCents: p.lowestCents });
    } else {
      // no real listing: record NULL, preserve last known value
      await run(
        `INSERT INTO prices (item_id, wear, stattrak, lowest_price_cents, volume, currency, source, updated_at, last_known_cents)
         VALUES ($1,$2,$3,NULL,0,$4,$5,now(),NULL)
         ON CONFLICT (item_id, wear, stattrak) DO UPDATE SET
           lowest_price_cents = NULL,
           source = EXCLUDED.source,
           updated_at = now(),
           last_known_cents = COALESCE(prices.last_known_cents, prices.lowest_price_cents)`,
        [job.itemId, job.wear, job.stattrak, CURRENCY[String(config.steamCurrency)] ?? 'EUR', 'steam_market'],
      );
    }
    await this.syncCaseCost(job);
    return result.status;
  }

  /** When the priced item is a case, keep cases.cost_cents in sync with the real Steam price. */
  private async syncCaseCost(job: PriceJob) {
    const row = await one<any>(
      `SELECT c.id AS case_id, p.lowest_price_cents FROM prices p
       JOIN items i ON i.id = p.item_id
       JOIN cases c ON c.item_id = i.id
       WHERE p.item_id = $1 AND i.kind = 'case' AND p.wear = $2 AND p.stattrak = 0`,
      [job.itemId, job.wear],
    );
    if (!row) return;
    if (row.lowest_price_cents != null) {
      const cost = Math.max(1, Math.round(Number(row.lowest_price_cents) * config.priceCostRatio));
      const cur = await one<any>('SELECT cost_cents FROM cases WHERE id = $1', [row.case_id]);
      if (cur?.cost_cents !== cost) {
        await run('UPDATE cases SET cost_cents = $2, updated_at = now() WHERE id = $1', [row.case_id, cost]);
      }
    } else {
      // Steam has no listing: the case must not keep a stale/old cost
      const cur = await one<any>('SELECT cost_cents FROM cases WHERE id = $1', [row.case_id]);
      if (cur?.cost_cents != null) {
        await run('UPDATE cases SET cost_cents = NULL, updated_at = now() WHERE id = $1', [row.case_id]);
      }
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
