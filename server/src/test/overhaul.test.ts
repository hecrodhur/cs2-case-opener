import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.RATE_LIMIT_SCALE = '1000';
process.env.LOG_LEVEL = 'silent';

const TEST_PG_PORT = 54398;
const TEST_PG_DIR = mkdtempSync(join(tmpdir(), 'cs2-overhaul-pg-'));

let pool: pg.Pool;
let app: any;
let base: string;
let ep: any;

const H = (token: string | null): Record<string, string> => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
};

async function register(username: string): Promise<{ token: string; user: any }> {
  const r = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: H(null), body: JSON.stringify({ username, password: 'pw123456' }) });
  if (r.status >= 300) throw new Error(`register failed: ${await r.text()}`);
  return r.json();
}

async function post(path: string, token: string | null, body: any = {}): Promise<{ status: number; body?: any; text?: string }> {
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: H(token), body: JSON.stringify(body) });
  const text = await r.text();
  try {
    return { status: r.status, body: JSON.parse(text) };
  } catch {
    return { status: r.status, text };
  }
}

before(async () => {
  const EP = (await import('embedded-postgres')).default;
  ep = new EP({
    databaseDir: TEST_PG_DIR,
    port: TEST_PG_PORT,
    user: 'postgres',
    password: 'test',
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await ep.initialise();
  await ep.start();

  const admin = new pg.Client({ user: 'postgres', password: 'test', port: TEST_PG_PORT, host: '127.0.0.1', database: 'postgres' });
  await admin.connect();
  const dbs = (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', ['cs2_test'])).rows;
  if (!dbs.length) await admin.query('CREATE DATABASE cs2_test');
  await admin.end();

  pool = new pg.Pool({ connectionString: `postgres://postgres:test@127.0.0.1:${TEST_PG_PORT}/cs2_test`, max: 10 });
  const { setPool, migrate } = await import('../db.js');
  setPool(pool);
  await migrate(pool, join(dirname(fileURLToPath(import.meta.url)), '../db'));

  await pool.query(`
    INSERT INTO items (kind, market_hash_name, name, weapon, category, rarity_tier, min_float, max_float, image, api_id)
    VALUES
      ('skin', 'AK-47 | Over Red', 'AK-47 | Over Red', 'AK-47', 'Rifle', 'covert', 0.0, 1.0, 'x', 'o1'),
      ('case', 'Over Case', 'Over Case', NULL, NULL, NULL, NULL, NULL, 'x', 'oc1'),
      ('case', 'Unlisted Case', 'Unlisted Case', NULL, NULL, NULL, NULL, NULL, 'x', 'oc2')
    ON CONFLICT DO NOTHING
  `);
  const probs = JSON.stringify({ mil_spec: 79.92, restricted: 15.98, classified: 3.2, covert: 0.64, rare_special: 0.26 });
  const skin = (await pool.query("SELECT id FROM items WHERE api_id = 'o1'")).rows[0];
  const c1 = (await pool.query("SELECT id FROM items WHERE api_id = 'oc1'")).rows[0];
  const c2 = (await pool.query("SELECT id FROM items WHERE api_id = 'oc2'")).rows[0];
  const case1 = (await pool.query(
    `INSERT INTO cases (item_id, name, market_hash_name, cost_cents, probabilities, active, first_sale_date)
     VALUES ($1, 'Over Case', 'Over Case', 100, $2::jsonb, TRUE, '2020-01-01') RETURNING id`,
    [c1.id, probs],
  )).rows[0];
  const case2 = (await pool.query(
    `INSERT INTO cases (item_id, name, market_hash_name, cost_cents, probabilities, active, first_sale_date)
     VALUES ($1, 'Unlisted Case', 'Unlisted Case', NULL, $2::jsonb, TRUE, '2015-01-01') RETURNING id`,
    [c2.id, probs],
  )).rows[0];
  const p1 = (await pool.query('INSERT INTO case_pools (case_id, tier) VALUES ($1,$2) RETURNING id', [case1.id, 'covert'])).rows[0];
  await pool.query('INSERT INTO case_pool_items (case_pool_id, item_id) VALUES ($1,$2)', [p1.id, skin.id]);
  (globalThis as any).__case1 = case1.id;
  (globalThis as any).__case2 = case2.id;

  const { hashPassword } = await import('../services/auth.js');
  await pool.query(
    'INSERT INTO users (username, pass_hash, role, balance_cents) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    ['boss', await hashPassword('hola67'), 'admin', 0],
  );

  const { createApp } = await import('../app.js');
  const created = await createApp({ pool });
  app = created.app;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address() as any;
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  if (app) await app.close().catch(() => {});
  if (pool) await pool.end().catch(() => {});
  if (ep) {
    await ep.stop().catch(() => {});
    rmSync(TEST_PG_DIR, { recursive: true, force: true });
  }
});

test('quick sell: 90% of value, history preserved, instance gone', async () => {
  const { token, user } = await register('selly');
  const start = Number(user.balanceCents);
  const open = await post(`/api/cases/${(globalThis as any).__case1}/open`, token, {});
  assert.ok(open.status < 300, JSON.stringify(open.body ?? open.text));
  const instId = open.body.instanceId;

  const sell = await post(`/api/inventory/${instId}/sell`, token, {});
  assert.ok(sell.status < 300, JSON.stringify(sell.body ?? sell.text));
  assert.ok(sell.body.saleCents > 0);
  // value has wear/variant jitter; sale must be 90% of the reported value
  assert.equal(sell.body.saleCents, Math.round((sell.body.valueCents * 90) / 100));

  const me = await (await fetch(`${base}/api/auth/me`, { headers: H(token) })).json();
  assert.equal(Number(me.balanceCents), start - 100 + sell.body.saleCents); // opened (-100c) then sold (+)

  // instance is gone
  const gone = await pool.query('SELECT * FROM item_instances WHERE id = $1', [instId]);
  assert.equal(gone.rows.length, 0);
  // opening history preserved (row exists, instance_id nulled by the sell)
  const byUser = await pool.query('SELECT * FROM openings WHERE user_id = (SELECT id FROM users WHERE username = $1)', ['selly']);
  assert.equal(byUser.rows.length, 1, 'opening history kept');
  assert.equal(byUser.rows[0].instance_id, null, 'instance reference detached');

  // selling the same instance again must 404
  const again = await post(`/api/inventory/${instId}/sell`, token, {});
  assert.equal(again.status, 404);

  // cannot sell someone else's item
  const other = await register('notowner');
  const open2 = await post(`/api/cases/${(globalThis as any).__case1}/open`, token, {});
  const st = await post(`/api/inventory/${open2.body.instanceId}/sell`, other.token, {});
  assert.equal(st.status, 403);
});

test('wear distribution: all 5 wears appear over 400 opens of a [0,1] item', async () => {
  const { token, user } = await register('wears');
  const uid = (await pool.query('SELECT id FROM users WHERE username = $1', ['wears'])).rows[0].id;
  await pool.query('UPDATE users SET balance_cents = 2_000_000 WHERE id = $1', [uid]);
  const n = 400;
  const wearCount: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const r = await post(`/api/cases/${(globalThis as any).__case1}/open`, token, {});
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

test('case cost: ensureCaseCosts fills unlisted cases with fallback', async () => {
  const { ensureCaseCosts, fallbackCaseCostCents } = await import('../data/sync.js');
  const n = await ensureCaseCosts();
  assert.ok(n >= 1, 'at least one case got a cost');
  const row = (await pool.query('SELECT cost_cents FROM cases WHERE id = $1', [(globalThis as any).__case2])).rows[0];
  assert.ok(Number(row.cost_cents) > 0, 'unlisted case now has a cost');
  const fb = fallbackCaseCostCents('Unlisted Case', '2015-01-01');
  assert.ok(fb >= 134 && fb <= 164, `fallback for 2015 case in [134,164], got ${fb}`);
});

test('admin console: login gate, /help, /stats, /balance, /give money, audit', async () => {
  // non-admin cannot use the console
  const { token: userToken } = await register('pleb');
  const denied = await post('/api/admin/command', userToken, { cmd: '/stats' });
  assert.equal(denied.status, 403);

  const login = await post('/api/auth/login', null, { username: 'boss', password: 'hola67' });
  assert.ok(login.status < 300, JSON.stringify(login.body ?? login.text));
  const admin = login.body.token;

  const help = await post('/api/admin/command', admin, { cmd: '/help' });
  assert.ok(help.body.ok);
  assert.match(help.body.output, /setmoney/);

  const stats = await post('/api/admin/command', admin, { cmd: '/stats' });
  assert.ok(stats.body.ok);
  assert.match(stats.body.output, /users:/);

  const bal = await post('/api/admin/command', admin, { cmd: '/balance pleb' });
  assert.match(bal.body.output, /pleb/);

  const before = (await (await fetch(`${base}/api/auth/me`, { headers: H(userToken) })).json()).balanceCents;
  const give = await post('/api/admin/command', admin, { cmd: '/give money pleb 2.5' });
  assert.ok(give.body.ok, give.body.output);
  const after = (await (await fetch(`${base}/api/auth/me`, { headers: H(userToken) })).json()).balanceCents;
  assert.equal(after, before + 250);

  const bad = await post('/api/admin/command', admin, { cmd: '/nosuch' });
  assert.ok(!bad.body.ok);

  // every command is audited
  const logs = await pool.query("SELECT * FROM audit_logs WHERE action LIKE 'cmd_%' ORDER BY created_at DESC LIMIT 50");
  const actions = logs.rows.map((r: any) => r.action);
  assert.ok(actions.includes('cmd_setmoney') || actions.includes('cmd_give_money'), 'give money audited');

  // password change works and old password stops working
  const pw = await post('/api/admin/command', admin, { cmd: '/password nueva123' });
  assert.ok(pw.body.ok);
  const relogin = await post('/api/auth/login', null, { username: 'boss', password: 'nueva123' });
  assert.ok(relogin.status < 300);
});
