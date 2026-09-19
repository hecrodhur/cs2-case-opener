import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.RATE_LIMIT_SCALE = '1000';
process.env.LOG_LEVEL = 'silent';

const TEST_PG_PORT = 54399;
const TEST_PG_DIR = mkdtempSync(join(tmpdir(), 'cs2-test-pg-'));

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

async function get(path: string, token?: string): Promise<any> {
  const r = await fetch(`${base}${path}`, { headers: H(token ?? null) });
  return r.json();
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

  // minimal synthetic catalog: 3 skins (one per tier) + 1 case
  await pool.query(`
    INSERT INTO items (kind, market_hash_name, name, weapon, category, rarity_tier, min_float, max_float, image, api_id)
    VALUES
      ('skin', 'AK-47 | Test Red', 'AK-47 | Test Red', 'AK-47', 'Rifle', 'covert', 0.0, 1.0, 'x', 'a1'),
      ('skin', 'M4A4 | Test Blue', 'M4A4 | Test Blue', 'M4A4', 'Rifle', 'classified', 0.0, 1.0, 'x', 'a2'),
      ('skin', 'USP | Test Green', 'USP | Test Green', 'USP-S', 'Pistol', 'restricted', 0.0, 1.0, 'x', 'a3'),
      ('case', 'Test Case', 'Test Case', NULL, NULL, NULL, NULL, NULL, 'x', 'c1')
    ON CONFLICT DO NOTHING
  `);
  const itemRows = (await pool.query("SELECT id, rarity_tier FROM items WHERE api_id IN ('a1','a2','a3')")).rows;
  const caseItem = (await pool.query("SELECT id FROM items WHERE api_id = 'c1'")).rows[0];
  const probs = JSON.stringify({ mil_spec: 79.92, restricted: 15.98, classified: 3.2, covert: 0.64, rare_special: 0.26 });
  const caseRow = (await pool.query(
    `INSERT INTO cases (item_id, name, market_hash_name, cost_cents, probabilities, active)
     VALUES ($1, 'Test Case', 'Test Case', 1, $2::jsonb, TRUE) RETURNING id`,
    [caseItem.id, probs],
  )).rows[0];
  const caseId: number = caseRow.id;
  for (const it of itemRows) {
    const p = (await pool.query('INSERT INTO case_pools (case_id, tier) VALUES ($1,$2) RETURNING id', [caseId, it.rarity_tier])).rows[0];
    await pool.query('INSERT INTO case_pool_items (case_pool_id, item_id) VALUES ($1,$2)', [p.id, it.id]);
  }
  (globalThis as any).__testCaseId = caseId;

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

test('auth: register, login, bad password', async () => {
  const { token, user } = await register('alice');
  assert.ok(token);
  assert.ok(user.balanceCents > 0);

  const bad = await post('/api/auth/login', null, { username: 'alice', password: 'wrong' });
  assert.equal(bad.status, 401);

  const me = await get('/api/auth/me', token);
  assert.equal(me.username, 'alice');
});

test('catalog: case lists with contents', async () => {
  const list = await get('/api/cases');
  const c = list.items.find((x: any) => x.id === (globalThis as any).__testCaseId);
  assert.ok(c, 'case in list');
  assert.equal(Number(c.item_count), 3);

  const detail = await get(`/api/cases/${(globalThis as any).__testCaseId}`);
  assert.ok(Array.isArray(detail.contents));
  const total = detail.contents.reduce((a: number, t: any) => a + t.items.length, 0);
  assert.equal(total, 3);
});

test('opening: atomic, distribution over 3000 opens, invariants', async () => {
  const { token, user } = await register('bob');
  const startBalance = user.balanceCents;
  const cost = 1;
  const n = 3000;
  const obs: Record<string, number> = {};
  let last: any;
  for (let i = 0; i < n; i++) {
    const r = await post(`/api/cases/${(globalThis as any).__testCaseId}/open`, token, {});
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
  const me = await get('/api/auth/me', token);
  assert.equal(me.balanceCents, startBalance - n * cost);

  // inventory matches
  const inv = await get('/api/inventory?limit=200', token);
  assert.equal(inv.total, n);
});

test('opening: insufficient balance is rejected without side effects', async () => {
  const reg = await register('penny');
  // give penny exactly 250c so the run is deterministic and fast
  const row = await pool.query('SELECT id FROM users WHERE username = $1', ['penny']);
  await pool.query('UPDATE users SET balance_cents = 250 WHERE id = $1', [row.rows[0].id]);
  let lastStatus = 0;
  for (let i = 0; i < 300; i++) {
    const r = await post(`/api/cases/${(globalThis as any).__testCaseId}/open`, reg.token, {});
    lastStatus = r.status;
    if (r.status === 400) break;
  }
  assert.equal(lastStatus, 400);
  const me = await get('/api/auth/me', reg.token);
  assert.equal(me.balanceCents, 0);
  // no partial write: openings count matches balance spent (cost = 1c)
  const hist = await get('/api/history', reg.token);
  assert.equal(hist.total, 250);
});

test('market: list, buy, fee, ownership transfer', async () => {
  const a = await register('seller');
  const b = await register('buyer');
  const open = await post(`/api/cases/${(globalThis as any).__testCaseId}/open`, a.token, {});
  const price = 500;
  const listed = await post('/api/market/list', a.token, { instanceId: open.body.instanceId, priceCents: price });
  assert.ok(listed.status < 300, JSON.stringify(listed.body ?? listed.text));

  const before = await get('/api/auth/me', a.token);
  const buy = await post(`/api/market/${listed.body.id}/buy`, b.token, {});
  assert.ok(buy.status < 300, JSON.stringify(buy.body ?? buy.text));
  const buyBody = buy.body;
  assert.equal(buyBody.fee, Math.round(price * 0.05));

  const afterA = await get('/api/auth/me', a.token);
  const afterB = await get('/api/auth/me', b.token);
  assert.equal(Number(afterA.balanceCents), Number(before.balanceCents) + price - buyBody.fee);
  assert.equal(Number(afterB.balanceCents), Number(b.user.balanceCents) - price);
  const invB = await get('/api/inventory?limit=5', b.token);
  assert.equal(invB.total, 1);
});

test('leaderboard and profile', async () => {
  const lb = await get('/api/leaderboard');
  assert.ok(lb.items.length >= 1);
  const t = await register('solo');
  const prof = await get('/api/profile', t.token);
  assert.equal(prof.username, 'solo');
  assert.ok(prof.stats);
});

test('SSE endpoint streams', async () => {
  const t = await register('sse');
  const res = await fetch(`${base}/api/realtime?token=${t.token}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  assert.ok(value && Buffer.from(value).toString().includes('retry'));
});
