// Applies the SQL migrations to the local D1 sqlite file (wrangler dev state).
// Usage:
//   npm run db:init                      -> migrates the wrangler dev D1 file
//   MIGRATE_DB=/path/file.db npm run db:init
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'db', 'migrations');

/** Find the local D1 sqlite file wrangler created (newest non-metadata .sqlite). */
export async function findLocalD1File(): Promise<string | null> {
  const root = join(process.cwd(), '.wrangler/state/v3/d1');
  const found: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    const entries = await readdir(dir).catch(() => []);
    for (const e of entries) {
      const p = join(dir, e);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(p);
      else if (e.endsWith('.sqlite') && e !== 'metadata.sqlite') found.push(p);
    }
  }
  if (!found.length) return null;
  found.sort();
  return found[found.length - 1];
}

let dbPath = process.env.MIGRATE_DB ?? (await findLocalD1File());
if (!dbPath) {
  // no wrangler state yet: create a file where wrangler v3 looked
  dbPath = join(process.cwd(), '.wrangler/state/v3/d1/miniflare3-d1/cs2-case-opener');
  mkdirSync(dirname(dbPath), { recursive: true });
  console.log('no local D1 file found; created', dbPath);
}
const db = new DatabaseSync(dbPath);
console.log('migrating', dbPath);

db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
const seen = new Set(db.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name));

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
let applied = 0;
for (const f of files) {
  if (seen.has(f)) continue;
  const sql = (await readFile(join(MIGRATIONS_DIR, f), 'utf8')).replace(/--.*$/gm, '');
  db.exec('BEGIN');
  try {
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(f, new Date().toISOString());
    db.exec('COMMIT');
    applied++;
    console.log('applied', f);
  } catch (e) {
    db.exec('ROLLBACK');
    throw new Error(`migration ${f} failed: ${(e as Error).message}`);
  }
}
console.log(applied ? `applied ${applied} migration(s)` : 'up to date');
