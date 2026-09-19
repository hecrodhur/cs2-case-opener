import { randomBytes, randomInt } from 'node:crypto';
import type { RarityTier, Probabilities, Wear } from 'shared';
import { WEAR_RANGES } from 'shared';

/**
 * RNG helpers. All draws use node:crypto CSPRNG (uniform, no modulo bias
 * via randomInt). The server decides every prize; the client never rolls.
 */

export function rollInt(n: number): number {
  return randomInt(n);
}

export function makeSeed(): string {
  return randomBytes(16).toString('hex');
}

export function rollBool(p: number): boolean {
  return randomInt(1_000_000) / 1_000_000 < p;
}

/**
 * Weighted rarity draw. Tiers without probability or with an empty pool are
 * dropped and the rest renormalised. `emptyTiers` tells which tiers have no
 * items for this case.
 */
export function rollRarity(
  probs: Probabilities,
  emptyTiers: ReadonlySet<RarityTier> = new Set(),
): RarityTier {
  const weights: [RarityTier, number][] = [];
  let total = 0;
  (Object.keys(probs) as RarityTier[]).forEach((tier) => {
    const p = probs[tier] ?? 0;
    if (p <= 0 || emptyTiers.has(tier)) return;
    weights.push([tier, p]);
    total += p;
  });
  if (total <= 0) throw new Error('case has no valid rarity probabilities');
  let r = randomInt(10_000_000); // 0.0001% resolution
  const scale = 10_000_000 / total;
  for (const [tier, p] of weights) {
    r -= Math.round(p * scale);
    if (r < 0) return tier;
  }
  return weights[weights.length - 1][0];
}

/** Uniform float in [min, max] with 5-decimal precision. */
export function rollFloat(min: number, max: number): number {
  const span = Math.max(0, max - min);
  const raw = min + (randomInt(1_000_000_000) / 1_000_000_000) * span;
  return Math.round(raw * 100_000) / 100_000;
}

export function wearFromFloat(f: number): Wear {
  for (const wear of Object.keys(WEAR_RANGES) as Wear[]) {
    const [lo, hi] = WEAR_RANGES[wear];
    if (f >= lo && f < hi) return wear;
  }
  return 'Battle-Scarred';
}

/** Pick a random element; returns null for empty arrays. */
export function rollOf<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  return arr[randomInt(arr.length)];
}
