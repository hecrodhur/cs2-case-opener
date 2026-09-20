/**
 * Pricing system tests.
 * Verifies the Steam-first price pipeline:
 * - no artificial fallbacks (unlisted -> NULL, never an estimated cost)
 * - priceoverview is primary (currency=3 = EUR), saved as EUR cents
 * - search/render fallback accepts EXACT market_hash_name matches only
 * - last_known_cents survives Steam outages
 * - the refresh queue is persistent and progressive (no repeated batches)
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker, type WorkerHandle } from './harness.js';
import { PriceSyncService, parsePriceCents, parseVolume, CURRENCY } from '../services/pricing.js';
import { pickPriceJobs } from '../services/priceJobs.js';
import { config } from '../config.js';

let handle: WorkerHandle;
let origFetch: typeof fetch;

before(async () => {
  handle = await startWorker();
});

after(async () => {
  await handle.stop();
});

beforeEach(() => {
  origFetch = globalThis.fetch;
  (config as any).steamMinIntervalMs = 0;
  (config as any).steamRetryBackoffsMs = [1, 1];
});

test('parsePriceCents / parseVolume handle real Steam formats', () => {
  assert.equal(parsePriceCents('136,62€'), 13662);
  assert.equal(parsePriceCents('0,16€'), 16);
  assert.equal(parsePriceCents('$0.18'), 18);
  assert.equal(parsePriceCents('£0.14'), 14);
  assert.equal(parsePriceCents('1.234,56€'), 123456);
  assert.equal(parsePriceCents('9,70€'), 970);
  assert.equal(parsePriceCents(''), null);
  assert.equal(parseVolume('85,710'), 85710);
  assert.equal(parseVolume('43'), 43);
  assert.equal(parseVolume(undefined), 0);
});

test('currency map: 1=USD 2=GBP 3=EUR (Steam codes)', () => {
  assert.equal(CURRENCY['1'], 'USD');
  assert.equal(CURRENCY['2'], 'GBP');
  assert.equal(CURRENCY['3'], 'EUR');
});

interface SteamStub {
  urls: string[];
  overview: Record<string, string | null>; // mhn -> lowest_price string (null = success without price)
  searchHtml: string;
  fail?: boolean;
}

function makeSteamStub(overview: Record<string, string | null>, searchHtml = ''): SteamStub {
  const stub: SteamStub = { urls: [], overview, searchHtml };
  (globalThis as any).fetch = async (url: any, init?: any) => {
    const u = String(url);
    stub.urls.push(u);
    if (stub.fail) throw new Error('network down');
    if (u.includes('priceoverview')) {
      const mhn = decodeURIComponent(u.split('market_hash_name=')[1]);
      const price = stub.overview[mhn];
      if (price == null) {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(
        JSON.stringify({ success: true, lowest_price: price, volume: '85,710', median_price: price }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (u.includes('search/render')) {
      return new Response(JSON.stringify({ success: true, results_html: stub.searchHtml }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected url in test: ${u}`);
  };
  return stub;
}

function row(db: any, itemId: number) {
  return db.prepare('SELECT * FROM prices WHERE item_id = ? AND wear = ?').get(itemId, 'any') as any;
}

test('1. CS:GO Weapon Case never gets a 1.49€ fallback (cost stays NULL without Steam price)', async () => {
  await handle.withDb(async () => {
    const { ensureCaseCosts } = await import('../data/sync.js');
    const { insert } = await import('../db.js');
    const itemId = await insert(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', 'CS:GO Weapon Case', 'CS:GO Weapon Case', 'mil_spec')`,
    );
    const caseId = await insert(
      `INSERT INTO cases (item_id, name, market_hash_name, first_sale_date, active) VALUES ($1, 'CS:GO Weapon Case', 'CS:GO Weapon Case', '2015-01-01', 1)`,
      [itemId],
    );
    await ensureCaseCosts();
    const c = (handle.db.prepare('SELECT cost_cents FROM cases WHERE id = ?').get(caseId) as any).cost_cents;
    assert.equal(c, null, 'no price from Steam -> cost must be NULL');
  });
});

test('2+3+4. Steam priceoverview price is stored in EUR cents, requested with currency=3', async () => {
  const stub = makeSteamStub({ 'CS:GO Weapon Case 2': '136,62€' });
  await handle.withDb(async () => {
    const { insert } = await import('../db.js');
    const itemId = await insert(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', 'CS:GO Weapon Case 2', 'CS:GO Weapon Case 2', 'mil_spec')`,
    );
    const caseId = await insert(
      `INSERT INTO cases (item_id, name, market_hash_name, first_sale_date, active) VALUES ($1, 'CS:GO Weapon Case 2', 'CS:GO Weapon Case 2', '2015-01-01', 1)`,
      [itemId],
    );
    const prices = new PriceSyncService();
    prices.request({ itemId, mhn: 'CS:GO Weapon Case 2', wear: 'any', stattrak: false });
    const n = await prices.run();
    assert.equal(n, 1);

    // requested with currency=3 (EUR)
    const url = stub.urls.find((u) => u.includes('priceoverview'));
    assert.ok(url, 'priceoverview was called');
    assert.ok(url.includes('currency=3'), `currency=3 requested: ${url}`);

    const r = row(handle.db, itemId);
    assert.ok(r, 'price row exists');
    assert.equal(Number(r.lowest_price_cents), 13662, '136,62€ -> 13662 cents');
    assert.equal(r.currency, 'EUR', 'stored as EUR');
    assert.equal(Number(r.volume), 85710, 'volume 85,710 parsed');
    assert.equal(r.source, 'steam_market');
    assert.equal(Number(r.last_known_cents), 13662);

    // case cost follows the real Steam price (ratio 1.0)
    const c = (handle.db.prepare('SELECT cost_cents FROM cases WHERE id = ?').get(caseId) as any).cost_cents;
    assert.equal(Number(c), 13662, 'case cost = real Steam price');
  });
  globalThis.fetch = origFetch;
});

test('5. search/render fallback: exact data-hash-name match only (no partial matches)', async () => {
  const html = [
    '<div class="row" data-hash-name="Kilowatt Case 3" data-asset="x">',
    '<span class="qty" data-qty="791236">',
    '<span class="price" data-price="18" data-currency="1"></span></span></div>',
  ].join('');
  const stub = makeSteamStub({ 'Kilowatt Case': null }, html); // overview: unlisted
  await handle.withDb(async () => {
    const { insert } = await import('../db.js');
    const itemId = await insert(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', 'Kilowatt Case', 'Kilowatt Case', 'mil_spec')`,
    );
    await insert(
      `INSERT INTO cases (item_id, name, market_hash_name, first_sale_date, active) VALUES ($1, 'Kilowatt Case', 'Kilowatt Case', '2015-01-01', 1)`,
      [itemId],
    );
    const prices = new PriceSyncService();
    prices.request({ itemId, mhn: 'Kilowatt Case', wear: 'any', stattrak: false });
    await prices.run();

    const r = row(handle.db, itemId);
    assert.ok(r, 'a row is written so the queue advances');
    assert.equal(r.lowest_price_cents, null, 'no exact match -> NULL, never a near-name price');
  });
  globalThis.fetch = origFetch;
});

test('6. Steam outage keeps last_known_cents (and the last real price)', async () => {
  const stub = makeSteamStub({ 'Operation Breakout': '9,70€' });
  let itemId = 0;
  await handle.withDb(async () => {
    const { insert } = await import('../db.js');
    itemId = await insert(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', 'Operation Breakout', 'Operation Breakout', 'mil_spec')`,
    );
    const prices = new PriceSyncService();
    prices.request({ itemId, mhn: 'Operation Breakout', wear: 'any', stattrak: false });
    await prices.run();
    assert.equal(Number(row(handle.db, itemId).lowest_price_cents), 970);
  });
  // Steam now fails: everything must stay as it was
  (globalThis as any).fetch = async () => {
    throw new Error('network down');
  };
  await handle.withDb(async () => {
    const prices = new PriceSyncService();
    prices.request({ itemId, mhn: 'Operation Breakout', wear: 'any', stattrak: false });
    await prices.run();
  });
  const r = row(handle.db, itemId);
  assert.equal(Number(r.lowest_price_cents), 970, 'price unchanged after outage');
  assert.equal(Number(r.last_known_cents), 970, 'last_known_cents preserved');
  globalThis.fetch = origFetch;
});

test('7. no real price anywhere -> cost_cents is NULL (never a fabricated number)', async () => {
  makeSteamStub({ 'Old Unlisted Case': null });
  await handle.withDb(async () => {
    const { insert } = await import('../db.js');
    const { ensureCaseCosts } = await import('../data/sync.js');
    const itemId = await insert(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', 'Old Unlisted Case', 'Old Unlisted Case', 'mil_spec')`,
    );
    const caseId = await insert(
      `INSERT INTO cases (item_id, name, market_hash_name, first_sale_date, active) VALUES ($1, 'Old Unlisted Case', 'Old Unlisted Case', '2015-01-01', 1)`,
      [itemId],
    );
    const prices = new PriceSyncService();
    prices.request({ itemId, mhn: 'Old Unlisted Case', wear: 'any', stattrak: false });
    await prices.run();
    await ensureCaseCosts();
    const c = (handle.db.prepare('SELECT cost_cents FROM cases WHERE id = ?').get(caseId) as any).cost_cents;
    assert.equal(c, null, 'cost stays NULL when Steam has no listing');
  });
  globalThis.fetch = origFetch;
});

function insertCase(name: string): Promise<number> {
  return handle.withDb(async () => {
    const { insert } = await import('../db.js');
    const itemId = await insert(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', $1, $1, 'mil_spec')`,
      [name],
    );
    return insert(
      `INSERT INTO cases (item_id, name, market_hash_name, first_sale_date, active) VALUES ($1, $2, $2, '2015-01-01', 1)`,
      [itemId, name],
    );
  });
}

test('8+9. refresh queue is progressive and resumes (cron never restarts from the same batch)', async () => {
  for (let i = 1; i <= 10; i++) await insertCase(`Queue Case ${String(i).padStart(2, '0')}`);
  await handle.withDb(async () => {
    let batch = await pickPriceJobs(4);
    assert.equal(batch.length, 4, 'first batch of 4');
    const first = new Set(batch.map((j) => j.itemId));

    // simulate processing: price rows now exist for those 4
    const { run: r } = await import('../db.js');
    for (const j of batch) {
      await r(
        `INSERT INTO prices (item_id, wear, stattrak, lowest_price_cents, currency, source, updated_at)
         VALUES ($1, 'any', 0, 100, 'EUR', 'steam_market', now())
         ON CONFLICT (item_id, wear, stattrak, souvenir) DO UPDATE SET lowest_price_cents = 100, updated_at = now()`,
        [j.itemId],
      );
    }
    batch = await pickPriceJobs(4);
    assert.equal(batch.length, 4, 'second batch of 4');
    for (const j of batch) assert.ok(!first.has(j.itemId), 'queue advanced: no repeat of previous batch');

    // finish the rest
    const rest = await pickPriceJobs(10);
    for (const j of rest) {
      await (await import('../db.js')).run(
        `INSERT INTO prices (item_id, wear, stattrak, lowest_price_cents, currency, source, updated_at)
         VALUES ($1, 'any', 0, 100, 'EUR', 'steam_market', now())
         ON CONFLICT (item_id, wear, stattrak, souvenir) DO UPDATE SET lowest_price_cents = 100, updated_at = now()`,
        [j.itemId],
      );
    }
    const empty = await pickPriceJobs(50);
    assert.equal(empty.length, 0, 'all fresh: nothing to do (cron does not re-pick the same cases)');
  });

  // after the 6h window passes, the queue starts again from the OLDEST, not the same first 25
  handle.db
    .prepare("UPDATE prices SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 hours') WHERE item_id IN (SELECT id FROM items WHERE market_hash_name LIKE 'Queue Case %')")
    .run();
  await handle.withDb(async () => {
    const oldest = await pickPriceJobs(100);
    assert.equal(oldest.length, 10, 'stale again: whole set is picked');
    const names = oldest.map((j) => j.mhn);
    assert.deepEqual(names, [...names].sort(), 'oldest-first deterministic order');
  });
});

test('10. repair forces re-enqueue even when the case price row is fresh', async () => {
  await handle.withDb(async () => {
    const { insert, run } = await import('../db.js');
    const { repairCaseCosts } = await import('../services/priceJobs.js');
    const itemId = await insert(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', 'Repair Case', 'Repair Case', 'mil_spec')`,
    );
    const caseId = await insert(
      `INSERT INTO cases (item_id, name, market_hash_name, cost_cents, first_sale_date, active) VALUES ($1, 'Repair Case', 'Repair Case', 5000, '2015-01-01', 1)`,
      [itemId],
    );
    // fresh price row (updated a moment ago): the normal queue would skip it
    await run(
      `INSERT INTO prices (item_id, wear, stattrak, souvenir, lowest_price_cents, currency, source, updated_at, last_known_cents)
       VALUES ($1, 'any', 0, 0, 5000, 'EUR', 'steam_market', now(), 5000)`,
      [itemId],
    );
    const before = await pickPriceJobs(100);
    assert.ok(!before.some((j) => j.itemId === itemId), 'fresh row: not picked before repair');

    const invalidated = await repairCaseCosts();
    assert.ok(invalidated >= 1, 'case cost reset');
    const cost = (handle.db.prepare('SELECT cost_cents FROM cases WHERE id = ?').get(caseId) as any).cost_cents;
    assert.equal(cost, null, 'cost reset to NULL');
    const price = (handle.db.prepare('SELECT lowest_price_cents FROM prices WHERE item_id = ?').get(itemId) as any).lowest_price_cents;
    assert.equal(Number(price), 5000, 'last known price kept (last-known-good)');

    const after = await pickPriceJobs(100);
    const job = after.find((j) => j.itemId === itemId);
    assert.ok(job, 'repaired case is re-enqueued despite the fresh fetch');
    assert.equal(job!.mhn, 'Repair Case');
  });
});

test('11. ensureCaseCosts only uses the base variant (souvenir rows never feed a case cost)', async () => {
  await handle.withDb(async () => {
    const { insert, run } = await import('../db.js');
    const { ensureCaseCosts } = await import('../data/sync.js');
    const itemId = await insert(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', 'Souv Case', 'Souv Case', 'mil_spec')`,
    );
    const caseId = await insert(
      `INSERT INTO cases (item_id, name, market_hash_name, first_sale_date, active) VALUES ($1, 'Souv Case', 'Souv Case', '2015-01-01', 1)`,
      [itemId],
    );
    // only a souvenir variant exists for this item: it must not be used
    await run(
      `INSERT INTO prices (item_id, wear, stattrak, souvenir, lowest_price_cents, currency, source, updated_at)
       VALUES ($1, 'any', 0, 1, 9000, 'EUR', 'steam_market', now())`,
      [itemId],
    );
    await ensureCaseCosts();
    const cost = (handle.db.prepare('SELECT cost_cents FROM cases WHERE id = ?').get(caseId) as any).cost_cents;
    assert.equal(cost, null, 'souvenir price never used for the base case cost');
  });
});
