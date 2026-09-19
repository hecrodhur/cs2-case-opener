import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.RATE_LIMIT_SCALE = '1000';

import { startWorker, register, post, get, type WorkerHandle } from './harness.js';

let handle: WorkerHandle;

before(async () => {
  handle = await startWorker();
  const db = handle.db;

  // minimal synthetic catalog: 3 skins (one per tier) + 1 case
  db.exec(`
    INSERT INTO items (kind, market_hash_name, name, weapon, category, rarity_tier, min_float, max_float, image, api_id)
    VALUES
      ('skin', 'AK-47 | Test Red', 'AK-47 | Test Red', 'AK-47', 'Rifle', 'covert', 0.0, 1.0, 'x', 'a1'),
      ('skin', 'M4A4 | Test Blue', 'M4A4 | Test Blue', 'M4A4', 'Rifle', 'classified', 0.0, 1.0, 'x', 'a2'),
      ('skin', 'USP | Test Green', 'USP | Test Green', 'USP-S', 'Pistol', 'restricted', 0.0, 1.0, 'x', 'a3'),
      ('case', 'Test Case', 'Test Case', NULL, NULL, NULL, NULL, NULL, 'x', 'c1')
  `);
  const itemRows: any[] = db.prepare("SELECT id, rarity_tier FROM items WHERE api_id IN ('a1','a2','a3')").all();
  const caseItem: any = db.prepare("SELECT id FROM items WHERE api_id = 'c1'").get();
  const probs = JSON.stringify({ mil_spec: 79.92, restricted: 15.98, classified: 3.2, covert: 0.64, rare_special: 0.26 });
  const caseRow: any = db
    .prepare('INSERT INTO cases (item_id, name, market_hash_name, cost_cents, probabilities, active) VALUES (?, ?, ?, 1, ?, 1) RETURNING id')
    .get(caseItem.id, 'Test Case', 'Test Case', probs);
  const caseId: number = caseRow.id;
  for (const it of itemRows) {
    const p: any = db.prepare('INSERT INTO case_pools (case_id, tier) VALUES (?, ?) RETURNING id').get(caseId, it.rarity_tier);
    db.prepare('INSERT INTO case_pool_items (case_pool_id, item_id) VALUES (?, ?)').run(p.id, it.id);
  }
  (globalThis as any).__testCaseId = caseId;
});

after(async () => {
  if (handle) await handle.stop();
});

test('auth: register, login, bad password', async () => {
  const { token, user } = await register(handle, 'alice');
  assert.ok(token);
  assert.ok(user.balanceCents > 0);

  const bad = await post(handle, '/api/auth/login', null, { username: 'alice', password: 'wrong' });
  assert.equal(bad.status, 401);

  const me = await get(handle, '/api/auth/me', token);
  assert.equal(me.username, 'alice');
});

test('catalog: case lists with contents', async () => {
  const list = await get(handle, '/api/cases');
  const c = list.items.find((x: any) => x.id === (globalThis as any).__testCaseId);
  assert.ok(c, 'case in list');
  assert.equal(Number(c.item_count), 3);

  const detail = await get(handle, `/api/cases/${(globalThis as any).__testCaseId}`);
  assert.ok(Array.isArray(detail.contents));
  const total = detail.contents.reduce((a: number, t: any) => a + t.items.length, 0);
  assert.equal(total, 3);
});

test('opening: atomic, distribution over 3000 opens, invariants', async () => {
  const { token, user } = await register(handle, 'bob');
  const startBalance = user.balanceCents;
  const cost = 1;
  const n = 3000;
  const obs: Record<string, number> = {};
  let last: any;
  for (let i = 0; i < n; i++) {
    const r = await post(handle, `/api/cases/${(globalThis as any).__testCaseId}/open`, token, {});
    if (r.status >= 300) throw new Error(`open failed: ${JSON.stringify(r.body ?? r.text)}`);
    last = r.body;
    obs[last.rarityTier] = (obs[last.rarityTier] ?? 0) + 1;
  }
  console.log('\n3000 opens distribution:', obs);

  // synthetic case has no mil_spec / rare_special items; those weights renormalize
  const tot = 15.98 + 3.2 + 0.64;
  const exp: Record<string, number> = {
    restricted: (15.98 / tot) * n,
    classified: (3.2 / tot) * n,
    covert: (0.64 / tot) * n,
  };
  for (const [k, e] of Object.entries(exp)) {
    const o = obs[k] ?? 0;
    const tol = Math.max(10, 4 * Math.sqrt(e));
    assert.ok(Math.abs(o - e) < tol, `${k}: ${o} vs expected ${e.toFixed(1)} (tol ${tol})`);
  }

  assert.ok(last.instanceId > 0);
  assert.ok(last.floatValue >= 0 && last.floatValue <= 1);
  assert.ok(typeof last.seed === 'string' && last.seed.length === 32);

  // balance invariant: exactly n*cost deducted
  const me = await get(handle, '/api/auth/me', token);
  assert.equal(me.balanceCents, startBalance - n * cost);

  // inventory matches
  const inv = await get(handle, '/api/inventory?limit=200', token);
  assert.equal(inv.total, n);
});

test('opening: insufficient balance is rejected without side effects', async () => {
  const reg = await register(handle, 'penny');
  // give penny exactly 250c so the run is deterministic and fast
  const row: any = handle.db.prepare("SELECT id FROM users WHERE username = 'penny'").get();
  handle.db.prepare('UPDATE users SET balance_cents = 250 WHERE id = ?').run(row.id);
  let lastStatus = 0;
  for (let i = 0; i < 300; i++) {
    const r = await post(handle, `/api/cases/${(globalThis as any).__testCaseId}/open`, reg.token, {});
    lastStatus = r.status;
    if (r.status === 400) break;
  }
  assert.equal(lastStatus, 400);
  const me = await get(handle, '/api/auth/me', reg.token);
  assert.equal(me.balanceCents, 0);
  // no partial write: openings count matches balance spent (cost = 1c)
  const hist = await get(handle, '/api/history', reg.token);
  assert.equal(hist.total, 250);
});

test('market: list, buy, fee, ownership transfer', async () => {
  const a = await register(handle, 'seller');
  const b = await register(handle, 'buyer');
  const open = await post(handle, `/api/cases/${(globalThis as any).__testCaseId}/open`, a.token, {});
  const price = 500;
  const listed = await post(handle, '/api/market/list', a.token, { instanceId: open.body.instanceId, priceCents: price });
  assert.ok(listed.status < 300, JSON.stringify(listed.body ?? listed.text));

  const beforeA = await get(handle, '/api/auth/me', a.token);
  const buy = await post(handle, `/api/market/${listed.body.id}/buy`, b.token, {});
  assert.ok(buy.status < 300, JSON.stringify(buy.body ?? buy.text));
  const buyBody = buy.body;
  assert.equal(buyBody.fee, Math.round(price * 0.05));

  const afterA = await get(handle, '/api/auth/me', a.token);
  const afterB = await get(handle, '/api/auth/me', b.token);
  assert.equal(Number(afterA.balanceCents), Number(beforeA.balanceCents) + price - buyBody.fee);
  assert.equal(Number(afterB.balanceCents), Number(b.user.balanceCents) - price);
  const invB = await get(handle, '/api/inventory?limit=5', b.token);
  assert.equal(invB.total, 1);
});

test('leaderboard and profile', async () => {
  const lb = await get(handle, '/api/leaderboard');
  assert.ok(lb.items.length >= 1);
  const t = await register(handle, 'solo');
  const prof = await get(handle, '/api/profile', t.token);
  assert.equal(prof.username, 'solo');
  assert.ok(prof.stats);
});

test('realtime endpoint proxies to the Durable Object', async () => {
  const t = await register(handle, 'sse');
  const res = await handle.fetch(new Request(`http://localhost/api/realtime?token=${t.token}`));
  assert.equal(res.status, 200); // the DO stub answers the upgrade in tests
});
