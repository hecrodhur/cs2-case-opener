import { one, tx, query } from '../db.js';
import { getSettings } from './global.js';
import { RealtimeHub } from './realtime.js';
import { pushNotification } from './notify.js';
import { httpError } from './opening.js';

export async function createListing(userId: number, instanceId: number, priceCents: number): Promise<any> {
  if (!Number.isInteger(priceCents) || priceCents < 1 || priceCents > 100_000_000) {
    throw httpError(400, 'invalid price');
  }
  // ownership + "already listed" are checked inside the tx on the locked row
  // so concurrent list/buy/sell of the same instance cannot race
  const l = await tx(async (c) => {
    const inst = await c.query('SELECT * FROM item_instances WHERE id = $1 FOR UPDATE', [instanceId]);
    if (!inst.rows.length || Number(inst.rows[0].user_id) !== userId) throw httpError(404, 'instance not found');
    const existing = await c.query(
      "SELECT id FROM market_listings WHERE instance_id = $1 AND status = 'active'",
      [instanceId],
    );
    if (existing.rows.length) throw httpError(400, 'item already listed');
    const id = await c.insert(
      "INSERT INTO market_listings (instance_id, seller_id, price_cents, status) VALUES ($1,$2,$3,'active')",
      [instanceId, userId, priceCents],
    );
    await c.query('UPDATE item_instances SET listed = TRUE WHERE id = $1', [instanceId]);
    const row = await c.query('SELECT * FROM market_listings WHERE id = $1', [id]);
    return row.rows[0];
  });
  return l;
}

export async function cancelListing(userId: number, listingId: number) {
  const l = await one<any>("SELECT * FROM market_listings WHERE id = $1 AND status = 'active'", [listingId]);
  if (!l) throw httpError(404, 'listing not found');
  if (l.seller_id !== userId) throw httpError(403, 'not your listing');
  await tx(async (c) => {
    await c.query("UPDATE market_listings SET status = 'cancelled' WHERE id = $1", [listingId]);
    await c.query('UPDATE item_instances SET listed = FALSE WHERE id = $1', [l.instance_id]);
  });
}

export async function buyListing(hub: RealtimeHub, buyerId: number, listingId: number) {
  const settings = await getSettings();
  const result = await tx(async (c) => {
    const l = await c.query("SELECT * FROM market_listings WHERE id = $1 AND status = 'active' FOR UPDATE", [listingId]);
    if (!l.rows.length) throw httpError(404, 'listing not found or sold');
    const listing = l.rows[0];
    if (listing.seller_id === buyerId) throw httpError(400, 'cannot buy your own listing');

    const buyer = await c.query('SELECT id, username, balance_cents FROM users WHERE id = $1', [buyerId]);
    if (!buyer.rows.length) throw httpError(401, 'user gone');
    const price = Number(listing.price_cents);

    const inst = await c.query('SELECT * FROM item_instances WHERE id = $1', [listing.instance_id]);
    if (!inst.rows.length) throw httpError(404, 'item gone');

    const fee = Math.round((price * settings.marketFeePct) / 100);
    const sellerNet = price - fee;

    const seller = await c.query('SELECT id, username FROM users WHERE id = $1', [listing.seller_id]);
    if (!seller.rows.length) throw httpError(400, 'seller gone');

    // conditional charge + status flip: only one buyer can win the flip
    const charged = await c.update('UPDATE users SET balance_cents = balance_cents - $2, updated_at = now() WHERE id = $1 AND balance_cents >= $2', [buyerId, price]);
    if (!charged) throw httpError(400, 'insufficient balance');
    const flipped = await c.update("UPDATE market_listings SET status = 'sold', sold_to = $2, sold_at = now() WHERE id = $1 AND status = 'active'", [listingId, buyerId]);
    if (!flipped) throw httpError(400, 'listing not found or sold');
    const newBuyerBalance = Number(buyer.rows[0].balance_cents) - price;
    await c.query('UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1', [
      listing.seller_id,
      sellerNet,
    ]);
    await c.query('UPDATE item_instances SET user_id = $2, listed = FALSE WHERE id = $1', [listing.instance_id, buyerId]);
    await c.query(
      'INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)',
      [buyerId, 'market_buy', -price, newBuyerBalance, `listing:${listingId}`],
    );
    await c.query('INSERT INTO transactions (user_id, kind, amount_cents, ref) VALUES ($1,$2,$3,$4)', [
      listing.seller_id,
      'market_sell',
      sellerNet,
      `listing:${listingId}`,
    ]);
    await c.query('INSERT INTO transactions (user_id, kind, amount_cents, ref) VALUES ($1,$2,$3,$4)', [
      listing.seller_id,
      'market_fee',
      -fee,
      `listing:${listingId}`,
    ]);

    const item = await c.query('SELECT name FROM items i WHERE i.id = $1', [inst.rows[0].item_id]);
    return {
      price,
      fee,
      sellerNet,
      sellerId: listing.seller_id,
      item: item.rows[0]?.name ?? 'item',
      listingId,
    };
  });

  await pushNotification(hub, result.sellerId, 'market', 'Item sold', `${result.item} sold for $${(result.price / 100).toFixed(2)} (fee $${(result.fee / 100).toFixed(2)})`).catch(() => {});
  await pushNotification(hub, buyerId, 'market', 'Purchase complete', `${result.item} added to your inventory`).catch(() => {});
  hub.broadcast('market', { event: 'sold', item: result.item, priceCents: result.price, listingId: result.listingId });
  return result;
}

export async function listMarket(limit = 48, offset = 0, search?: string) {
  const lim = Math.min(Math.max(limit, 1), 200);
  const off = Math.max(offset, 0);
  const where: string[] = ["ml.status = 'active'"];
  const params: any[] = [];
  if (search) {
    params.push(`%${search}%`);
    where.push(`i.name ILIKE $${params.length}`);
  }
  params.push(lim, off);
  const rows = await query<any>(
    `SELECT ml.id, ml.price_cents, ml.created_at, ml.instance_id, ml.seller_id,
            u.username AS seller_name,
            i.name, i.weapon, i.category, i.image, i.pattern,
            ii.rarity_tier, ii.float_value, ii.wear, ii.stattrak, ii.souvenir
     FROM market_listings ml
     JOIN item_instances ii ON ii.id = ml.instance_id
     JOIN items i ON i.id = ii.item_id
     JOIN users u ON u.id = ml.seller_id
     WHERE ${where.join(' AND ')}
     ORDER BY ml.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}::int`,
    params,
  );
  const total = await one<any>(
    `SELECT COUNT(*)::int AS n FROM market_listings ml
     JOIN item_instances ii ON ii.id = ml.instance_id
     JOIN items i ON i.id = ii.item_id
     WHERE ${where.join(' AND ')}`,
    params.slice(0, search ? 1 : 0),
  );
  return { items: rows, total: total?.n ?? 0 };
}
