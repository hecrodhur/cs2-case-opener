import type { SkinInfo, CrateInfo, RarityTier, Wear } from 'shared';

/**
 * Thin client for the ByMykel/CSGO-API JSON files hosted on GitHub raw.
 * All fetches go through an injectable loader so tests can use local fixtures
 * and so a mirror can be configured via CSGO_API_BASE.
 */

export interface CsgoApiData {
  skins: SkinInfo[];
  crates: CrateInfo[];
}

const RARITY_MAP: Record<string, RarityTier> = {
  'Consumer Grade': 'mil_spec',
  'Industrial Grade': 'mil_spec',
  'Mil-Spec Grade': 'mil_spec',
  Restricted: 'restricted',
  Classified: 'classified',
  Covert: 'covert',
  Extraordinary: 'covert',
};

const WEAR_NAMES: Record<string, Wear> = {
  'Factory New': 'Factory New',
  'Minimal Wear': 'Minimal Wear',
  'Field-Tested': 'Field-Tested',
  'Well-Worn': 'Well-Worn',
  'Battle-Scarred': 'Battle-Scarred',
};

export function mapRarity(apiName: string | undefined): RarityTier {
  if (!apiName) return 'mil_spec';
  return RARITY_MAP[apiName] ?? 'mil_spec';
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'cs2-case-opener/1.0' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

export async function loadCsgoApiData(base: string): Promise<CsgoApiData> {
  const skinsRaw = await fetchJson(`${base}/skins.json`);
  const cratesRaw = await fetchJson(`${base}/crates.json`);

  const skins: SkinInfo[] = skinsRaw.map((s: any) => ({
    id: s.id,
    name: s.name,
    weapon: s.weapon?.name ?? null,
    category: s.category?.name ?? 'Unknown',
    pattern: s.pattern?.name ?? null,
    paintIndex: s.paint_index ?? null,
    rarity: mapRarity(s.rarity?.name),
    minFloat: typeof s.min_float === 'number' ? s.min_float : 0,
    maxFloat: typeof s.max_float === 'number' ? s.max_float : 1,
    stattrak: Boolean(s.stattrak),
    souvenir: Boolean(s.souvenir),
    wears: (s.wears ?? []).map((w: any) => WEAR_NAMES[w.name]).filter(Boolean) as Wear[],
    image: s.image ?? null,
    crates: (s.crates ?? []).map((c: any) => ({ id: c.id, name: c.name })),
    collections: (s.collections ?? []).map((c: any) => c.name).filter(Boolean),
  }));

  const crates: CrateInfo[] = cratesRaw.map((c: any) => ({
    id: c.id,
    name: c.name,
    marketHashName: c.market_hash_name ?? c.name,
    image: c.image ?? null,
    type: c.type ?? null,
    firstSaleDate: c.first_sale_date ?? null,
    defIndex: typeof c.def_index === 'number' ? c.def_index : null,
    contains: (c.contains ?? []).map((x: any) => ({ id: x.id, name: x.name, rarity: x.rarity?.name ?? '' })),
    containsRare: (c.contains_rare ?? []).map((x: any) => ({ id: x.id, name: x.name, rarity: x.rarity?.name ?? '' })),
  }));

  return { skins, crates };
}
