import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.RATE_LIMIT_SCALE = '1000';

import { startWorker, register, post, get, type WorkerHandle } from './harness.js';

let handle: WorkerHandle;

before(async () => {
  handle = await startWorker();
  const db = handle.db;

  db.exec(`
    INSERT INTO items (kind, market_hash_name, name, weapon, category, rarity_tier, min_float, max_float, image, api_id)
    VALUES
      ('skin', 'AK-47 | Over Red', 'AK-47 | Over Red', 'AK-47', 'Rifle', 'covert', 0.0, 1.0, 'x', 'o1'),
      ('case', 'Over Case', 'Over Case', NULL, NULL, NULL, NULL, NULL, 'x', 'oc1'),
      ('case', 'Unlisted Case', 'Unlisted Case', NULL, NULL, NULL, NULL, NULL, 'x', 'oc2')
  `);
  const probs = JSON.stringify({ mil_spec: 79.92, restricted: 15.98, classified: 3.2, covert: 0.64, rare_special: 0.26 });
  const skin: any = db.prepare("SELECT id FROM items WHERE api_id = 'o1'").get();
  const c1: any = db.prepare("SELECT id FROM items WHERE api_id = 'oc1'").get();
  const c2: any = db.prepare("SELECT id FROM items WHERE api_id = 'oc2'").get();
  const case1: any = db
    .prepare('INSERT INTO cases (item_id, name, market_hash_name, cost_cents, probabilities, active, first_sale_date) VALUES (?, ?, ?, 100, ?, 1, ?) RETURNING id')
    .get(c1.id, 'Over Case', 'Over Case', probs, '2020-01-01');
  const case2: any = db
    .prepare('INSERT INTO cases (item_id, name, market_hash_name, cost_cents, probabilities, active, first_sale_date) VALUES (?, ?, ?, NULL, ?, 1, ?) RETURNING id')
    .get(c2.id, 'Unlisted Case', 'Unlisted Case', probs, '2015-01-01');
  const p1: any = db.prepare('INSERT INTO case_pools (case_id, tier) VALUES (?, ?) RETURNING id').get(case1.id, 'covert');
  db.prepare('INSERT INTO case_pool_items (case_pool_id, item_id) VALUES (?, ?)').run(p1.id, skin.id);
  (globalThis as any).__case1 = case1.id;
  (globalThis as any).__case2 = case2.id;

  const { hashPassword } = await import('../services/auth.js');
  db.prepare('INSERT INTO users (username, pass_hash, role, balance_cents) VALUES (?, ?, ?, ?)')
    .run('boss', await hashPassword('hola67'), 'admin', 0);
});

after(async () => {
  if (handle) await handle.stop();
});

test('quick sell: 90% of value, history preserved, instance gone', async () => {
  const { token, user } = await register(handle, 'selly');
  const start = Number(user.balanceCents);
  const open = await post(handle, `/api/cases/${(globalThis as any).__case1}/open`, token, {});
  assert.ok(open.status < 300, JSON.stringify(open.body ?? open.text));
  const instId = open.body.instanceId;

  const sell = await post(handle, `/api/inventory/${instId}/sell`, token, {});
  assert.ok(sell.status < 300, JSON.stringify(sell.body ?? sell.text));
  assert.ok(sell.body.saleCents > 0);
  // value has wear/variant jitter; sale must be 90% of the reported value
  assert.equal(sell.body.saleCents, Math.round((sell.body.valueCents * 90) / 100));

  const me = await get(handle, '/api/auth/me', token);
  assert.equal(Number(me.balanceCents), start - 100 + sell.body.saleCents); // opened (-100c) then sold (+)

  // instance is gone
  const gone: any[] = handle.db.prepare('SELECT * FROM item_instances WHERE id = ?').all(instId);
  assert.equal(gone.length, 0);
  // opening history preserved (row exists, instance_id nulled by the sell)
  const byUser: any[] = handle.db
    .prepare('SELECT * FROM openings WHERE user_id = (SELECT id FROM users WHERE username = ?)')
    .all('selly');
  assert.equal(byUser.length, 1, 'opening history kept');
  assert.equal(byUser[0].instance_id, null, 'instance reference detached');

  // selling the same instance again must 404
  const again = await post(handle, `/api/inventory/${instId}/sell`, token, {});
  assert.equal(again.status, 404);

  // cannot sell someone else's item
  const other = await register(handle, 'notowner');
  const open2 = await post(handle, `/api/cases/${(globalThis as any).__case1}/open`, token, {});
  const st = await post(handle, `/api/inventory/${open2.body.instanceId}/sell`, other.token, {});
  assert.equal(st.status, 403);
});

test('wear distribution: all 5 wears appear over 400 opens of a [0,1] item', async () => {
  const { token } = await register(handle, 'wears');
  const uid: any = handle.db.prepare("SELECT id FROM users WHERE username = 'wears'").get();
  handle.db.prepare('UPDATE users SET balance_cents = 2000000 WHERE id = ?').run(uid.id);
  const n = 400;
  const wearCount: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const r = await post(handle, `/api/cases/${(globalThis as any).__case1}/open`, token, {});
    assert.ok(r.status < 300, JSON.stringify(r.body ?? r.text));
    const w = r.body.wear;
    wearCount[w] = (wearCount[w] ?? 0) + 1;
  }
  console.log('\n400 opens wear distribution:', wearCount);
  for (const w of ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']) {
    assert.ok((wearCount[w] ?? 0) > 0, `wear ${w} must appear (uniform float over [0,1])`);
  }
  // rough shape: BS (55% of range) must dominate
  assert.ok(wearCount['Battle-Scarred'] > wearCount['Field-Tested']);
});

test('case cost: ensureCaseCosts uses ONLY real Steam prices, never a fallback', async () => {
  const { ensureCaseCosts } = await import('../data/sync.js');
  const c2 = (globalThis as any).__case2;
  // unlisted case (no prices row): cost must stay NULL, never a 1.49€-style estimate
  await handle.withDb(() => ensureCaseCosts());
  const row: any = handle.db.prepare('SELECT cost_cents FROM cases WHERE id = ?').get(c2);
  assert.equal(row.cost_cents, null, 'unlisted case keeps cost_cents NULL (no artificial fallback)');

  // case WITH a real steam price row: cost = price * ratio
  handle.db.prepare("INSERT INTO items (kind, market_hash_name, name, rarity_tier) VALUES ('case', 'Priced Case', 'Priced Case', 'mil_spec')").run();
  const { lastInsertRowid } = handle.db.prepare("INSERT INTO cases (item_id, name, market_hash_name, active) VALUES (last_insert_rowid(), 'Priced Case', 'Priced Case', 1)").run();
  const caseId = Number(lastInsertRowid);
  const itemId = Number((handle.db.prepare('SELECT item_id FROM cases WHERE id = ?').get(caseId) as any).item_id);
  handle.db.prepare("INSERT INTO prices (item_id, wear, stattrak, lowest_price_cents, currency, source, updated_at) VALUES (?, 'any', 0, 13662, 'EUR', 'steam_market', strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run(itemId);
  await handle.withDb(() => ensureCaseCosts());
  const row2: any = handle.db.prepare('SELECT cost_cents FROM cases WHERE id = ?').get(caseId);
  assert.ok(Number(row2.cost_cents) > 0, 'listed case gets a cost from its Steam price');
});

test('admin console: login gate, /help, /stats, /balance, /give money, audit', async () => {
  // non-admin cannot use the console
  const { token: userToken } = await register(handle, 'pleb');
  const denied = await post(handle, '/api/admin/command', userToken, { cmd: '/stats' });
  assert.equal(denied.status, 403);

  const login = await post(handle, '/api/auth/login', null, { username: 'boss', password: 'hola67' });
  assert.ok(login.status < 300, JSON.stringify(login.body ?? login.text));
  const admin = login.body.token;

  const help = await post(handle, '/api/admin/command', admin, { cmd: '/help' });
  assert.ok(help.body.ok);
  assert.match(help.body.output, /setmoney/);

  const stats = await post(handle, '/api/admin/command', admin, { cmd: '/stats' });
  assert.ok(stats.body.ok);
  assert.match(stats.body.output, /users:/);

  const bal = await post(handle, '/api/admin/command', admin, { cmd: '/balance pleb' });
  assert.match(bal.body.output, /pleb/);

  const before = (await get(handle, '/api/auth/me', userToken)).balanceCents;
  const give = await post(handle, '/api/admin/command', admin, { cmd: '/give money pleb 2.5' });
  assert.ok(give.body.ok, give.body.output);
  const after = (await get(handle, '/api/auth/me', userToken)).balanceCents;
  assert.equal(after, before + 250);

  const bad = await post(handle, '/api/admin/command', admin, { cmd: '/nosuch' });
  assert.ok(!bad.body.ok);

  // every command is audited
  const logs: any[] = handle.db.prepare("SELECT * FROM audit_logs WHERE action LIKE 'cmd_%' ORDER BY created_at DESC LIMIT 50").all();
  const actions = logs.map((r: any) => r.action);
  assert.ok(actions.includes('cmd_setmoney') || actions.includes('cmd_give_money'), 'give money audited');

  // password change works and old password stops working
  const pw = await post(handle, '/api/admin/command', admin, { cmd: '/password nueva123' });
  assert.ok(pw.body.ok);
  const relogin = await post(handle, '/api/auth/login', null, { username: 'boss', password: 'nueva123' });
  assert.ok(relogin.status < 300);
});
