import type { Wear } from 'shared';

/**
 * Derives the Steam Community Market hash name for a concrete listing.
 * Base names look like "AK-47 | Redline" or "★ Karambit | Fade".
 */
export function marketHashName(base: string, wear: Wear, stattrak = false, souvenir = false): string {
  let n = base;
  if (stattrak) {
    if (n.startsWith('★ ')) n = '★ StatTrak™ ' + n.slice(2);
    else n = 'StatTrak™ ' + n;
  }
  if (souvenir) n = 'Souvenir ' + n;
  return `${n} (${wear})`;
}

/**
 * Query string safe for the Steam market search endpoint: the pipe char is
 * treated as an operator by Steam, so it must be replaced with a space.
 */
export function steamQueryFor(mhn: string): string {
  return mhn.replace(/\|/g, ' ').replace('StatTrak™', 'StatTrak');
}
