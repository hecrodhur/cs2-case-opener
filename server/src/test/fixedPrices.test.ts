import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.RATE_LIMIT_SCALE = '1000';

import { startWorker, type WorkerHandle } from './harness.js';
import { lookupFixedPrice, fixedPricesMeta } from '../data/fixedPrices.js';
import { estimatedValueCents } from '../util/value.js';
import { variantMhn } from '../util/marketHash.js';
import { config } from '../config.js';
import raw from '../data/fixedPrices.json' with { type: 'json' };

let handle: WorkerHandle;
before(async () => {
  handle = await startWorker();
});
after(async () => {
  if (handle) await handle.stop();
});

test('snapshot: exact market_hash_name lookup returns the stored EUR cents', () => {
  const hit = lookupFixedPrice('CS:GO Weapon Case');
  assert.ok(hit, 'the case is in the snapshot');
  assert.ok(hit.priceCents > 0);
  assert.equal(typeof hit.source, 'string');

  // unknown name -> null (caller falls back to the live model)
  assert.equal(lookupFixedPrice('No Such Case In Snapshot'), null);
});

test('snapshot: estimatedValueCents uses the exact price verbatim (no adjustment)', () => {
  const hit = lookupFixedPrice('CS:GO Weapon Case')!;
  const v = estimatedValueCents(
    {
      tier: 'covert',
      floatValue: 0.5,
      wear: 'Field-Tested',
      stattrak: false,
      souvenir: false,
      pattern: 7,
      phase: 3,
      seed: 'deadbeefcafe0001',
      // adversarial live rows that would yield a different value if consulted
      exactMhn: 'CS:GO Weapon Case',
    } as any,
    [{ wear: 'any', stattrak: 0, souvenir: 0, lowest_price_cents: 999999 }],
  );
  assert.equal(v, hit.priceCents, 'snapshot price is final: no wear ratio, no premium, no seed adjustment');
});

test('snapshot: unknown exactMhn falls back to the live model', () => {
  // no snapshot entry + no live rows -> tier-based fallback, still a positive number
  const v = estimatedValueCents(
    {
      tier: 'covert',
      floatValue: 0.5,
      wear: 'Field-Tested',
      stattrak: false,
      souvenir: false,
      pattern: null,
      phase: null,
      seed: 'abc',
      exactMhn: 'Not In Snapshot Case',
    } as any,
    [],
  );
  assert.ok(v > 0, 'falls back to the live model when the snapshot has nothing');
});

test('snapshot: variantMhn keys match the generator for every priced entry', () => {
  const items = raw.items as Record<string, any>;
  let checked = 0;
  for (const key of Object.keys(items)) {
    const e = items[key];
    if (!e.base) continue; // cases have no base; their key is the bare name
    const rebuilt = variantMhn(e.base, {
      wear: e.wear ?? null,
      stattrak: Boolean(e.stattrak),
      souvenir: Boolean(e.souvenir),
      glove: e.kind === 'glove',
    });
    assert.equal(rebuilt, key, `variantMhn reproduces the snapshot key for ${key}`);
    checked++;
  }
  assert.ok(checked > 0, 'at least one variant entry was checked');
});

test('case cost: ensureCaseCosts prefers the exact snapshot entry', async () => {
  const { ensureCaseCosts } = await import('../data/sync.js');
  const db = handle.db;
  // a fresh case whose name is in the snapshot, no prices row at all
  db.prepare("INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', 'CS:GO Weapon Case', 'CS:GO Weapon Case', 'mil_spec')").run();
  const { lastInsertRowid } = db.prepare("INSERT INTO cases (item_id, name, market_hash_name, active) VALUES (last_insert_rowid(), 'CS:GO Weapon Case', 'CS:GO Weapon Case', 1)").run();
  const caseId = Number(lastInsertRowid);

  await handle.withDb(() => ensureCaseCosts());
  const row: any = db.prepare('SELECT cost_cents FROM cases WHERE id = ?').get(caseId);
  const hit = lookupFixedPrice('CS:GO Weapon Case')!;
  const expected = Math.max(1, Math.round(hit.priceCents * config.priceCostRatio));
  assert.equal(Number(row.cost_cents), expected, 'case cost comes from the exact snapshot entry');
});

test('admin meta: fixedPricesMeta exposes provenance', () => {
  const m = fixedPricesMeta();
  assert.ok(m.generatedAt, 'has generated_at');
  assert.equal(m.currency, 'EUR');
  assert.ok(m.totalItems > 0);
  assert.ok(m.pricedItems > 0, 'some entries are priced');
});
