import { tx } from '../db.js';
import { getSettings } from './global.js';
import { RealtimeHub } from './realtime.js';
import { pushNotification } from './notify.js';
import { httpError, refreshInventorySummary } from './opening.js';
import { estimatedValueCents } from '../util/value.js';
import { variantMhn } from '../util/marketHash.js';

export interface QuickSellResult {
  saleCents: number;
  valueCents: number;
  itemName: string;
}

/** Same as quickSellItem but for a batch of instances, credited in one transaction. */
export async function quickSellMany(
  hub: RealtimeHub,
  userId: number,
  instanceIds: number[],
): Promise<{ saleCents: number; count: number; names: string[] }> {
  const ids = [...new Set(instanceIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) throw httpError(400, 'select at least one item');
  if (ids.length > 500) throw httpError(400, 'too many items');
  const settings = await getSettings();
  const out = await tx(async (c) => {
    const rows = (await c.query(
      `SELECT ii.*, i.name AS item_name, i.category
       FROM item_instances ii JOIN items i ON i.id = ii.item_id
       WHERE ii.id = ANY($1::bigint[])`,
      [ids],
    )).rows;
    if (rows.length !== ids.length) throw httpError(400, 'one or more items no longer exist');
    for (const r of rows) {
      if (Number(r.user_id) !== userId) throw httpError(403, 'one of the items is not yours');
      if (r.listed) throw httpError(400, `${r.item_name} is listed on the market, cancel the listing first`);
    }
    // detach opening history BEFORE the delete: the FK cascade would wipe it
    await c.query('UPDATE openings SET instance_id = NULL WHERE instance_id = ANY($1::bigint[])', [ids]);
    // delete first: only one quick-sell can win each item
    const n = await c.update('DELETE FROM item_instances WHERE id = ANY($1::bigint[]) AND user_id = $2 AND listed = FALSE', [ids, userId]);
    if (n !== ids.length) throw httpError(400, 'one or more items are no longer sellable');

    let saleCents = 0;
    const names: string[] = [];
    for (const row of rows) {
      const priceRows = (
        await c.query(
          'SELECT wear, stattrak, souvenir, lowest_price_cents FROM prices WHERE item_id = $1 AND lowest_price_cents IS NOT NULL',
          [row.item_id],
        )
      ).rows;
      const valueCents = estimatedValueCents(
        {
          tier: row.rarity_tier,
          floatValue: row.float_value != null ? Number(row.float_value) : null,
          wear: row.wear,
          stattrak: Boolean(row.stattrak),
          souvenir: Boolean(row.souvenir),
          pattern: row.pattern,
          phase: row.phase,
          seed: row.seed,
          category: row.category,
          exactMhn: variantMhn(row.item_name, { wear: row.wear, stattrak: row.stattrak, souvenir: row.souvenir, glove: row.category === 'Gloves' }),
        },
        priceRows,
      );
      saleCents += Math.max(1, Math.round((valueCents * settings.quickSellPct) / 100));
      names.push(row.item_name);
    }

    const bal = (await c.query('SELECT balance_cents FROM users WHERE id = $1', [userId])).rows[0].balance_cents;
    await c.query('UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1', [userId, saleCents]);
    const before = Number(bal);
    await c.query(
      'INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)',
      [userId, 'quick_sell', saleCents, before + saleCents, `instances:${ids.length}`],
    );
    await c.query('UPDATE openings SET instance_id = NULL WHERE instance_id = ANY($1::bigint[])', [ids]);
    await c.query('DELETE FROM market_listings WHERE instance_id = ANY($1::bigint[])', [ids]);
    return { saleCents, count: rows.length, names };
  });
  await pushNotification(
    hub,
    userId,
    'market',
    'Quick sell',
    `Sold ${out.count} item${out.count === 1 ? '' : 's'} for $${(out.saleCents / 100).toFixed(2)}`,
  ).catch(() => {});
  await refreshInventorySummary(userId).catch(() => {});
  return out;
}

/**
 * Instant sell for quickSellPct of the item value (default 90%).
 * The instance is locked (FOR UPDATE) so quick sell cannot race with a
 * market listing or a market buy of the same item.
 */
export async function quickSellItem(
  hub: RealtimeHub,
  userId: number,
  instanceId: number,
): Promise<QuickSellResult> {
  const settings = await getSettings();
  const out = await tx(async (c) => {
    const inst = await c.query(
      `SELECT ii.*, i.name AS item_name, i.category
       FROM item_instances ii JOIN items i ON i.id = ii.item_id
       WHERE ii.id = $1`,
      [instanceId],
    );
    if (!inst.rows.length) throw httpError(404, 'item not found');
    const row: any = inst.rows[0];
    if (Number(row.user_id) !== userId) throw httpError(403, 'not your item');
    if (row.listed) throw httpError(400, 'item is listed on the market, cancel the listing first');

    // detach opening history BEFORE the delete: the FK cascade would wipe it
    await c.query('UPDATE openings SET instance_id = NULL WHERE instance_id = $1', [instanceId]);
    // delete first: only one quick-sell can win the item
    const n = await c.update('DELETE FROM item_instances WHERE id = $1 AND user_id = $2 AND listed = FALSE', [instanceId, userId]);
    if (!n) throw httpError(400, 'item no longer sellable');

    const priceRows = (
      await c.query(
        'SELECT wear, stattrak, souvenir, lowest_price_cents FROM prices WHERE item_id = $1 AND lowest_price_cents IS NOT NULL',
        [row.item_id],
      )
    ).rows;
    const valueCents = estimatedValueCents(
      {
        tier: row.rarity_tier,
        floatValue: row.float_value != null ? Number(row.float_value) : null,
        wear: row.wear,
        stattrak: Boolean(row.stattrak),
        souvenir: Boolean(row.souvenir),
        pattern: row.pattern,
        phase: row.phase,
        seed: row.seed,
        category: row.category,
        exactMhn: variantMhn(row.item_name, { wear: row.wear, stattrak: row.stattrak, souvenir: row.souvenir, glove: row.category === 'Gloves' }),
      },
      priceRows,
    );
    const saleCents = Math.max(1, Math.round((valueCents * settings.quickSellPct) / 100));

    await c.query(
      'UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1',
      [userId, saleCents],
    );
    await c.query(
      'INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)',
      [userId, 'quick_sell', saleCents, (await c.query('SELECT balance_cents FROM users WHERE id = $1', [userId])).rows[0].balance_cents, `instance:${instanceId}`],
    );
    await c.query('DELETE FROM market_listings WHERE instance_id = $1', [instanceId]);

    return { saleCents, valueCents, itemName: row.item_name };
  });

  await pushNotification(
    hub,
    userId,
    'market',
    'Quick sell',
    `Sold ${out.itemName} for $${(out.saleCents / 100).toFixed(2)}`,
  ).catch(() => {});
  await refreshInventorySummary(userId).catch(() => {});
  return out;
}
