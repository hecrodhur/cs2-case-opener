import type { CsgoApiData } from './api.js';
import type { SkinInfo, CrateInfo } from 'shared';
import { loadCaseDefinitions } from './caseDefinitions.js';
import { query, one, run, insert } from '../db.js';
import type { RarityTier } from 'shared';
import { RARITY_TIERS, DEFAULT_PROBABILITIES } from 'shared';
import { config } from '../config.js';
// definitions are bundled via JSON imports (see data/caseDefinitions.ts)
export const CASE_DEFINITIONS_DIR = 'src/case-definitions';

export interface SyncResult {
  skins: number;
  cases: number;
  pools: number;
  poolItems: number;
  warnings: string[];
}

function skinKind(category: string): string {
  if (category === 'Knives') return 'knife';
  if (category === 'Gloves') return 'glove';
  return 'skin';
}

const ITEM_COLS = `id, kind, market_hash_name, name, weapon, category, pattern, paint_index,
  rarity_tier, min_float, max_float, stattrak, souvenir, phase, image, collections, def_index, extra`;

async function upsertSkin(s: SkinInfo): Promise<number> {
  // upsert: last_row_id is the existing rowid when the conflict takes the UPDATE branch
  return insert(
    `INSERT INTO items (kind, market_hash_name, name, weapon, category, pattern, paint_index,
       rarity_tier, min_float, max_float, stattrak, souvenir, phase, image, collections, api_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE,$13,$14,$15)
     ON CONFLICT (market_hash_name, kind)
     DO UPDATE SET kind = EXCLUDED.kind, name = EXCLUDED.name, weapon = EXCLUDED.weapon,
       category = EXCLUDED.category, pattern = EXCLUDED.pattern, paint_index = EXCLUDED.paint_index,
       rarity_tier = EXCLUDED.rarity_tier, min_float = EXCLUDED.min_float, max_float = EXCLUDED.max_float,
       stattrak = EXCLUDED.stattrak, souvenir = EXCLUDED.souvenir, image = EXCLUDED.image,
       collections = EXCLUDED.collections, api_id = EXCLUDED.api_id`,
    [skinKind(s.category), s.name, s.name, s.weapon, s.category, s.pattern, s.paintIndex, s.rarity,
     s.minFloat, s.maxFloat, s.stattrak, s.souvenir, s.image, s.collections, s.id],
  );
}

export async function syncCatalog(data: CsgoApiData, defDir: string = CASE_DEFINITIONS_DIR): Promise<SyncResult> {
  const warnings: string[] = [];
  const defs = await loadCaseDefinitions(defDir);
  warnings.push(...defs.warnings);

  // 1) Upsert skins
  const skinByName = new Map<string, number>();
  for (const s of data.skins) {
    const id = await upsertSkin(s);
    skinByName.set(s.name, id);
  }

  // 2) Upsert cases + pools
  let cases = 0;
  let pools = 0;
  let poolItems = 0;

  for (const c of data.crates) {
    if (c.type !== 'Case') continue;
    if (!c.contains.length) continue;
    const def = defs.defs.get(c.name);

    const caseRow = { id: await insert(
      `INSERT INTO items (kind, market_hash_name, name, image, def_index, api_id)
       VALUES ('case', $1, $2, $3, $4, $5)
       ON CONFLICT (market_hash_name, kind)
       DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image, def_index = EXCLUDED.def_index, api_id = EXCLUDED.api_id`,
      [c.marketHashName, c.name, c.image, c.defIndex, c.id],
    ) };

    // tier -> item ids, from API data
    const tierItems = new Map<RarityTier, Set<number>>();
    RARITY_TIERS.forEach((t) => tierItems.set(t, new Set()));
    const crateItemIds = new Set<number>();
    const resolve = (name: string): number | null => {
      const id = skinByName.get(name);
      if (!id) {
        warnings.push(`case "${c.name}": item "${name}" not found in catalog (skipped)`);
        return null;
      }
      return id;
    };
    for (const entry of c.contains) {
      const id = resolve(entry.name);
      if (id == null) continue;
      const tier = mapApiTier(entry.rarity);
      tierItems.get(tier)!.add(id);
      crateItemIds.add(id);
    }
    // knives/gloves are Gold (rare_special): hidden behind the generic gold reveal
    for (const entry of c.containsRare) {
      const id = resolve(entry.name);
      if (id == null) continue;
      tierItems.get('rare_special')!.add(id);
      crateItemIds.add(id);
    }

    // apply case definition: move/add items into explicit tiers
    if (def?.pools) {
      for (const tierStr of Object.keys(def.pools) as RarityTier[]) {
        const names = def.pools![tierStr] ?? [];
        for (const name of names) {
          const id = skinByName.get(name);
          if (id == null) {
            warnings.push(`case "${c.name}": definition item "${name}" not in catalog (skipped)`);
            continue;
          }
          for (const t of RARITY_TIERS) tierItems.get(t)!.delete(id);
          tierItems.get(tierStr)!.add(id);
          crateItemIds.add(id);
        }
      }
    }

    const probabilities = def?.probabilities ?? DEFAULT_PROBABILITIES;

    const caseId: number = await insert(
      `INSERT INTO cases (item_id, name, market_hash_name, image, first_sale_date, def_index, probabilities, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb, TRUE)
       ON CONFLICT (item_id) DO UPDATE SET
         name = EXCLUDED.name, image = EXCLUDED.image, probabilities = EXCLUDED.probabilities,
         def_index = EXCLUDED.def_index, active = TRUE, updated_at = now()`,
      [caseRow.id, c.name, c.marketHashName, c.image, c.firstSaleDate, c.defIndex ?? null, JSON.stringify(probabilities)],
    );
    cases++;

    // rebuild pools for this case
    await run('DELETE FROM case_pools WHERE case_id = $1', [caseId]);
    for (const tier of RARITY_TIERS) {
      const ids = [...tierItems.get(tier)!];
      if (!ids.length) continue;
      const pool = { id: await insert('INSERT INTO case_pools (case_id, tier) VALUES ($1,$2)', [caseId, tier]) };
      pools++;
      for (const itemId of ids) {
        await run('INSERT INTO case_pool_items (case_pool_id, item_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [pool.id, itemId]);
        poolItems++;
      }
    }

    if (def?.costCents != null) {
      await run('UPDATE cases SET cost_cents = $2, updated_at = now() WHERE id = $1', [caseId, def.costCents]);
    }
  }

  // 3) Drop cases that vanished from the source (keep manual ones: def with costCents)
  const known = new Set(data.crates.filter((c) => c.type === 'Case' && c.contains.length).map((c) => c.name));
  const allCases = await query<any>('SELECT id, name FROM cases');
  for (const c of allCases) {
    if (!known.has(c.name) && !defs.defs.get(c.name)) {
      // keep in DB but deactivate, do not hard-delete user history
      await run('UPDATE cases SET active = FALSE WHERE id = $1', [c.id]);
    }
  }

  // every active case must be openable: fill missing costs (Steam price else fallback)
  await ensureCaseCosts();

  const auditDetail = { skins: data.skins.length, cases, pools, poolItems, warnings: warnings.slice(0, 50) };
  await run(
    'INSERT INTO audit_logs (action, target, detail) VALUES ($1,$2,$3::jsonb)',
    ['catalog_sync', 'catalog', auditDetail],
  );

  return { skins: data.skins.length, cases, pools, poolItems, warnings };
}

/**
 * Give a cost to every active case missing one, using ONLY a real Steam
 * Community Market price (price * priceCostRatio).
 * Cases without a Steam listing keep cost_cents NULL: no fallback, no
 * estimation from case age. The price sync queue keeps retrying them; a case
 * with NULL cost is not openable until Steam reports a real listing.
 */
export async function ensureCaseCosts(): Promise<number> {
  const rows = await query<any>(
    `SELECT c.id, p.lowest_price_cents AS steam_cents
     FROM cases c
     JOIN items i ON i.id = c.item_id
     LEFT JOIN prices p ON p.item_id = i.id AND p.wear = 'any' AND p.stattrak = 0
     WHERE c.cost_cents IS NULL AND c.active = TRUE`,
  );
  let n = 0;
  for (const r of rows) {
    if (r.steam_cents == null) continue; // no real price yet: leave NULL
    const cost = Math.max(1, Math.round(Number(r.steam_cents) * config.priceCostRatio));
    await run('UPDATE cases SET cost_cents = $2, updated_at = now() WHERE id = $1', [r.id, cost]);
    n++;
  }
  return n;
}

export function mapApiTier(apiName: string | undefined): RarityTier {
  switch (apiName) {
    case 'Restricted':
      return 'restricted';
    case 'Classified':
      return 'classified';
    case 'Covert':
    case 'Extraordinary':
      return 'covert';
    default:
      return 'mil_spec';
  }
}
