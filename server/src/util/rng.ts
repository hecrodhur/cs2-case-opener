/**
 * The RNG is server-side only: the client never rolls anything, it only plays
 * back the committed result (see the seed field on openings for auditability).
 * crypto.getRandomValues is available in the Workers runtime and in Node.
 */
import type { RarityTier, Probabilities } from 'shared';
import { RARITY_TIERS } from 'shared';

function randFloat(): number {
  // 32 bits of entropy, plenty for gameplay rolls
  const buf = crypto.getRandomValues(new Uint32Array(1));
  return buf[0] / 4294967296;
}

export function rollRarity(probs: Probabilities, emptyTiers: Set<RarityTier>): RarityTier {
  const usable = RARITY_TIERS.filter((t) => !emptyTiers.has(t));
  const total = usable.reduce((s, t) => s + (probs[t] ?? 0), 0);
  if (total <= 0) throw new Error('no usable tier probabilities');
  let r = randFloat() * total;
  for (const t of usable) {
    r -= probs[t] ?? 0;
    if (r <= 0) return t;
  }
  return usable[usable.length - 1];
}

/** uniform float in [min, max] */
export function rollFloat(min: number, max: number): number {
  return min + (max - min) * randFloat();
}

export function rollBool(p: number): boolean {
  return randFloat() < p;
}

export function rollInt(n: number): number {
  return Math.floor(randFloat() * n);
}

export function makeSeed(): string {
  return randomHex(16);
}

function randomHex(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

export const WEAR_RANGES: { name: string; min: number; max: number }[] = [
  { name: 'Factory New', min: 0.0, max: 0.07 },
  { name: 'Minimal Wear', min: 0.07, max: 0.15 },
  { name: 'Field-Tested', min: 0.15, max: 0.38 },
  { name: 'Well-Worn', min: 0.38, max: 0.45 },
  { name: 'Battle-Scarred', min: 0.45, max: 1.0 },
];

export function wearFromFloat(f: number): string {
  const w = WEAR_RANGES.find((r) => f >= r.min && f < r.max);
  return w ? w.name : 'Battle-Scarred';
}
