import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { setPool, migrate, one } from './db.js';
import { buildApp } from './app.js';
import { RealtimeHub } from './services/realtime.js';
import { PriceSyncService } from './services/pricing.js';
import { seedAdmin } from './services/auth.js';
import { loadCsgoApiData } from './data/api.js';
import { syncCatalog, ensureCaseCosts } from './data/sync.js';
import { refreshPricesForCases } from './services/priceJobs.js';

async function bootDatabase(): Promise<pg.Pool> {
  let pool: pg.Pool;
  if (config.databaseUrl) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 20 });
  } else {
    const EP = (await import('embedded-postgres')).default;
    const ep = new EP({
      databaseDir: config.pgDataDir,
      port: config.pgPort,
      user: 'postgres',
      password: 'cs2case',
      persistent: true,
      onLog: () => {},
      onError: () => {},
    });
    const up = await portOpen(config.pgPort);
    if (!up) {
      // only initdb when the data dir is fresh; a leftover cluster just needs starting
      const hasCluster = existsSync(join(config.pgDataDir, 'PG_VERSION'));
      if (!hasCluster) await ep.initialise();
      await ep.start();
    }
    // use our own pg client to keep boot transparent
    const client = new pg.Client({ user: 'postgres', password: 'cs2case', port: config.pgPort, host: '127.0.0.1', database: 'postgres' });
    try {
      await client.connect();
      const dbs = (await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['cs2'])).rows;
      if (!dbs.length) {
        await client.query('CREATE DATABASE cs2');
      }
    } finally {
      await client.end().catch(() => {});
    }
    pool = new pg.Pool({ connectionString: `postgres://postgres:cs2case@127.0.0.1:${config.pgPort}/cs2`, max: 20 });
  }
  await pool.query('SELECT 1');
  setPool(pool);
  // a hard-killed connection must not crash the process
  pool.on('error', () => {});
  const applied = await migrate(pool, join(dirname(fileURLToPath(import.meta.url)), 'db'));
  if (applied.length) console.log(`[db] applied migrations: ${applied.join(', ')}`);
  return pool;
}

async function portOpen(port: number): Promise<boolean> {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const sock = net.default.connect(port, '127.0.0.1');
    sock.on('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
  });
}

async function initialCatalogSync() {
  const n = await one<any>('SELECT COUNT(*)::int AS n FROM items');
  if ((n?.n ?? 0) > 0) return;
  console.log('[sync] catalog empty, syncing from CSGO-API...');
  try {
    const data = await loadCsgoApiData(config.csgoApiBase);
    const r = await syncCatalog(data);
    console.log(`[sync] catalog ready: ${r.skins} skins, ${r.cases} cases, ${r.poolItems} pool entries`);
    if (r.warnings.length) console.warn(`[sync] ${r.warnings.length} warnings (first 10):`, r.warnings.slice(0, 10));
  } catch (e: any) {
    console.error('[sync] initial catalog sync failed:', e.message);
  }
}

async function main() {
  await bootDatabase();
  await seedAdmin();
  await initialCatalogSync();
  // every active case must be openable (Steam price or fallback)
  const filled = await ensureCaseCosts().catch((e) => {
    console.error('[sync] case cost backfill failed:', e.message);
    return 0;
  });
  if (filled) console.log(`[sync] assigned fallback/steam cost to ${filled} cases`);

  const hub = new RealtimeHub();
  const prices = new PriceSyncService();
  prices.setHub(hub);

  const here = dirname(fileURLToPath(import.meta.url));
  const webDist = join(here, '../../web/dist');

  const app = await buildApp({
    pool: null,
    ctx: { hub, prices },
    webDist: existsSync(webDist) ? webDist : undefined,
  });

  await app.listen({ port: config.port, host: config.host });
  console.log(`[server] listening on http://${config.host}:${config.port}`);

  // background price refresh (Steam rate limited, ~1 req / 1.5s)
  setTimeout(() => void refreshPricesForCases(prices, 25), 5000);
  setInterval(() => void refreshPricesForCases(prices, 8), 30 * 60_000);

  const shutdown = async () => {
    console.log('[server] shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('[server] fatal', e);
  process.exit(1);
});
