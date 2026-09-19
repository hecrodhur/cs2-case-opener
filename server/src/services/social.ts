import { one, query, run, tx } from '../db.js';
import { httpError } from './opening.js';
import { RealtimeHub } from './realtime.js';
import { pushNotification } from './notify.js';

/** Adjust the recipient/sender inventory summary rows (count + value). */
async function bumpInventory(client: any, userId: number, deltaCount: number, deltaCents: number) {
  if (deltaCount === 0 && deltaCents === 0) return;
  if (deltaCount > 0) {
    await client.query(
      `INSERT INTO inventories (user_id, item_count, total_value_cents, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET item_count = inventories.item_count + $2,
         total_value_cents = inventories.total_value_cents + $3, updated_at = now()`,
      [userId, deltaCount, deltaCents],
    );
  } else {
    await client.query(
      'UPDATE inventories SET item_count = GREATEST(item_count + $2, 0), total_value_cents = GREATEST(total_value_cents + $3, 0), updated_at = now() WHERE user_id = $1',
      [userId, deltaCount, deltaCents],
    );
  }
}

// ---------------- friends ----------------

export async function requestFriend(hub: RealtimeHub, from: { id: number; username: string }, toUsername: string) {
  const to = await one<any>('SELECT id, username FROM users WHERE lower(username) = lower($1)', [toUsername]);
  if (!to) throw httpError(404, 'user not found');
  if (to.id === from.id) throw httpError(400, 'you cannot add yourself');
  const a = Math.min(from.id, to.id);
  const b = Math.max(from.id, to.id);
  const fr = await one<any>('SELECT 1 FROM friends WHERE a = $1 AND b = $2', [a, b]);
  if (fr) throw httpError(400, 'you are already friends');
  const pending = await one<any>(
    `SELECT id FROM friend_requests WHERE status = 'pending' AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))`,
    [from.id, to.id],
  );
  if (pending) throw httpError(400, 'a friend request is already pending');
  await run(
    `INSERT INTO friend_requests (from_id, to_id, status) VALUES ($1,$2,'pending')
     ON CONFLICT (from_id, to_id) DO UPDATE SET status = 'pending', created_at = now()`,
    [from.id, to.id],
  );
  await pushNotification(hub, to.id, 'friend_request', 'Friend request', `${from.username} wants to add you as a friend.`);
  return { ok: true };
}

export async function respondFriend(hub: RealtimeHub, user: { id: number; username: string }, requestId: number, accept: boolean) {
  const fromRow = await tx(async (client) => {
    const r = await client.query('SELECT * FROM friend_requests WHERE id = $1 FOR UPDATE', [requestId]);
    if (!r.rows.length) throw httpError(404, 'request not found');
    const row = r.rows[0];
    if (Number(row.to_id) !== user.id) throw httpError(403, 'not your request');
    if (row.status !== 'pending') throw httpError(400, 'request already resolved');
    const otherId = Number(row.from_id);
    const a = Math.min(user.id, otherId);
    const b = Math.max(user.id, otherId);
    if (accept) {
      await client.query('INSERT INTO friends (a, b) VALUES ($1,$2) ON CONFLICT DO NOTHING', [a, b]);
    }
    await client.query(`UPDATE friend_requests SET status = '${accept ? 'accepted' : 'declined'}', resolved_at = now() WHERE id = $1`, [requestId]);
    const from = (await client.query('SELECT id, username FROM users WHERE id = $1', [otherId])).rows[0];
    return from;
  });
  if (accept) {
    await pushNotification(hub, fromRow.id, 'friend', 'New friend', `You and ${user.username} are now friends.`);
  }
  return { ok: true, username: fromRow.username };
}

export async function listFriends(userId: number) {
  const rows = await query<any>(
    `SELECT u.id, u.username, u.avatar, f.created_at
     FROM friends f JOIN users u ON (u.id = f.a OR u.id = f.b) AND u.id != $1
     WHERE (f.a = $1 OR f.b = $1) ORDER BY u.username`,
    [userId],
  );
  return rows;
}

export async function pendingFriendRequests(userId: number) {
  const rows = await query<any>(
    `SELECT fr.id, fr.created_at, u.id AS from_id, u.username, u.avatar
     FROM friend_requests fr JOIN users u ON u.id = fr.from_id
     WHERE fr.to_id = $1 AND fr.status = 'pending' ORDER BY fr.created_at DESC`,
    [userId],
  );
  return rows;
}

// ---------------- gifts ----------------

export async function sendGift(hub: RealtimeHub, from: { id: number; username: string }, toUsername: string, instanceId: number) {
  const to = await one<any>('SELECT id, username FROM users WHERE lower(username) = lower($1)', [toUsername]);
  if (!to) throw httpError(404, 'user not found');
  if (to.id === from.id) throw httpError(400, 'you cannot gift to yourself');
  const isFriend = await one<any>('SELECT 1 AS ok FROM friends f WHERE ((f.a = $1 AND f.b = $2) OR (f.a = $2 AND f.b = $1))', [from.id, to.id]);
  if (!isFriend) throw httpError(403, 'you can only gift items to friends');

  const out = await tx(async (client) => {
    const inst = await client.query(
      'SELECT ii.*, i.name AS item_name FROM item_instances ii JOIN items i ON i.id = ii.item_id WHERE ii.id = $1 FOR UPDATE',
      [instanceId],
    );
    if (!inst.rows.length) throw httpError(404, 'item not found');
    const item = inst.rows[0];
    if (Number(item.user_id) !== from.id) throw httpError(403, 'not your item');
    if (item.listed) throw httpError(400, 'item is listed on the market');
    await client.query('UPDATE item_instances SET user_id = $2 WHERE id = $1', [instanceId, to.id]);
    await bumpInventory(client, from.id, -1, -Number(item.price_cents));
    await bumpInventory(client, to.id, +1, +Number(item.price_cents));
    return { name: item.item_name, valueCents: Number(item.price_cents) };
  });
  await pushNotification(hub, to.id, 'gift', 'You received a gift', `${from.username} sent you ${out.name} (${fmt(out.valueCents)}).`);
  return { ok: true };
}

// ---------------- trades ----------------

export async function createTradeOffer(hub: RealtimeHub, from: { id: number; username: string }, toUsername: string, myInstanceId: number, theirInstanceId: number | null) {
  const to = await one<any>('SELECT id, username FROM users WHERE lower(username) = lower($1)', [toUsername]);
  if (!to) throw httpError(404, 'user not found');
  if (to.id === from.id) throw httpError(400, 'you cannot trade with yourself');
  const isFriend = await one<any>('SELECT 1 AS ok FROM friends f WHERE ((f.a = $1 AND f.b = $2) OR (f.a = $2 AND f.b = $1))', [from.id, to.id]);
  if (!isFriend) throw httpError(403, 'you can only trade with friends');
  if (myInstanceId === theirInstanceId) throw httpError(400, 'you are offering the same item twice');

  await tx(async (client) => {
    const mine = await client.query('SELECT * FROM item_instances WHERE id = $1 FOR UPDATE', [myInstanceId]);
    if (!mine.rows.length) throw httpError(404, 'your item not found');
    if (Number(mine.rows[0].user_id) !== from.id) throw httpError(403, 'not your item');
    if (mine.rows[0].listed) throw httpError(400, 'your item is listed on the market');
    let theirs = null;
    if (theirInstanceId != null) {
      const t = await client.query('SELECT * FROM item_instances WHERE id = $1 FOR UPDATE', [theirInstanceId]);
      if (!t.rows.length) throw httpError(404, 'their item not found');
      if (Number(t.rows[0].user_id) !== to.id) throw httpError(403, 'their item not found');
      if (t.rows[0].listed) throw httpError(400, 'their item is listed on the market');
      theirs = t.rows[0];
    }
    await client.query(
      `INSERT INTO trade_offers (from_id, to_id, from_instance, to_instance, status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [from.id, to.id, myInstanceId, theirInstanceId],
    );
    return { ok: true };
  });
  await pushNotification(hub, to.id, 'trade', 'Trade offer', `${from.username} offered a trade.`);
  return { ok: true };
}

export async function respondTrade(hub: RealtimeHub, user: { id: number; username: string }, offerId: number, accept: boolean) {
  const out = await tx(async (client) => {
    const r = await client.query('SELECT * FROM trade_offers WHERE id = $1 FOR UPDATE', [offerId]);
    if (!r.rows.length) throw httpError(404, 'offer not found');
    const row = r.rows[0];
    if (Number(row.to_id) !== user.id) throw httpError(403, 'not your offer');
    if (row.status !== 'pending') throw httpError(400, 'offer already resolved');
    const fromId = Number(row.from_id);

    const instA = await client.query('SELECT * FROM item_instances WHERE id = $1 FOR UPDATE', [Number(row.from_instance)]);
    const instB = row.to_instance != null ? await client.query('SELECT * FROM item_instances WHERE id = $1 FOR UPDATE', [Number(row.to_instance)]) : null;
    if (!instA.rows.length) throw httpError(400, 'item from the offer is gone');
    if (Number(instA.rows[0].user_id) !== fromId) throw httpError(400, 'offer item is gone');
    if (instA.rows[0].listed) throw httpError(400, 'offer item is on the market');
    if (instB) {
      if (!instB.rows.length) throw httpError(400, 'your item from the offer is gone');
      if (Number(instB.rows[0].user_id) !== user.id) throw httpError(400, 'offer item is gone');
      if (instB.rows[0].listed) throw httpError(400, 'your item is on the market');
    }

    if (accept) {
      const a = instA.rows[0];
      const b = instB ? instB.rows[0] : null;
      await client.query('UPDATE item_instances SET user_id = $2 WHERE id = $1', [a.id, user.id]);
      if (b) await client.query('UPDATE item_instances SET user_id = $2 WHERE id = $1', [b.id, fromId]);
      await bumpInventory(client, user.id, 0, Number(a.price_cents) - (b ? Number(b.price_cents) : 0));
      await bumpInventory(client, fromId, 0, (b ? Number(b.price_cents) : 0) - Number(a.price_cents));
    }
    await client.query(`UPDATE trade_offers SET status = '${accept ? 'accepted' : 'declined'}', resolved_at = now() WHERE id = $1`, [offerId]);
    return { fromId, name: instA.rows[0].name, valueA: Number(instA.rows[0].price_cents) };
  });
  await pushNotification(hub, out.fromId, 'trade', accept ? 'Trade accepted' : 'Trade declined', `${user.username} ${accept ? 'accepted' : 'declined'} your trade offer of ${out.name}.`).catch(() => {});
  return { ok: true };
}

/** List a friend's items (friends only) so a trade can target one of them. */
export async function listFriendItems(from: { id: number }, toUsername: string) {
  const to = await one<any>('SELECT id, username FROM users WHERE lower(username) = lower($1)', [toUsername]);
  if (!to) throw httpError(404, 'user not found');
  if (to.id === from.id) throw httpError(400, 'you cannot trade with yourself');
  const isFriend = await one<any>('SELECT 1 AS ok FROM friends f WHERE ((f.a = $1 AND f.b = $2) OR (f.a = $2 AND f.b = $1))', [from.id, to.id]);
  if (!isFriend) throw httpError(403, 'not a friend yet');
  const rows = await query<any>(
    `SELECT ii.id, i.name AS item_name, ii.wear, ii.float_value, ii.price_cents, i.image, ii.rarity_tier, ii.stattrak
     FROM item_instances ii JOIN items i ON i.id = ii.item_id
     WHERE ii.user_id = $1 AND ii.listed = FALSE
     ORDER BY ii.price_cents DESC NULLS LAST LIMIT 100`,
    [to.id],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.item_name,
    image: r.image,
    rarityTier: r.rarity_tier,
    stattrak: r.stattrak,
    wear: r.wear,
    floatValue: r.float_value != null ? Number(r.float_value) : null,
    priceCents: Number(r.price_cents ?? 0),
  }));
}

export async function listTradeOffers(userId: number) {
  const rows = await query<any>(
    `SELECT t.id, t.status, t.created_at, t.from_instance, t.to_instance,
            CASE WHEN t.to_id = $1 THEN 'in' ELSE 'out' END AS direction,
            u.username AS from_username, u.avatar AS from_avatar,
            uf.username AS to_username, uf.avatar AS to_avatar,
            ima.name AS a_item_name, ima.image AS a_item_image, ia.price_cents AS a_item_value,
            imb.name AS b_item_name, imb.image AS b_item_image, ib.price_cents AS b_item_value
     FROM trade_offers t
     JOIN users u ON u.id = t.from_id
     LEFT JOIN users uf ON uf.id = t.to_id
     LEFT JOIN item_instances ia ON ia.id = t.from_instance
     LEFT JOIN items ima ON ima.id = ia.item_id
     LEFT JOIN item_instances ib ON ib.id = t.to_instance
     LEFT JOIN items imb ON imb.id = ib.item_id
     WHERE t.to_id = $1 OR t.from_id = $1
     ORDER BY t.created_at DESC LIMIT 50`,
    [userId],
  );
  return rows;
}

/** Sender cancels a pending outgoing offer. */
export async function cancelTrade(hub: RealtimeHub, user: { id: number; username: string }, offerId: number) {
  const out = await tx(async (client) => {
    const r = await client.query('SELECT * FROM trade_offers WHERE id = $1 FOR UPDATE', [offerId]);
    if (!r.rows.length) throw httpError(404, 'offer not found');
    const row = r.rows[0];
    if (Number(row.from_id) !== user.id) throw httpError(403, 'not your offer');
    if (row.status !== 'pending') throw httpError(400, 'offer already resolved');
    await client.query(`UPDATE trade_offers SET status = 'cancelled', resolved_at = now() WHERE id = $1`, [offerId]);
    return { toId: Number(row.to_id) };
  });
  await pushNotification(hub, out.toId, 'trade', 'Trade offer cancelled', `${user.username} cancelled their trade offer.`, { offerId }).catch(() => {});
  return { ok: true };
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
