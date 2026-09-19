export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? null,
  pgDataDir: process.env.PG_DATA_DIR ?? new URL('../.pg-data', import.meta.url).pathname,
  pgPort: Number(process.env.PG_PORT ?? 54330),
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'hola67',
  csgoApiBase: process.env.CSGO_API_BASE ?? 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en',
  steamMarketUrl: process.env.STEAM_MARKET_URL ?? 'https://steamcommunity.com/market/search/render',
  steamMinIntervalMs: Number(process.env.STEAM_MIN_INTERVAL_MS ?? 1500),
  priceStaleHours: Number(process.env.PRICE_STALE_HOURS ?? 6),
  welcomeBalanceCents: Number(process.env.WELCOME_BALANCE_CENTS ?? 10000),
  // multiplier for rate limits (>1 = looser, 0 = disabled); useful for load/tests
  rateLimitScale: Number(process.env.RATE_LIMIT_SCALE ?? 1),
  // virtual cents per 1 USD of Steam lowest ask, used to derive case cost from price
  priceCostRatio: Number(process.env.PRICE_COST_RATIO ?? 1),
};

export type Config = typeof config;
