import pg from 'pg';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { setPool, migrate, one } from '../db.js';
import { loadCsgoApiData } from '../data/api.js';
import { syncCatalog } from '../data/sync.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl ?? `postgres://postgres:cs2case@localhost:${config.pgPort}/cs2`, max: 10 });
setPool(pool);
await migrate(pool, join(dirname(fileURLToPath(import.meta.url)), 'db'));

const data = await loadCsgoApiData(config.csgoApiBase);
console.log(`loaded ${data.skins.length} skins, ${data.crates.length} crates from source`);
const r = await syncCatalog(data);
console.log('sync result:', JSON.stringify({ ...r, warnings: r.warnings.slice(0, 20) }, null, 2));
if (r.warnings.length > 20) console.log(`...and ${r.warnings.length - 20} more warnings`);
await pool.end();
