/**
 * Per-variant pricing tests.
 * - wears per item come from the real float range (no FT price used as base for all)
 * - exact market_hash_name per (item, wear, stattrak, souvenir) variant
 * - value model: exact real Steam price > marked fallback > tier base
 * - Steam 403 / success=false are errors: nothing stored, last_known preserved,
 *   stats + audit logged, pricempire (if keyed) fills in
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker, type WorkerHandle } from './harness.js';
import { existingWears, variantMhn, marketHashName } from '../util/marketHash.js';
import { estimatedValueCents, stattrakMultiplier } from '../util/value.js';
import { pickPriceJobs, priceStats } from '../services/priceJobs.js';
import { PriceSyncService } from '../services/pricing.js';
import { config, setPricempireKey } from '../config.js';

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

// ---- pure: wears from float ranges ----

test('existingWears: derived from the item float range, not hardcoded', () => {
  // AWP | Dragon Lore: float 0-0.15 -> only FN and MW exist
  assert.deepEqual(existingWears(0, 0.15), ['Factory New', 'Minimal Wear']);
  // full wear skin
  assert.deepEqual(existingWears(0, 1), ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']);
  // high-float-only item
  assert.deepEqual(existingWears(0.45, 0.6), ['Battle-Scarred']);
  // no float data: assume all
  assert.deepEqual(existingWears(null, null), existingWears(0, 1));
});

test('market_hash_name: exact variant names for real items', () => {
  assert.equal(variantMhn('AWP | Dragon Lore', { wear: 'Factory New' }), 'AWP | Dragon Lore (Factory New)');
  assert.equal(variantMhn('★ Butterfly Knife | Doppler', { wear: 'Factory New' }), '★ Butterfly Knife | Doppler (Factory New)');
  assert.equal(variantMhn('AK-47 | Redline', { wear: 'Field-Tested' }), 'AK-47 | Redline (Field-Tested)');
  assert.equal(variantMhn('AK-47 | Redline', { wear: 'Field-Tested', stattrak: true }), 'StatTrak™ AK-47 | Redline (Field-Tested)');
  assert.equal(variantMhn('★ Karambit | Fade', { wear: 'Factory New', stattrak: true }), '★ StatTrak™ Karambit | Fade (Factory New)');
  assert.equal(variantMhn('AWP | Dragon Lore', { wear: 'Factory New', souvenir: true }), 'Souvenir AWP | Dragon Lore (Factory New)');
  // gloves are listed on Steam without a wear suffix
  assert.equal(variantMhn("Sport Gloves | Pandora's Box", { wear: 'Field-Tested', glove: true }), "Sport Gloves | Pandora's Box");
  assert.equal(marketHashName('AK-47 | Redline', 'Field-Tested'), 'AK-47 | Redline (Field-Tested)');
});

// ---- pure: value model ----

const base = { tier: 'covert' as const, floatValue: null, pattern: null, phase: null, seed: null, category: 'rifles' };

test('value: exact real Steam price for the variant wins (no wear multipliers)', () => {
  const rows = [
    { wear: 'Factory New', stattrak: 0, souvenir: 0, lowest_price_cents: 450000 },
    { wear: 'Field-Tested', stattrak: 0, souvenir: 0, lowest_price_cents: 250000 },
  ];
  // AWP | Dragon Lore (FN): the real FN ask, not 250000 * 1.9
  const v = estimatedValueCents({ ...base, wear: 'Factory New', stattrak: false, souvenir: false }, rows);
  assert.ok(v >= 450000 * 0.96 && v <= 450000 * 1.04, `expected ~450000, got ${v}`);
});

test('value: real StatTrak row is used as-is (no premium applied twice)', () => {
  const rows = [
    { wear: 'Factory New', stattrak: 0, souvenir: 0, lowest_price_cents: 450000 },
    { wear: 'Factory New', stattrak: 1, souvenir: 0, lowest_price_cents: 500000 },
  ];
  const v = estimatedValueCents({ ...base, wear: 'Factory New', stattrak: true, souvenir: false }, rows);
  assert.ok(v >= 500000 * 0.96 && v <= 500000 * 1.04, `expected ~500000, got ${v}`);
});

test('value: ST placeholder (1-2c) ignored, marked fallback base x premium used', () => {
  const rows = [
    { wear: 'Field-Tested', stattrak: 0, souvenir: 0, lowest_price_cents: 500 },
    { wear: 'Field-Tested', stattrak: 1, souvenir: 0, lowest_price_cents: 2 }, // Steam placeholder
  ];
  const v = estimatedValueCents({ ...base, tier: 'restricted', wear: 'Field-Tested', stattrak: true, souvenir: false }, rows);
  assert.ok(v >= 500 * 1.75 * 0.96 && v <= 500 * 1.75 * 1.04, `expected ~875 (500x1.75), got ${v}`);
});

test('value: souvenir exact row wins; no rows -> tier fallback', () => {
  const rows = [
    { wear: 'Field-Tested', stattrak: 0, souvenir: 1, lowest_price_cents: 600000 },
  ];
  const v = estimatedValueCents({ ...base, wear: 'Field-Tested', stattrak: false, souvenir: true }, rows);
  assert.ok(v >= 600000 * 0.96 && v <= 600000 * 1.04, `expected ~600000, got ${v}`);

  const tier = estimatedValueCents({ ...base, wear: 'Factory New', stattrak: false, souvenir: false }, []);
  assert.ok(tier >= 9000 * 1.9 * 0.96 && tier <= 9000 * 1.9 * 1.04, `covert FN tier fallback ~17100, got ${tier}`);
});

test('stattrakMultiplier: knives 0.925, shrinking premium for skins', () => {
  assert.equal(stattrakMultiplier(50000, 'Knives'), 0.925);
  assert.equal(stattrakMultiplier(500, 'rifles'), 1.75);
  assert.equal(stattrakMultiplier(1500, 'rifles'), 1.35);
  assert.equal(stattrakMultiplier(450000, 'rifles'), 1.08);
});

// ---- DB: per-variant queue ----

test('pickPriceJobs: one job per real variant (wears x ST x souvenir), exact mhns', async () => {
  await handle.withDb(async () => {
    const { insert } = await import('../db.js');
    const caseItem = await insert(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', 'V Variant Case', 'V Variant Case', 'mil_spec')`,
    );
    await insert(
      `INSERT INTO cases (item_id, name, market_hash_name, first_sale_date, active) VALUES ($1, 'V Variant Case', 'V Variant Case', '2015-01-01', 1)`,
      [caseItem],
    );
    const dl = await insert(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier, min_float, max_float) VALUES ('skin', 'AWP | Dragon Lore', 'AWP | Dragon Lore', 'covert', 0, 0.15)`,
    );
    const rl = await insert(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier, min_float, max_float, stattrak, souvenir) VALUES ('skin', 'AK-47 | Redline', 'AK-47 | Redline', 'classified', 0, 1, 1, 1)`,
    );
    const glove = await insert(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier, min_float, max_float) VALUES ('glove', $1, $1, 'covert', 0, 1)`,
      ["Sport Gloves | Pandora's Box"],
    );
    const caseId = (handle.db.prepare('SELECT id FROM cases WHERE item_id = ?').get(caseItem) as any).id;
    handle.db.prepare("INSERT INTO case_pools (case_id, tier) VALUES (?, 'covert')").run(caseId);
    const pid = handle.db.prepare('SELECT id FROM case_pools WHERE case_id = ? AND tier = ?').get(caseId, 'covert') as any;
    for (const id of [dl, rl, glove]) {
      handle.db.prepare('INSERT INTO case_pool_items (case_pool_id, item_id) VALUES (?, ?)').run(pid.id, id);
    }
    const jobs = await pickPriceJobs(100);
    const mhns = new Set(jobs.map((j) => j.mhn));
    // case itself
    assert.ok(mhns.has('V Variant Case'), 'case job present');
    // Dragon Lore: FN + MW only (float 0-0.15)
    assert.ok(mhns.has('AWP | Dragon Lore (Factory New)'), 'Dragon Lore FN');
    assert.ok(mhns.has('AWP | Dragon Lore (Minimal Wear)'), 'Dragon Lore MW');
    assert.ok(![...mhns].some((m) => m.startsWith('AWP | Dragon Lore (Field-Tested)')), 'no FT job for Dragon Lore');
    // Redline: 5 wears x (base + ST + souvenir) = 15
    for (const w of ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']) {
      assert.ok(mhns.has(`AK-47 | Redline (${w})`), `Redline ${w}`);
      assert.ok(mhns.has(`StatTrak™ AK-47 | Redline (${w})`), `ST Redline ${w}`);
      assert.ok(mhns.has(`Souvenir AK-47 | Redline (${w})`), `Souvenir Redline ${w}`);
    }
    // glove: one job, no wear suffix
    assert.ok(mhns.has("Sport Gloves | Pandora's Box"), 'glove base job');
    assert.ok(![...mhns].some((m) => m.startsWith('Sport Gloves') && m.includes('(')), 'glove has no wear suffix');
    // total: 1 case + 2 DL + 15 RL + 1 glove
    assert.equal(jobs.length, 19, `19 variant jobs, got ${jobs.length}`);
  });
});

// ---- Steam errors: 403 / success=false / pricempire ----

test('403 from Steam = error: nothing stored, last_known preserved, stats + audit', async () => {
  const { insert, run } = await import('../db.js');
  const itemId = await handle.withDb(async () => {
    const { insert: ins } = await import('../db.js');
    const id = await ins(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', '403 Case', '403 Case', 'mil_spec')`,
    );
    await run(
      `INSERT INTO prices (item_id, wear, stattrak, souvenir, lowest_price_cents, currency, source, updated_at, last_known_cents)
       VALUES ($1, 'any', 0, 0, 500, 'EUR', 'steam_market', now(), 500)`,
      [id],
    );
    return id;
  });
  (globalThis as any).fetch = async () => new Response('', { status: 403 });
  const before = await handle.withDb(async () => priceStats());
  await handle.withDb(async () => {
    const prices = new PriceSyncService();
    prices.request({ itemId, mhn: '403 Case', wear: 'any', stattrak: false });
    await prices.run(1, { attempts: 1 });
  });
  const r = handle.db.prepare('SELECT * FROM prices WHERE item_id = ?').get(itemId) as any;
  assert.equal(Number(r.lowest_price_cents), 500, 'price unchanged (not converted to NULL)');
  assert.equal(Number(r.last_known_cents), 500, 'last_known preserved');
  const after = await handle.withDb(async () => priceStats());
  assert.equal(after.errors - before.errors, 1, 'errors counter +1');
  assert.equal(after.http403 - before.http403, 1, 'http403 counter +1');
  const a = handle.db.prepare("SELECT * FROM audit_logs WHERE action = 'price_fetch_error' AND target = '403 Case'").get() as any;
  assert.ok(a, 'audit row for the error');
  globalThis.fetch = origFetch;
});

test('success=false from Steam = error (not "no listing")', async () => {
  const { insert, run } = await import('../db.js');
  const itemId = await handle.withDb(async () => {
    const { insert: ins } = await import('../db.js');
    const id = await ins(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', 'SFalse Case', 'SFalse Case', 'mil_spec')`,
    );
    await run(
      `INSERT INTO prices (item_id, wear, stattrak, souvenir, lowest_price_cents, currency, source, updated_at, last_known_cents)
       VALUES ($1, 'any', 0, 0, 700, 'EUR', 'steam_market', now(), 700)`,
      [id],
    );
    return id;
  });
  (globalThis as any).fetch = async (url: any) => {
    if (String(url).includes('priceoverview'))
      return new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    throw new Error('search should not be called for success=false');
  };
  const before = await handle.withDb(async () => priceStats());
  await handle.withDb(async () => {
    const prices = new PriceSyncService();
    prices.request({ itemId, mhn: 'SFalse Case', wear: 'any', stattrak: false });
    await prices.run(1, { attempts: 1 });
  });
  const r = handle.db.prepare('SELECT * FROM prices WHERE item_id = ?').get(itemId) as any;
  assert.equal(Number(r.lowest_price_cents), 700, 'price unchanged');
  const after = await handle.withDb(async () => priceStats());
  assert.equal(after.errors - before.errors, 1, 'counted as error');
  assert.equal(after.otherErrors - before.otherErrors, 1, 'classified other (HTTP 200, success=false)');
  globalThis.fetch = origFetch;
});

test('pricempire fills in when Steam errors (keyed, real external price)', async () => {
  setPricempireKey('test-key');
  const { insert, run } = await import('../db.js');
  const itemId = await handle.withDb(async () => {
    const { insert: ins } = await import('../db.js');
    const id = await ins(
      `INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', 'PE Case', 'PE Case', 'mil_spec')`,
    );
    return id;
  });
  (globalThis as any).fetch = async (url: any) => {
    const u = String(url);
    if (u.includes('pricempire')) {
      return new Response(
        JSON.stringify([{ market_hash_name: 'PE Case', prices: [{ provider_key: 'steam', price: 1.23, count: 7 }] }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('', { status: 429 }); // Steam rate-limited
  };
  const before = await handle.withDb(async () => priceStats());
  await handle.withDb(async () => {
    const prices = new PriceSyncService();
    prices.request({ itemId, mhn: 'PE Case', wear: 'any', stattrak: false });
    await prices.run(1, { attempts: 1 });
  });
  const r = handle.db.prepare('SELECT * FROM prices WHERE item_id = ?').get(itemId) as any;
  assert.ok(r, 'price row written by fallback');
  assert.equal(Number(r.lowest_price_cents), 123, 'pricempire 1.23 -> 123 cents');
  assert.equal(r.source, 'pricempire');
  const after = await handle.withDb(async () => priceStats());
  assert.equal(after.fallbackOk - before.fallbackOk, 1, 'recovery counted as fallback, not steam ok');
  assert.equal(after.steamOk - before.steamOk, 0, 'steam_ok untouched by a fallback recovery');
  assert.equal(after.errors - before.errors, 1, 'the Steam 429 itself is still counted');
  setPricempireKey('');
  globalThis.fetch = origFetch;
});
