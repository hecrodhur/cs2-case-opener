import pg from 'pg';

let pool: pg.Pool | null = null;

export function setPool(p: pg.Pool) {
  pool = p;
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error('DB pool not initialised');
  return pool;
}

export async function query<T extends pg.QueryResultRow = any>(text: string, params: any[] = []): Promise<T[]> {
  const r = await getPool().query<T>(text, params);
  return r.rows;
}

export async function one<T extends pg.QueryResultRow = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function run(text: string, params: any[] = []): Promise<void> {
  await getPool().query(text, params);
}

/** Runs `fn` inside a DB transaction, returning its result. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function migrate(pool: pg.Pool, dir: string): Promise<string[]> {
  const { readdir, readFile, mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  await mkdir(join(dir, 'migrations'), { recursive: true });
  await pool.query('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const files = (await readdir(join(dir, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await pool.query('SELECT name FROM _migrations')).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(join(dir, 'migrations', f), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      applied.push(f);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  return applied;
}
