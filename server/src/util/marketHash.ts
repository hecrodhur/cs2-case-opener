import { WEAR_RANGES } from './rng.js';

/**
 * Derives the Steam Community Market hash name for a concrete listing.
 * Base names look like "AK-47 | Redline" or "★ Karambit | Fade".
 */
export function marketHashName(base: string, wear: string, stattrak = false, souvenir = false): string {
  return variantMhn(base, { wear, stattrak, souvenir });
}

export const WEAR_ORDER = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];

/**
 * Wear bands that actually exist for an item, from its float range
 * (a wear exists when [minFloat, maxFloat] intersects its band).
 * Items without float data default to every band.
 */
export function existingWears(minFloat: number | null, maxFloat: number | null): string[] {
  if (minFloat == null || maxFloat == null) return WEAR_ORDER;
  const lo = Number(minFloat);
  const hi = Number(maxFloat);
  const out = WEAR_RANGES.filter((r) => lo < r.max && hi > r.min).map((r) => r.name);
  return out.length ? out : WEAR_ORDER;
}

/**
 * Exact Steam market hash name for one concrete variant:
 * wear (gloves are listed without a wear suffix), StatTrak and souvenir
 * prefixes. The mhn used to fetch a price row must match that row's
 * (wear, stattrak, souvenir) combination exactly.
 */
export function variantMhn(
  base: string,
  opts: { wear?: string | null; stattrak?: boolean; souvenir?: boolean; glove?: boolean },
): string {
  let n = base;
  if (opts.stattrak) n = n.startsWith('★ ') ? '★ StatTrak™ ' + n.slice(2) : 'StatTrak™ ' + n;
  if (opts.souvenir) n = 'Souvenir ' + n;
  if (opts.wear && opts.wear !== 'any' && !opts.glove) n = `${n} (${opts.wear})`;
  return n;
}

/**
 * Query string safe for the Steam market search endpoint: the pipe char is
 * treated as an operator by Steam, so it must be replaced with a space.
 */
export function steamQueryFor(mhn: string): string {
  return mhn.replace(/\|/g, ' ').replace('StatTrak™', 'StatTrak');
}
