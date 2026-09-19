import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CaseDefinition, RarityTier } from 'shared';

/**
 * CaseDefinition/CasePool layer.
 *
 * The CSGO-API does not expose per-case Rare Special pools (it lumps all
 * knives/gloves into `contains_rare` with a Covert/Extraordinary label).
 * This directory holds one JSON file per case that needs explicit pool
 * definitions: which items belong to which tier and what the case
 * probabilities are. Entries are matched by exact item name against the
 * crate's `contains` + `contains_rare` lists; unknown names are reported as
 * warnings during sync (the data may need manual validation).
 */
export interface LoadedCaseDefinitions {
  defs: Map<string, CaseDefinition>;
  warnings: string[];
}

export async function loadCaseDefinitions(dir: string): Promise<LoadedCaseDefinitions> {
  const defs = new Map<string, CaseDefinition>();
  const warnings: string[] = [];
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return { defs, warnings };
  }
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    try {
      const raw = JSON.parse(await readFile(join(dir, f), 'utf8'));
      const def: CaseDefinition = {
        case: raw.case,
        probabilities: raw.probabilities,
        pools: raw.pools,
        costCents: raw.costCents,
        note: raw.note,
      };
      if (!def.case || !def.pools) {
        warnings.push(`${f}: missing "case" or "pools"`);
        continue;
      }
      for (const tier of Object.keys(def.pools) as RarityTier[]) {
        if (!Array.isArray(def.pools![tier])) {
          warnings.push(`${f}: pools.${tier} must be an array of item names`);
        }
      }
      defs.set(def.case, def);
    } catch (e: any) {
      warnings.push(`${f}: ${e.message}`);
    }
  }
  return { defs, warnings };
}
