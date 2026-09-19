import pg from 'pg';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { setPool, migrate } from '../db.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl ?? `postgres://postgres:cs2case@localhost:${config.pgPort}/cs2`, max: 10 });
setPool(pool);
const applied = await migrate(pool, join(dirname(fileURLToPath(import.meta.url)), 'db'));
console.log(applied.length ? `applied: ${applied.join(', ')}` : 'up to date');
await pool.end();
