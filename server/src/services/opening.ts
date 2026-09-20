import { one, query, run, tx, js } from '../db.js';
import { rollRarity, rollFloat, rollBool, rollInt, makeSeed, wearFromFloat } from '../util/rng.js';
import { getSettings } from './global.js';
import { estimatedValueCents, resolveSteamPrice } from '../util/value.js';
import { variantMhn } from '../util/marketHash.js';
import { RealtimeHub } from './realtime.js';
import { pushNotification } from './notify.js';
import type { RarityTier, Probabilities } from 'shared';
import { RARITY_TIERS } from 'shared';

export interface CaseWithPools {
  id: number;
  name: string;
  image: string | null;
  costCents: number | null;
  probabilities: Probabilities;
  active: boolean;
  pools: Record<RarityTier, number[]>; // tier -> item ids
}

export async function loadCaseWithPools(caseId: number): Promise<CaseWithPools | null> {
  const c = await one<any>(
    `SELECT c.id, c.name, c.image, c.cost_cents, c.probabilities, c.active
     FROM cases c WHERE c.id = $1`,
    [caseId],
  );
  if (!c) return null;
  const pools: Record<RarityTier, number[]> = { mil_spec: [], restricted: [], classified: [], covert: [], rare_special: [] };
  const rows = await query<any>(
    `SELECT p.tier, pi.item_id AS id
     FROM case_pools p JOIN case_pool_items pi ON pi.case_pool_id = p.id
     WHERE p.case_id = $1`,
    [caseId],
  );
  for (const r of rows) {
    if (r.tier in pools) pools[r.tier as RarityTier].push(r.id);
  }
  return {
    id: c.id,
    name: c.name,
    image: c.image,
    costCents: c.cost_cents,
    probabilities: js(c.probabilities) ?? {},
    active: c.active,
    pools,
  };
}

export interface OpeningResult {
  openingId: number;
  caseId: number;
  caseName: string;
  itemId: number;
  itemName: string;
  weapon: string | null;
  image: string | null;
  rarityTier: RarityTier;
  floatValue: number;
  wear: string;
  stattrak: boolean;
  souvenir: boolean;
  pattern: string | null;
  phase: number | null;
  priceCents: number | null;
  costCents: number;
  instanceId: number;
  seed: string;
}

/**
 * Atomic case opening: charge -> RNG -> create instance -> register opening,
 * all in one DB transaction. The user row is locked (FOR UPDATE) so
 * concurrent opens from the same account cannot double-spend.
 * The RNG runs in the server process; the client only receives the result.
 */
export interface RollDrop {
  tier: RarityTier;
  item: any;
  floatValue: number | null;
  wear: string | null;
  stattrak: boolean;
  souvenir: boolean;
  phase: number | null;
  seed: string;
  priceCents: number;
}

/** RNG only: the same draw a normal opening uses (no DB writes). */
export async function rollDrop(c: CaseWithPools): Promise<RollDrop> {
  const settings = await getSettings();
  const emptyTiers = new Set(RARITY_TIERS.filter((t) => !c.pools[t]?.length));
  const tier = rollRarity(c.probabilities, emptyTiers);
  const itemIds = c.pools[tier];
  const itemId = itemIds[rollInt(itemIds.length)];
  const item = await one<any>('SELECT * FROM items WHERE id = $1', [itemId]);
  if (!item) throw httpError(500, 'pool item missing from catalog');
  const hasFloat = item.min_float != null && item.max_float != null && item.max_float > item.min_float;
  const floatValue = hasFloat ? rollFloat(Number(item.min_float), Number(item.max_float)) : null;
  const wear = floatValue != null ? wearFromFloat(floatValue) : null;
  const stattrak = Boolean(item.stattrak) && rollBool(settings.stattrakChance);
  const souvenir = Boolean(item.souvenir) && rollBool(settings.souvenirChance);
  const phaseCount = (js<Record<string, any>>(item.extra)?.phaseCount as number | undefined) ?? 0;
  const phase = phaseCount > 0 ? rollInt(phaseCount) + 1 : null;
  const seed = makeSeed();
  const priceRows = await resolveSteamPrice(item.id);
  const priceCents = estimatedValueCents(
    {
      tier, floatValue, wear, stattrak, souvenir, pattern: item.pattern, phase, seed, category: item.category,
      exactMhn: variantMhn(item.name, { wear, stattrak, souvenir, glove: item.category === 'Gloves' }),
    },
    priceRows ?? [],
  );
  return { tier, item, floatValue, wear, stattrak, souvenir, phase, seed, priceCents };
}

/**
 * Persist a rolled drop inside the caller's transaction: instance + opening
 * row + inventory summary, and optionally charge the case cost.
 */
export async function persistDrop(client: any, userId: number, c: CaseWithPools, d: RollDrop, chargeCents: number, balanceAfter?: number) {
  if (chargeCents > 0) {
    const u = await client.query('SELECT balance_cents FROM users WHERE id = $1', [userId]);
    if (!u.rows.length) throw httpError(401, 'user gone');
    const after = balanceAfter ?? Number(u.rows[0].balance_cents);
    await client.query(
      'INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)',
      [userId, 'case_open', -chargeCents, after, `case:${c.id}`],
    );
  }
  const instanceId: number = await client.insert(
    `INSERT INTO item_instances
       (item_id, user_id, rarity_tier, float_value, wear, stattrak, souvenir, pattern, phase, seed, price_cents, case_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [d.item.id, userId, d.tier, d.floatValue, d.wear, d.stattrak, d.souvenir, d.item.pattern, d.phase, d.seed, d.priceCents, c.id],
  );
  const openingId: number = await client.insert(
    `INSERT INTO openings (user_id, case_id, instance_id, rarity_tier, float_value, wear, item_name, price_cents, cost_cents, seed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [userId, c.id, instanceId, d.tier, d.floatValue, d.wear, d.item.name, d.priceCents, chargeCents, d.seed],
  );
  await client.query(
    `INSERT INTO inventories (user_id, item_count, total_value_cents, updated_at)
     VALUES ($1, 1, COALESCE($2,0), now())
     ON CONFLICT (user_id) DO UPDATE SET item_count = inventories.item_count + 1,
       total_value_cents = inventories.total_value_cents + COALESCE($2,0), updated_at = now()`,
    [userId, d.priceCents],
  );
  return { instanceId, openingId };
}

export async function openCase(hub: RealtimeHub, user: { id: number; username?: string }, caseId: number): Promise<OpeningResult> {
  const c = await loadCaseWithPools(caseId);
  if (!c) throw httpError(404, 'case not found');
  if (!c.active) throw httpError(400, 'case is not available');
  if (c.costCents == null) throw httpError(400, 'case has no price yet');
  const cost = c.costCents;
  const emptyTiers = new Set(RARITY_TIERS.filter((t) => !c.pools[t]?.length));
  if (emptyTiers.size === RARITY_TIERS.length) throw httpError(400, 'case has no pool items');

  const d = await rollDrop(c);
  const { tier, item, floatValue, wear, stattrak, souvenir, phase, seed, priceCents } = d;

  // --- atomic charge + persistence ---------------------------------------
  const result = await tx(async (client) => {
    const u = await client.query('SELECT id, balance_cents, banned FROM users WHERE id = $1', [user.id]);
    if (!u.rows.length) throw httpError(401, 'user gone');
    if (u.rows[0].banned) throw httpError(403, 'banned');
    // conditional update: the charge only lands when the balance covers it,
    // so concurrent opens cannot double-spend even without a DB transaction
    const n = await client.update('UPDATE users SET balance_cents = balance_cents - $2, updated_at = now() WHERE id = $1 AND balance_cents >= $2', [user.id, cost]);
    if (!n) throw httpError(400, 'insufficient balance');
    const u2 = await client.query('SELECT balance_cents FROM users WHERE id = $1', [user.id]);
    return persistDrop(client, user.id, c, d, 0, Number(u2.rows[0].balance_cents));
  });

  await run('INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)', [
    user.id,
    'case_opened',
    `case:${c.id}`,
    { openingId: result.openingId, item: item.name, tier, floatValue, wear, stattrak, souvenir, seed, priceCents },
  ]);

  const drop = {
    caseId: c.id,
    caseName: c.name,
    caseImage: c.image,
    instanceId: result.instanceId,
    itemName: item.name,
    weapon: item.weapon,
    image: item.image,
    rarityTier: tier,
    floatValue,
    wear,
    stattrak,
    souvenir,
    priceCents,
    costCents: cost,
    username: user.username ?? null,
  };
  hub.broadcast('drop', drop);
  if (tier === 'rare_special') {
    hub.broadcast('activity', { type: 'rare_special', ...drop });
    if (user.username) {
      await pushNotification(hub, user.id, 'rare_drop', 'Rare Special drop!', `You won ${item.name} from ${c.name}.`);
    }
  }

  return {
    openingId: result.openingId,
    caseId: c.id,
    caseName: c.name,
    itemId: item.id,
    itemName: item.name,
    weapon: item.weapon,
    image: item.image,
    rarityTier: tier,
    floatValue: floatValue as number,
    wear: wear as string,
    stattrak,
    souvenir,
    pattern: item.pattern,
    phase,
    priceCents,
    costCents: c.costCents,
    instanceId: result.instanceId,
    seed,
  };
}

export function httpError(status: number, message: string): any {
  const e: any = new Error(message);
  e.statusCode = status;
  return e;
}

export async function refreshInventorySummary(userId: number): Promise<void> {
  await run(
    `INSERT INTO inventories (user_id, item_count, total_value_cents, updated_at)
     SELECT $1, COUNT(*), COALESCE(SUM(price_cents),0), now() FROM item_instances WHERE user_id = $1
     ON CONFLICT (user_id) DO UPDATE SET
       item_count = (SELECT COUNT(*) FROM item_instances WHERE user_id = $1),
       total_value_cents = (SELECT COALESCE(SUM(price_cents),0) FROM item_instances WHERE user_id = $1),
       updated_at = now()`,
    [userId],
  );
}

