const env = typeof process !== 'undefined' && process.env ? (process.env as Record<string, string | undefined>) : ({} as Record<string, string | undefined>);

/**
 * Static tuning knobs. Cloudflare-specific values (DB, admin password, seed
 * flag) arrive as bindings on env (see Env in worker.ts) and are applied via
 * setAdminPassword() at request time.
 */
export const config = {
  corsOrigins: (env.FRONTEND_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  rateLimit: { windowMs: 60_000, auth: 20, api: 240, admin: 50 },
  scale: Number(env.RATE_LIMIT_SCALE ?? 1),
  welcomeBalanceCents: 25_000,
  sessionDays: Number(env.SESSION_DAYS ?? 30),
  priceCostRatio: 1.0,
  stattrakChance: 0.1,
  souvenirChance: 0.05,
  steamMinIntervalMs: 1_500,
  steamMarketUrl: 'https://steamcommunity.com/market/search/render/',
  csgoApiBase: env.CSGO_API_BASE ?? 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en',
  csgoApiBaseMirror: env.CSGO_API_BASE_MIRROR ?? 'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en',
} as const;

let adminPassword = env.ADMIN_PASSWORD ?? 'hola67';
export function setAdminPassword(p: string) {
  adminPassword = p;
}
export function getAdminPassword(): string {
  return adminPassword;
}
