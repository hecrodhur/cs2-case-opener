import { query, one, run } from '../db.js';
import { config } from '../config.js';

export interface GlobalSettings {
  stattrakChance: number;
  souvenirChance: number;
  marketFeePct: number;
  welcomeBalanceCents: number;
  quickSellPct: number;
}

const DEFAULTS: GlobalSettings = {
  stattrakChance: 0.1,
  souvenirChance: 0.05,
  marketFeePct: 5,
  welcomeBalanceCents: config.welcomeBalanceCents,
  quickSellPct: 90,
};

/**
 * Virtual-economy knobs. StatTrak / souvenir probabilities are approximations
 * (real Steam rates are not published); they are configurable here and in /admin.
 */
export async function getSettings(): Promise<GlobalSettings> {
  const rows = await query<any>('SELECT key, value FROM settings');
  const map: Record<string, any> = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    stattrakChance: Number(map.stattrak_chance ?? DEFAULTS.stattrakChance),
    souvenirChance: Number(map.souvenir_chance ?? DEFAULTS.souvenirChance),
    marketFeePct: Number(map.market_fee_pct ?? DEFAULTS.marketFeePct),
    welcomeBalanceCents: Number(map.welcome_balance_cents ?? DEFAULTS.welcomeBalanceCents),
    quickSellPct: Number(map.quick_sell_pct ?? DEFAULTS.quickSellPct),
  };
}

export async function setSetting(key: string, value: unknown) {
  await run('INSERT INTO settings (key, value) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, JSON.stringify(value)]);
}

export function validateSettings(patch: Partial<Record<keyof GlobalSettings, number>>): Partial<GlobalSettings> {
  const out: Partial<GlobalSettings> = {};
  const rules: Record<string, [number, number]> = {
    stattrakChance: [0, 0.5],
    souvenirChance: [0, 0.5],
    marketFeePct: [0, 50],
    welcomeBalanceCents: [0, 1_000_000_00],
    quickSellPct: [0, 100],
  };
  for (const [k, v] of Object.entries(patch)) {
    const key = k as keyof GlobalSettings;
    const [lo, hi] = rules[key] ?? [0, 1e9];
    if (typeof v !== 'number' || Number.isNaN(v) || v < lo || v > hi) {
      throw Object.assign(new Error(`invalid setting ${k}`), { statusCode: 400 });
    }
    out[key] = v;
  }
  return out;
}
