import type { CaseDefinition, RarityTier } from 'shared';

// Case pool definitions are bundled as plain JSON imports (Workers cannot read
// the filesystem). One file per case that needs explicit pools/probabilities.
import kilowatt from '../case-definitions/kilowatt.json' with { type: 'json' };
import clutch from '../case-definitions/clutch.json' with { type: 'json' };
import dreams from '../case-definitions/dreams-nightmares.json' with { type: 'json' };
import glove from '../case-definitions/glove-case.json' with { type: 'json' };
import prism from '../case-definitions/prism.json' with { type: 'json' };
import recoil from '../case-definitions/recoil.json' with { type: 'json' };

const FILES: Record<string, unknown> = {
  'kilowatt.json': kilowatt,
  'clutch.json': clutch,
  'dreams-nightmares.json': dreams,
  'glove-case.json': glove,
  'prism.json': prism,
  'recoil.json': recoil,
};

/**
 * CaseDefinition/CasePool layer.
 *
 * The CSGO-API does not expose per-case Rare Special pools (it lumps all
 * knives/gloves into `contains_rare` with a Covert/Extraordinary label).
 * These definitions hold: which items belong to which tier and what the case
 * probabilities are. Entries are matched by exact item name against the
 * crate's `contains` + `contains_rare` lists; unknown names are reported as
 * warnings during sync (the data may need manual validation).
 */
export interface LoadedCaseDefinitions {
  defs: Map<string, CaseDefinition>;
  warnings: string[];
}

export function loadCaseDefinitions(_dir?: string): Promise<LoadedCaseDefinitions> {
  const defs = new Map<string, CaseDefinition>();
  const warnings: string[] = [];
  for (const [f, raw] of Object.entries(FILES)) {
    const def: CaseDefinition = {
      case: (raw as any).case,
      probabilities: (raw as any).probabilities,
      pools: (raw as any).pools,
      costCents: (raw as any).costCents,
      note: (raw as any).note,
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
  }
  return Promise.resolve({ defs, warnings });
}
