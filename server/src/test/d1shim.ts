/**
 * D1-compatible shim over node:sqlite so the same worker code that runs on
 * Cloudflare D1 can be exercised in unit tests without Miniflare.
 * Implements the subset of the D1 binding API used in db.ts:
 *   prepare(sql).bind(...).all() | .run() | .first()
 *   transaction(mode) -> { prepare, commit, rollback }
 */
import { DatabaseSync } from 'node:sqlite';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

function makeBinder(db: DatabaseSync) {
  return (sql: string) => {
    const stmt = db.prepare(sql);
    return {
      bind(...params: any[]) {
        const p = params.map((v) => (v === undefined ? null : v));
        return {
          all: async () => ({ results: stmt.all(...p) as any[] }),
          run: async () => {
            const r = stmt.run(...p);
            return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
          },
          first: async () => stmt.get(...p) ?? null,
        };
      },
    };
  };
}

export class D1Shim {
  constructor(private db: DatabaseSync) {}

  prepare(sql: string) {
    return makeBinder(this.db)(sql);
  }

  async transaction(_mode?: string) {
    this.db.exec('BEGIN IMMEDIATE');
    const bind = makeBinder(this.db);
    return {
      prepare: bind,
      commit: async () => this.db.exec('COMMIT'),
      rollback: async () => this.db.exec('ROLLBACK'),
    };
  }
}

/** Apply every migration file in order, tracked in a _migrations table. */
export async function applyMigrations(db: DatabaseSync): Promise<string[]> {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT)');
  const seen = new Set((db.prepare('SELECT name FROM _migrations').all() as any[]).map((r) => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (seen.has(f)) continue;
    const sql = (await readFile(join(MIGRATIONS_DIR, f), 'utf8')).replace(/--.*$/gm, '');
    db.exec('BEGIN');
    try {
      db.exec(sql);
db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(f, new Date().toISOString());
      db.exec('COMMIT');
      applied.push(f);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
  }
  return applied;
}
