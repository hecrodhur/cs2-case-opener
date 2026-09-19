// Seeds the local D1 database with the real CSGO-API catalog (items, cases,
// pools). Run after `wrangler dev` has created the local D1 file, or point
// MIGRATE_DB at any sqlite file:
//   npm run sync
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runWithDb } from '../db.js';
import { loadCsgoApiData } from '../data/api.js';
import { syncCatalog, ensureCaseCosts } from '../data/sync.js';
import { seedAdmin } from '../services/auth.js';
import { D1Shim, applyMigrations } from '../test/d1shim.js';
import { findLocalD1File } from './migrate.js';

let dbPath = process.env.MIGRATE_DB ?? (await findLocalD1File());
if (!dbPath) {
  dbPath = join(process.cwd(), '.wrangler/state/v3/d1/miniflare3-d1/cs2-case-opener');
  mkdirSync(dirname(dbPath), { recursive: true });
}
const db = new DatabaseSync(dbPath);
await applyMigrations(db);
console.log('using', dbPath);

const data = await loadCsgoApiData(process.env.CSGO_API_BASE ?? 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en');
console.log(`loaded ${data.skins.length} skins, ${data.crates.length} crates from source`);

const shim = new D1Shim(db);
const r = await runWithDb(shim, async () => {
  await seedAdmin();
  const res = await syncCatalog(data);
  const costs = await ensureCaseCosts();
  return { ...res, caseCostsFilled: costs };
});
console.log('sync result:', JSON.stringify({ ...r, warnings: r.warnings.slice(0, 20) }, null, 2));
if (r.warnings.length > 20) console.log(`...and ${r.warnings.length - 20} more warnings`);
db.close();
