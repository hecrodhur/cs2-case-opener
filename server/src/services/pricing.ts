import { one, query, run } from '../db.js';
import { config, getPricempireKey } from '../config.js';
import { steamQueryFor } from '../util/marketHash.js';
import { RealtimeHub } from './realtime.js';

/**
 * PriceSyncService
 * Steam Community Market is the single source of truth for prices:
 *   1. primary: /market/priceoverview/ (per-variant, currency=3 = EUR)
 *   2. fallback: /market/search/render/ (exact data-hash-name match only)
 * Every job is one concrete variant (item + wear + stattrak + souvenir) and
 * is fetched with the exact market_hash_name of that variant.
 * Three states, never mixed:
 *   priced     Steam answered and has a listing -> stored
 *   not_listed Steam answered correctly, no listing -> stored as NULL
 *   error      Steam could not be queried (403/429/5xx/network/JSON) ->
 *              nothing is stored, last_known_cents is preserved and the
 *              variant is retried on a later pass. An access error is
 *              NEVER converted into "no price".
 * An optional Pricempire key (PRICEMPIRE_API_KEY secret) can fill in items
 * Steam does not list or could not be queried.
 */

export interface PriceJob {
  itemId: number;
  mhn: string; // exact market_hash_name of this variant
  wear: string;
  stattrak: boolean;
  souvenir?: boolean;
}

export interface SteamPrice {
  lowestCents: number;
  volume: number;
  currency: string;
}

export type FetchResult =
  | { status: 'priced'; price: SteamPrice; source: 'steam_market' | 'pricempire' }
  | { status: 'not_listed' }
  | { status: 'error'; message: string; error: SteamError };

export class SteamError extends Error {
  status: number | null;
  kind: 'http' | 'network' | 'json';
  endpoint: string;
  constructor(message: string, kind: 'http' | 'network' | 'json', status: number | null, endpoint: string) {
    super(message);
    this.name = 'SteamError';
    this.status = status;
    this.kind = kind;
    this.endpoint = endpoint;
  }
}

export function classifySteamError(e: unknown): 'http_403' | 'http_429' | 'http_5xx' | 'json' | 'other' {
  const err = e as SteamError;
  if (err?.status === 403) return 'http_403';
  if (err?.status === 429) return 'http_429';
  if (typeof err?.status === 'number' && err.status >= 500) return 'http_5xx';
  if (err?.kind === 'json') return 'json';
  return 'other';
}

export const STEAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

// Steam numeric currency codes: 1=USD 2=GBP 3=EUR
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
  // counters accumulated during one run(), persisted once at the end
  private batch = { ok: 0, not_listed: 0, errors: 0, http_403: 0, http_429: 0, http_5xx: 0, json: 0, other: 0, lastError: '' };

  setHub(hub: RealtimeHub) {
    this.hub = hub;
  }

  private key(j: PriceJob) {
    return `${j.itemId}|${j.wear}|${j.stattrak ? 1 : 0}|${j.souvenir ? 1 : 0}`;
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

  /**
   * Process the queue until empty or maxJobs. attempts = Steam retry count
   * per variant (1 for waitUntil batches to stay inside the 30s limit, 3 in
   * cron where retries with backoff are affordable).
   */
  async run(maxJobs?: number, opts?: { attempts?: number }): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    const attempts = Math.max(1, opts?.attempts ?? 3);
    this.batch = { ok: 0, not_listed: 0, errors: 0, http_403: 0, http_429: 0, http_5xx: 0, json: 0, other: 0, lastError: '' };
    let done = 0;
    try {
      while (this.queue.length && (maxJobs == null || done < maxJobs)) {
        const job = this.queue.shift()!;
        this.queued.delete(this.key(job));
        done++;
        await this.fetchAndStore(job, attempts);
      }
      return done;
    } finally {
      this.running = false;
      await this.persistBatchStats();
    }
  }

  private async throttle() {
    const wait = this.lastRequestAt + config.steamMinIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
  }

  private async getJson(url: string, endpoint: string): Promise<any> {
    const res = await fetch(url, {
      headers: { 'User-Agent': STEAM_UA, Accept: 'application/json' },
    }).catch((e: any) => {
      throw new SteamError(`steam fetch failed: ${e.message} (${endpoint})`, 'network', null, endpoint);
    });
    this.lastRequestAt = Date.now();
    if (!res.ok) throw new SteamError(`Steam HTTP ${res.status} (${endpoint})`, 'http', res.status, endpoint);
    try {
      return await res.json();
    } catch (e: any) {
      throw new SteamError(`steam bad JSON: ${e.message} (${endpoint})`, 'json', res.status, endpoint);
    }
  }

  /** One attempt: priceoverview first, search/render (exact match) as fallback. */
  private async fetchOnce(mhn: string): Promise<FetchResult> {
    const overviewUrl =
      `${config.steamPriceOverviewUrl}?appid=730&currency=${config.steamCurrency}` +
      `&market_hash_name=${encodeURIComponent(mhn)}`;
    try {
      const json: any = await this.getJson(overviewUrl, 'priceoverview');
      if (json?.success === true) {
        const cents = parsePriceCents(String(json.lowest_price ?? ''));
        if (cents != null) {
          return {
            status: 'priced',
            source: 'steam_market',
            price: { lowestCents: cents, volume: parseVolume(json.volume), currency: CURRENCY[String(config.steamCurrency)] ?? 'EUR' },
          };
        }
        // Steam answered correctly but has no listing for this variant
        return { status: 'not_listed' };
      }
      // success=false is a Steam-side error, not "no listing"
      return {
        status: 'error',
        message: `steam success=false (priceoverview) mhn=${mhn}`,
        error: new SteamError('steam success=false (priceoverview)', 'http', 200, 'priceoverview'),
      };
    } catch (e: any) {
      // priceoverview unavailable: fall back to the search endpoint
      const searchUrl =
        `${config.steamMarketUrl}?query=${encodeURIComponent(steamQueryFor(mhn))}` +
        `&appid=730&currency=${config.steamCurrency}&start=0&count=50&sort_column=price&sort_dir=asc` +
        `&filter_version=0&filter_state=1&filter_type=bit_immutable&filter_tradable=1&filter_marketable_name=1`;
      try {
        const json: any = await this.getJson(searchUrl, 'search');
        const rows = parseMarketHtml(json.results_html ?? '');
        const exact = rows.find((r) => r.mhn === mhn);
        if (exact) return { status: 'priced', source: 'steam_market', price: { lowestCents: exact.lowestCents, volume: exact.volume, currency: exact.currency } };
        return { status: 'not_listed' };
      } catch (e2: any) {
        const err = e2 instanceof SteamError ? e2 : new SteamError(String(e2?.message ?? e2), 'network', null, 'search');
        return { status: 'error', message: `${e.message}; then ${err.message}`, error: err };
      }
    }
  }

  /**
   * Fetch one variant from Steam with retries.
   * not_listed = Steam answered and has no listing (store NULL).
   * error = network/Steam failure (keep last_known_cents, retry later).
   */
  async fetchFromSteam(mhn: string, attempts = 3): Promise<FetchResult> {
    const backoffs = config.steamRetryBackoffsMs;
    let lastErr: SteamError = new SteamError('steam fetch failed', 'network', null, 'priceoverview');
    for (let attempt = 0; attempt < Math.max(1, attempts); attempt++) {
      if (attempt > 0) await sleep(backoffs[attempt - 1] ?? 0);
      await this.throttle();
      const r = await this.fetchOnce(mhn);
      if (r.status !== 'error') return r;
      lastErr = r.error;
    }
    return { status: 'error', message: lastErr.message, error: lastErr };
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
      const price = Number(entry?.price); // EUR
      if (!Number.isFinite(price) || price <= 0) continue;
      map.set(mhn, { lowestCents: Math.round(price * 100), volume: Number(entry.count) || 0, currency: 'EUR' });
    }
    this.peCache = { at: Date.now(), map };
    return map;
  }

  private async fetchAndStore(job: PriceJob, attempts: number): Promise<FetchResult['status']> {
    const souvenir = Boolean(job.souvenir);
    let result = await this.fetchFromSteam(job.mhn, attempts);
    const steamError = result.status === 'error' ? result : null;
    if (steamError && getPricempireKey()) {
      // real external price (never invented): fills not_listed variants and
      // Steam access errors alike
      try {
        const map = await this.pricempire();
        const p = map?.get(job.mhn);
        if (p) result = { status: 'priced', source: 'pricempire', price: p };
      } catch {
        // fallback source is best-effort; the Steam result stands
      }
    }
    if (steamError) {
      // counted once whether or not the fallback recovered it;
      // keep last_known_cents untouched, the queue retries on the next pass
      const cls = classifySteamError(steamError.error);
      this.batch.errors++;
      this.batch[cls]++;
      this.batch.lastError = `${job.mhn}: ${steamError.message}`;
      await run('INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4)', [
        null,
        'price_fetch_error',
        job.mhn,
        { message: steamError.message, kind: cls, status: steamError.error.status ?? null, endpoint: steamError.error.endpoint },
      ]).catch(() => {});
    }
    if (result.status === 'error') {
      return 'error';
    }
    if (result.status === 'priced') {
      this.batch.ok++;
      const p = result.price;
      await run(
        `INSERT INTO prices (item_id, wear, stattrak, souvenir, lowest_price_cents, median_price_cents, volume, currency, source, updated_at, last_known_cents)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8, now(), $5)
         ON CONFLICT (item_id, wear, stattrak, souvenir) DO UPDATE SET
           lowest_price_cents = EXCLUDED.lowest_price_cents,
           median_price_cents = EXCLUDED.median_price_cents,
           volume = EXCLUDED.volume,
           currency = EXCLUDED.currency,
           source = EXCLUDED.source,
           updated_at = now(),
           last_known_cents = EXCLUDED.last_known_cents`,
        [job.itemId, job.wear, job.stattrak, souvenir, p.lowestCents, p.volume, p.currency, result.source],
      );
      await run(
        `INSERT INTO price_history (item_id, wear, stattrak, souvenir, lowest_price_cents, median_price_cents, volume, source)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7)`,
        [job.itemId, job.wear, job.stattrak, souvenir, p.lowestCents, p.volume, result.source],
      );
      this.hub?.broadcast('price', { itemId: job.itemId, wear: job.wear, lowestCents: p.lowestCents });
    } else {
      // Steam answered correctly: no real listing for this variant
      this.batch.not_listed++;
      await run(
        `INSERT INTO prices (item_id, wear, stattrak, souvenir, lowest_price_cents, volume, currency, source, updated_at, last_known_cents)
         VALUES ($1,$2,$3,$4,NULL,0,$5,$6,now(),NULL)
         ON CONFLICT (item_id, wear, stattrak, souvenir) DO UPDATE SET
           lowest_price_cents = NULL,
           source = EXCLUDED.source,
           updated_at = now(),
           last_known_cents = COALESCE(prices.last_known_cents, prices.lowest_price_cents)`,
        [job.itemId, job.wear, job.stattrak, souvenir, CURRENCY[String(config.steamCurrency)] ?? 'EUR', 'steam_market'],
      );
    }
    await this.syncCaseCost(job);
    return result.status;
  }

  /** Persist this batch's counters (one D1 statement per batch run). */
  private async persistBatchStats(): Promise<void> {
    const b = this.batch;
    if (b.ok === 0 && b.not_listed === 0 && b.errors === 0) return;
    await run(
      `INSERT INTO price_run_stats (id, steam_ok, not_listed, errors, http_403, http_429, http_5xx, json_errors, other_errors, last_ok_at, last_error_at, last_error)
       VALUES (1, $1,$2,$3,$4,$5,$6,$7,$8, now(), now(), $9)
       ON CONFLICT(id) DO UPDATE SET
         steam_ok = price_run_stats.steam_ok + EXCLUDED.steam_ok,
         not_listed = price_run_stats.not_listed + EXCLUDED.not_listed,
         errors = price_run_stats.errors + EXCLUDED.errors,
         http_403 = price_run_stats.http_403 + EXCLUDED.http_403,
         http_429 = price_run_stats.http_429 + EXCLUDED.http_429,
         http_5xx = price_run_stats.http_5xx + EXCLUDED.http_5xx,
         json_errors = price_run_stats.json_errors + EXCLUDED.json_errors,
         other_errors = price_run_stats.other_errors + EXCLUDED.other_errors,
         last_ok_at = CASE WHEN EXCLUDED.steam_ok > 0 THEN EXCLUDED.last_ok_at ELSE price_run_stats.last_ok_at END,
         last_error_at = CASE WHEN EXCLUDED.errors > 0 THEN EXCLUDED.last_error_at ELSE price_run_stats.last_error_at END,
         last_error = CASE WHEN EXCLUDED.errors > 0 THEN EXCLUDED.last_error ELSE price_run_stats.last_error END`,
      [b.ok, b.not_listed, b.errors, b.http_403, b.http_429, b.http_5xx, b.json, b.other, b.lastError],
    ).catch(() => {});
  }

  /** When the priced variant belongs to a case, keep cases.cost_cents in sync with the real Steam price. */
  private async syncCaseCost(job: PriceJob) {
    const row = await one<any>(
      `SELECT c.id AS case_id, p.lowest_price_cents FROM prices p
       JOIN items i ON i.id = p.item_id
       JOIN cases c ON c.item_id = i.id
       WHERE p.item_id = $1 AND i.kind = 'case' AND p.wear = $2 AND p.stattrak = 0 AND p.souvenir = 0`,
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
      // Steam has no listing: the case must not keep a stale cost
      const cur = await one<any>('SELECT cost_cents FROM cases WHERE id = $1', [row.case_id]);
      if (cur?.cost_cents != null) {
        await run('UPDATE cases SET cost_cents = NULL, updated_at = now() WHERE id = $1', [row.case_id]);
      }
    }
  }
}

/** Representative price for displaying an item (exact variant first, then any). */
export async function itemDisplayPrice(itemId: number, wear?: string, stattrak = false, souvenir = false): Promise<number | null> {
  const p = await one<any>(
    'SELECT lowest_price_cents FROM prices WHERE item_id = $1 AND wear = $2 AND stattrak = $3 AND souvenir = $4 AND lowest_price_cents IS NOT NULL',
    [itemId, wear ?? 'any', stattrak, souvenir],
  );
  if (p?.lowest_price_cents != null) return p.lowest_price_cents;
  if (wear) {
    const any = await one<any>(
      'SELECT lowest_price_cents FROM prices WHERE item_id = $1 AND stattrak = $2 AND souvenir = $3 AND lowest_price_cents IS NOT NULL ORDER BY updated_at DESC LIMIT 1',
      [itemId, stattrak, souvenir],
    );
    return any?.lowest_price_cents ?? null;
  }
  return null;
}

export async function itemPricesByWear(itemId: number, stattrak = false, souvenir = false): Promise<Record<string, number | null>> {
  const rows = await query<any>(
    'SELECT wear, lowest_price_cents FROM prices WHERE item_id = $1 AND stattrak = $2 AND souvenir = $3 AND lowest_price_cents IS NOT NULL',
    [itemId, stattrak, souvenir],
  );
  const out: Record<string, number | null> = {};
  for (const r of rows) out[r.wear] = r.lowest_price_cents;
  return out;
}
