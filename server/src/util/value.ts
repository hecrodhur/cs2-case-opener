import { query } from '../db.js';
import type { RarityTier } from 'shared';

/**
 * Virtual value model. Every instance gets a deterministic value in cents:
 *  - Steam lowest ask for the item when available (best matching row)
 *  - otherwise a tier-based base value
 * Both paths then apply wear / StatTrak / souvenir / pattern adjustments so
 * value consistently depends on float, wear, ST, souvenir and pattern.
 */

// typical Steam market value ratio per wear, relative to Field-Tested
export const WEAR_VALUE_RATIO: Record<string, number> = {
  'Factory New': 1.9,
  'Minimal Wear': 1.35,
  'Field-Tested': 1.0,
  'Well-Worn': 0.75,
  'Battle-Scarred': 0.5,
};

export const SOUVENIR_RATIO = 1.5;

/**
 * StatTrak premium/discount vs the non-ST value of the same item.
 * Knives carry a discount (ST knives are worth less than their normal version);
 * skins get a premium that shrinks with the base price.
 * Steam market rows for StatTrak items are unreliable (often 1c placeholders),
 * so ST value is always derived from the non-ST price with this rule.
 */
export function stattrakMultiplier(baseCents: number, category: string | null): number {
  if ((category ?? '').toLowerCase() === 'knives') return 0.925; // knives: ST is worth 7.5% less
  if (baseCents < 1000) return 1.75; // under $10: +75%
  if (baseCents <= 2000) return 1.35; // $10-$20: +35%
  return 1.08; // above $20: +8%
}

// fallback base value per rarity tier (cents) used before Steam prices arrive
export const TIER_BASE_VALUE_CENTS: Record<RarityTier, number> = {
  mil_spec: 300,
  restricted: 900,
  classified: 2500,
  covert: 9000,
  rare_special: 85000,
};

export interface ValueInput {
  tier: RarityTier;
  floatValue: number | null;
  wear: string | null;
  stattrak: boolean;
  souvenir: boolean;
  pattern: number | null;
  phase: number | null;
  seed: string | null;
  category?: string | null;
}

/** Best available Steam price row for an item (exact match preferred). */
export async function resolveSteamPrice(itemId: number) {
  const rows = await query<any>('SELECT wear, stattrak, lowest_price_cents FROM prices WHERE item_id = $1 AND lowest_price_cents IS NOT NULL', [itemId]);
  if (!rows.length) return null;
  const priced = rows.filter((r) => r.lowest_price_cents > 0);
  if (!priced.length) return null;
  return priced;
}

export function pickBestPrice(rows: any[], input: ValueInput): any | null {
  if (!rows.length) return null;
  // 1) exact wear + stattrak, 2) same stattrak, 3) same wear, 4) cheapest row
  const wear = input.wear;
  const exact = rows.find((r) => r.stattrak === input.stattrak && r.wear === wear);
  if (exact) return exact;
  const st = rows.find((r) => r.stattrak === input.stattrak);
  if (st) return st;
  const wearRow = rows.find((r) => r.wear === wear);
  if (wearRow) return wearRow;
  return rows.reduce((a, b) => (a.lowest_price_cents <= b.lowest_price_cents ? a : b));
}

/** deterministic small variation for pattern/phase/seed, in [-0.04, 0.04] */
function variantAdjustment(pattern: number | null, phase: number | null, seed: string | null): number {
  let h = 5381;
  const s = `${pattern ?? ''}:${phase ?? ''}:${seed ?? ''}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  if (!h) return 0;
  const u = ((h % 1000) / 1000 - 0.5) * 0.08;
  return u;
}

export function estimatedValueCents(input: ValueInput, priceRows: any[]): number {
  // StatTrak market rows are 1c placeholders: value ST items from the non-ST price
  const rows = input.stattrak ? priceRows.filter((r) => !r.stattrak) : priceRows;
  const row = pickBestPrice(rows, input);
  let value: number;
  let refWear: string | null;
  if (row) {
    value = Number(row.lowest_price_cents);
    refWear = row.wear === 'any' ? null : row.wear;
  } else {
    value = TIER_BASE_VALUE_CENTS[input.tier] ?? TIER_BASE_VALUE_CENTS.mil_spec;
    refWear = null;
  }
  // wear correction: reference prices are fetched at Field-Tested (or 'any')
  const target = input.wear ?? 'Field-Tested';
  const rTarget = WEAR_VALUE_RATIO[target] ?? 1;
  const rRef = refWear ? (WEAR_VALUE_RATIO[refWear] ?? 1) : 1;
  value = (value * rTarget) / rRef;
  if (input.stattrak) value *= stattrakMultiplier(value, input.category ?? null);
  if (input.souvenir) value *= SOUVENIR_RATIO;
  value *= 1 + variantAdjustment(input.pattern, input.phase, input.seed);
  return Math.max(1, Math.round(value));
}

/** Full value for an instance: resolves its Steam rows then applies the model. */
export async function estimateInstanceValue(itemId: number, input: ValueInput): Promise<number> {
  const rows = await resolveSteamPrice(itemId);
  return estimatedValueCents(input, rows ?? []);
}
