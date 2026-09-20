import { query } from '../db.js';
import type { RarityTier } from 'shared';

/**
 * Virtual value model, in priority order:
 *  1. exact real market price for this variant (item + wear + stattrak + souvenir)
 *  2. real price of the base variant (same wear, non-ST/souvenir) + a clearly
 *     marked premium only when the variant's own real price is missing
 *  3. cheapest real price of the item (any wear) with a wear-ratio correction
 *  4. tier-based base value (no real price at all yet)
 * WEAR_VALUE_RATIO is only used in steps 3/4 as a fallback; it never
 * overwrites a real price fetched for the exact variant.
 */

export const WEAR_VALUE_RATIO: Record<string, number> = {
  'Factory New': 1.9,
  'Minimal Wear': 1.35,
  'Field-Tested': 1.0,
  'Well-Worn': 0.75,
  'Battle-Scarred': 0.5,
};

export const SOUVENIR_RATIO = 1.5;

/**
 * StatTrak premium/discount vs the non-ST value of the same item, used only
 * when no real StatTrak market row exists for the variant (Steam ST rows are
 * often 1c placeholders). Knives carry a discount; skins a shrinking premium.
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

/** All non-null Steam price rows for an item (every variant). */
export async function resolveSteamPrice(itemId: number) {
  const rows = await query<any>(
    'SELECT wear, stattrak, souvenir, lowest_price_cents FROM prices WHERE item_id = $1 AND lowest_price_cents IS NOT NULL',
    [itemId],
  );
  return rows;
}

/**
 * A market row is usable when it has a real price. StatTrak rows at 1-2 cents
 * are Steam placeholders, not real asks, so they are treated as missing when
 * a real non-ST price exists.
 */
function realCents(row: any, isStRow: boolean, baseExists: boolean): number | null {
  const c = Number(row.lowest_price_cents);
  if (!Number.isFinite(c) || c <= 0) return null;
  if (isStRow && c < 100 && baseExists) return null;
  return c;
}

export function estimatedValueCents(input: ValueInput, priceRows: any[]): number {
  const adj = 1 + variantAdjustment(input.pattern, input.phase, input.seed);
  const target = input.wear ?? 'Field-Tested';
  const rTarget = WEAR_VALUE_RATIO[target] ?? 1;
  const baseRow = priceRows.find((r) => !r.stattrak && !r.souvenir && (r.wear === target || r.wear === 'any'));
  const baseCents = baseRow ? realCents(baseRow, false, false) : null;

  // 1) exact real price for this variant
  const exact = priceRows.find(
    (r) => Boolean(r.stattrak) === input.stattrak && Boolean(r.souvenir) === input.souvenir && (r.wear === target || r.wear === 'any'),
  );
  const exactCents = exact ? realCents(exact, Boolean(exact.stattrak), Boolean(baseCents)) : null;
  if (exactCents != null) return Math.max(1, Math.round(exactCents * adj));

  // 2) real base price for this wear: apply the ST/souvenir premium only
  // because no real price exists for this exact variant yet
  if (baseCents != null) {
    let v = baseCents;
    if (input.stattrak) v *= stattrakMultiplier(v, input.category ?? null);
    if (input.souvenir) v *= SOUVENIR_RATIO;
    return Math.max(1, Math.round(v * adj));
  }

  // 3) real price of some other wear: correct with the wear ratio (fallback)
  const others = priceRows.filter((r) => r.lowest_price_cents != null).map((r) => ({ ...r, c: Number(r.lowest_price_cents) }));
  if (others.length) {
    const row = others.reduce((a, b) => (a.c <= b.c ? a : b));
    const rRef = WEAR_VALUE_RATIO[row.wear] ?? 1;
    let v = (row.c * rTarget) / rRef;
    if (input.stattrak) v *= stattrakMultiplier(v, input.category ?? null);
    if (input.souvenir) v *= SOUVENIR_RATIO;
    return Math.max(1, Math.round(v * adj));
  }

  // 4) no real price yet: tier-based fallback
  let v = (TIER_BASE_VALUE_CENTS[input.tier] ?? TIER_BASE_VALUE_CENTS.mil_spec) * rTarget;
  if (input.stattrak) v *= stattrakMultiplier(v, input.category ?? null);
  if (input.souvenir) v *= SOUVENIR_RATIO;
  return Math.max(1, Math.round(v * adj));
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

/** Full value for an instance: resolves its Steam rows then applies the model. */
export async function estimateInstanceValue(itemId: number, input: ValueInput): Promise<number> {
  const rows = await resolveSteamPrice(itemId);
  return estimatedValueCents(input, rows ?? []);
}
