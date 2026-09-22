// Fixed price snapshot (server/src/data/fixedPrices.json). It is the PRIMARY
// in-game value source: an exact market_hash_name lookup here wins over the
// slow Steam queue.
//
// Provenance (see generated_at / source_priority inside the file):
//   - cases: real Steam ask prices (priceoverview lowest_price, EUR)
//   - knives: real Steam lowest price per knife, expanded per wear with the
//     canonical WEAR_VALUE_RATIO anchored at Battle-Scarred (a plain knife has
//     no wear in its market_hash_name, so Steam lists one price per knife/ST)
// The JSON price is already in EUR cents, so it is used verbatim as priceCents
// (no wear ratio, no StatTrak/Souvenir premium, no pattern/seed adjustment).
// Entries with a null price_cents are genuinely unlisted on Steam; the caller
// falls back to the live model. The file is bundled into the worker, so it is
// imported as a module (Workers have no filesystem).
import raw from './fixedPrices.json' with { type: 'json' };

export interface FixedPriceEntry {
  price_cents: number | null;
  source: string | null;
  stock?: number | null;
  updated_at?: string | null;
  kind?: string | null;
  name?: string | null;
  base?: string | null;
  wear?: string | null;
  stattrak?: boolean;
  souvenir?: boolean;
}

interface FixedPricesDoc {
  generated_at: string;
  currency: string;
  source_priority: string[];
  items: Record<string, FixedPriceEntry>;
  stats?: Record<string, number>;
}

const doc = raw as FixedPricesDoc;

export interface FixedPriceHit {
  priceCents: number;
  source: string | null;
  updatedAt: string | null;
}

/**
 * Exact market_hash_name lookup. Returns null when the name is absent or has no
 * real price (price_cents null) so callers can fall back to the live model.
 */
export function lookupFixedPrice(exactMhn: string): FixedPriceHit | null {
  const e = doc.items[exactMhn];
  if (!e) return null;
  const c = Number(e.price_cents);
  if (!Number.isFinite(c) || c <= 0) return null;
  return {
    priceCents: Math.max(1, Math.round(c)),
    source: e.source ?? null,
    updatedAt: e.updated_at ?? null,
  };
}

/** Summary for the admin panel: where this snapshot came from and how complete it is. */
export function fixedPricesMeta() {
  const items = Object.values(doc.items);
  return {
    generatedAt: doc.generated_at,
    currency: doc.currency,
    sourcePriority: doc.source_priority,
    totalItems: items.length,
    pricedItems: items.filter((e) => Number(e.price_cents) > 0).length,
    stats: doc.stats ?? null,
  };
}
