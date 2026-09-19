/**
 * D1 access layer with a Postgres-compatible surface.
 *
 * The services were written against node-postgres: they call query/one/run/tx
 * with $1..$n placeholders. D1 (SQLite) speaks almost the same dialect, so
 * this layer converts the leftover Postgres-isms before binding:
 *   $n::jsonb / ::int / ::bigint      -> plain placeholder, cast dropped
 *   $n::bigint[] / $n::text[]         -> JSON text
 *   ANY($n::bigint[])                 -> IN (?, ?, ...)
 *   ILIKE                             -> LIKE (SQLite LIKE is ASCII-case-insensitive)
 *   now()                             -> strftime('%Y-%m-%dT%H:%M:%fZ','now')
 *   FOR UPDATE                        -> dropped (D1 transactions are serializable)
 *   GREATEST(a, b)                    -> MAX(a, b)
 *
 * The active database is kept in an AsyncLocalStorage so concurrent requests
 * on the same isolate never share a connection. Both the worker and the
 * Durable Object entry points wrap their handlers in runWithDb().
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface D1Statement {
  bind(...params: any[]): {
    all(): Promise<{ results: any[] }>;
    run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
    first(): Promise<any>;
  };
}

export interface D1Transaction {
  prepare(sql: string): D1Statement;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface TxStore {
  prepare(sql: string): D1Statement;
}

export interface D1Like {
  prepare(sql: string): D1Statement;
  transaction(mode?: string): Promise<D1Transaction>;
}

const als = new AsyncLocalStorage<D1Like>();

export function runWithDb<T>(db: D1Like, fn: () => Promise<T>): Promise<T> {
  return als.run(db, fn);
}

export function getDb(): D1Like {
  const db = als.getStore();
  if (!db) throw new Error('no active D1 database (missing runWithDb wrapper?)');
  return db;
}

function norm(v: any): any {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && v !== null && !(v instanceof Uint8Array)) return JSON.stringify(v);
  return v;
}

/** Convert a Postgres-flavored statement into SQLite + positional params. */
export function adaptSql(sql: string, raw: any[]): { text: string; params: any[] } {
  const inLists = new Map<number, any[]>();
  const jsons = new Map<number, any>();
  let s = sql;
  // x = ANY($n::bigint[]) -> x IN (?,?,...); sentinel expanded later to keep param order stable
  s = s.replace(/\s*=\s*ANY\(\s*\$(\d+)(?:::\w+\[\])?\s*\)/g, (_m, n) => {
    inLists.set(+n, Array.isArray(raw[+n - 1]) ? raw[+n - 1] : [raw[+n - 1]]);
    return ` IN @@IN${n}@@`;
  });
  // array columns are stored as JSON text
  s = s.replace(/\$(\d+)(?:::\w+)?\[\]/g, (_m, n) => {
    jsons.set(+n, raw[+n - 1]);
    return `@@JSON${n}@@`;
  });
  s = s.replace(/::(jsonb|int|integer|bigint|text)\b/gi, '');
  s = s.replace(/\bILIKE\b/gi, 'LIKE');
  s = s.replace(/\bnow\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  s = s.replace(/\bGREATEST\(/gi, 'MAX(');
  s = s.replace(/\s+FOR UPDATE\b/gi, '');
  // single pass: $n placeholders become positional, in order of appearance
  const params: any[] = [];
  const re = /@@IN(\d+)@@|@@JSON(\d+)@@|\$(\d+)/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    out += s.slice(last, m.index);
    if (m[1] != null) {
      const list = inLists.get(+m[1]) ?? [];
      for (const v of list) params.push(norm(v));
      out += list.length ? `(${list.map(() => '?').join(',')})` : '(NULL)';
    } else if (m[2] != null) {
      const v = jsons.get(+m[2]);
      params.push(typeof v === 'string' ? v : JSON.stringify(v === undefined ? null : v));
      out += '?';
    } else {
      params.push(norm(raw[+m[3] - 1]));
      out += '?';
    }
    last = m.index + m[0].length;
  }
  out += s.slice(last);
  return { text: out, params };
}

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const a = adaptSql(text, params);
  const res = await getDb().prepare(a.text).bind(...a.params).all();
  return res.results as T[];
}

export async function one<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function run(text: string, params: any[] = []): Promise<number> {
  const a = adaptSql(text, params);
  const res = await getDb().prepare(a.text).bind(...a.params).run();
  return Number(res.meta?.changes ?? 0);
}

/** INSERT and return the new rowid (D1 has no reliable INSERT...RETURNING). */
export async function insert(text: string, params: any[] = []): Promise<number> {
  const a = adaptSql(text, params);
  const res = await getDb().prepare(a.text).bind(...a.params).run();
  return Number(res.meta.last_row_id ?? 0);
}

/** pg-compatible client handed to tx() callbacks (services use client.query(...).rows). */
export class PgClient {
  constructor(private store: { prepare(sql: string): D1Statement }) {}
  async query(text: string, params: any[] = []): Promise<{ rows: any[] }> {
    const a = adaptSql(text, params);
    const res = await this.store.prepare(a.text).bind(...a.params).all();
    return { rows: res.results };
  }
  /** INSERT and return the new rowid. */
  async insert(text: string, params: any[] = []): Promise<number> {
    const a = adaptSql(text, params);
    const res = await this.store.prepare(a.text).bind(...a.params).run();
    return Number(res.meta.last_row_id ?? 0);
  }
  /** Run a write statement and return the number of changed rows. */
  async update(text: string, params: any[] = []): Promise<number> {
    const a = adaptSql(text, params);
    const res = await this.store.prepare(a.text).bind(...a.params).run();
    return Number(res.meta.changes ?? 0);
  }
  async release(): Promise<void> {}
}

export async function tx<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const db = getDb() as any;
  if (typeof db.transaction === 'function') {
    const txn = await db.transaction('BEGIN IMMEDIATE');
    try {
      const r = await fn(new PgClient(txn));
      await txn.commit();
      return r;
    } catch (e) {
      await txn.rollback().catch(() => {});
      throw e;
    }
  }
  // D1 client without transaction() support: run statements sequentially.
  // Balance checks use conditional UPDATEs so funds stay safe without a tx.
  return fn(new PgClient(db));
}

/** JSONB columns are TEXT in SQLite; parse them when they come back as strings. */
export function js<T>(v: any): T {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return v as any;
    }
  }
  return (v ?? null) as T;
}
