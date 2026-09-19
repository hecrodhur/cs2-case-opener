import { one, query, run, tx, js } from '../db.js';
import { rollDrop, persistDrop, httpError, refreshInventorySummary, type CaseWithPools } from './opening.js';
import { RealtimeHub } from './realtime.js';
import { pushNotification } from './notify.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const MAX_TIEBREAKS = 3;

function makeBattleCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return s;
}

export interface BattleView {
  id: number;
  code: string;
  creator: { id: number; username: string; avatar: string | null };
  opponent: { id: number; username: string; avatar: string | null } | null;
  opponentType: 'human' | 'bot';
  cases: { id: number; name: string; image: string | null; cost_cents: number }[];
  caseIds: number[];
  costCents: number;
  visibility: string;
  status: string;
  rounds: any[];
  totalA: number;
  totalB: number;
  tiebreaks: number;
  winnerId: number | null;
  rewardCents: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

function battleView(b: any): BattleView {
  const isBot = b.opponent_type === 'bot';
  return {
    id: Number(b.id),
    code: b.code,
    creator: { id: Number(b.creator_id), username: b.creator_username, avatar: b.creator_avatar },
    opponent: isBot
      ? { id: 0, username: 'Case Bot', avatar: null }
      : b.opponent_id
        ? { id: Number(b.opponent_id), username: b.opponent_username, avatar: b.opponent_avatar }
        : null,
    opponentType: isBot ? 'bot' : 'human',
    cases: (b.case_list as any[]) ?? [],
    caseIds: (Array.isArray(b.case_ids) ? b.case_ids : js<number[]>(b.case_ids)) ?? [],
    costCents: Number(b.cost_cents),
    visibility: b.visibility,
    status: b.status,
    rounds: (Array.isArray(b.rounds) ? b.rounds : js<any[]>(b.rounds)) ?? [],
    totalA: Number(b.total_a_cents),
    totalB: Number(b.total_b_cents),
    tiebreaks: b.tiebreaks,
    winnerId: b.winner_id != null ? Number(b.winner_id) : null,
    rewardCents: Number(b.reward_cents),
    createdAt: b.created_at,
    startedAt: b.started_at,
    finishedAt: b.finished_at,
  };
}

const BASE_SELECT = `
  SELECT b.*, u1.username AS creator_username, u1.avatar AS creator_avatar,
         u2.username AS opponent_username, u2.avatar AS opponent_avatar
  FROM battles b
  JOIN users u1 ON u1.id = b.creator_id
  LEFT JOIN users u2 ON u2.id = b.opponent_id`;

type Querier = { query(sql: string, params?: any[]): Promise<{ rows: any[] }> };

async function caseListFor(q: Querier, caseIds: number[]): Promise<any[]> {
  const out: any[] = [];
  for (const cid of caseIds) {
    const r = await q.query('SELECT id, name, image, cost_cents FROM cases WHERE id = $1', [cid]);
    if (r.rows[0]) out.push(r.rows[0]);
  }
  return out;
}

/** case_ids is stored as JSON text; normalize to {case_ids: number[], case_list: row[]} */
async function decorate(q: Querier, b: any): Promise<any> {
  const caseIds: number[] = Array.isArray(b.case_ids) ? b.case_ids : (js<number[]>(b.case_ids) ?? []);
  const case_list = await caseListFor(q, caseIds);
  return { ...b, case_ids: caseIds, case_list };
}

const globalQ: Querier = { query: (sql, params) => query<any>(sql, params).then((rows) => ({ rows })) };

async function loadBattleFull(client: any, idOrCode: number | string, byCode: boolean): Promise<any | null> {
  const where = byCode ? 'b.code = $1' : 'b.id = $1';
  const r = await client.query(`${BASE_SELECT} WHERE ${where}`, [idOrCode]);
  return r.rows[0] ? await decorate(client, r.rows[0]) : null;
}

async function loadCaseForTx(client: any, caseId: number): Promise<CaseWithPools | null> {
  const c = (await client.query('SELECT id, name, image, cost_cents, probabilities, active FROM cases WHERE id = $1', [caseId])).rows[0];
  if (!c) return null;
  const rows = (await client.query(
    'SELECT p.tier, pi.item_id AS id FROM case_pools p JOIN case_pool_items pi ON pi.case_pool_id = p.id WHERE p.case_id = $1',
    [caseId],
  )).rows;
  const pools: Record<string, number[]> = { mil_spec: [], restricted: [], classified: [], covert: [], rare_special: [] };
  for (const r of rows) if (r.tier in pools) pools[r.tier].push(r.id);
  return { ...c, probabilities: js(c.probabilities) ?? {}, costCents: c.cost_cents == null ? null : Number(c.cost_cents), pools: pools as any };
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface BattleOutcome {
  rounds: any[];
  instA: number[];
  instB: number[];
  totalA: number;
  totalB: number;
  tiebreaks: number;
}

/**
 * Roll every case for both players inside the caller's transaction.
 * botSideB: in bot battles the bot's drops become plain instances owned by
 * the player (no opening rows, no summary change) so a bot win can burn
 * them and a player win simply keeps them.
 */
async function generateBattle(client: any, caseDefs: CaseWithPools[], aId: number, bId: number, botSideB: boolean): Promise<BattleOutcome> {
  const rounds: any[] = [];
  const instA: number[] = [];
  const instB: number[] = [];
  let totalA = 0;
  let totalB = 0;

  const openRound = async (c: CaseWithPools, tiebreak: boolean) => {
    const da = await rollDrop(c);
    const db = await rollDrop(c);
    const ra = await persistDrop(client, aId, c, da, 0);
    let instBId: number;
    if (botSideB) {
      instBId = await client.insert(
        `INSERT INTO item_instances
           (item_id, user_id, rarity_tier, float_value, wear, stattrak, souvenir, pattern, phase, seed, price_cents, case_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [db.item.id, bId, db.tier, db.floatValue, db.wear, db.stattrak, db.souvenir, db.item.pattern, db.phase, db.seed, db.priceCents, c.id],
      );
    } else {
      instBId = (await persistDrop(client, bId, c, db, 0)).instanceId;
    }
    instA.push(ra.instanceId);
    instB.push(instBId);
    totalA += da.priceCents;
    totalB += db.priceCents;
    rounds.push({
      i: rounds.length,
      caseId: c.id,
      caseName: c.name,
      caseImage: c.image,
      tiebreak,
      a: {
        instanceId: ra.instanceId, itemName: da.item.name, weapon: da.item.weapon, image: da.item.image,
        rarityTier: da.tier, floatValue: da.floatValue, wear: da.wear, stattrak: da.stattrak,
        souvenir: da.souvenir, priceCents: da.priceCents,
      },
      b: {
        instanceId: instBId, itemName: db.item.name, weapon: db.item.weapon, image: db.item.image,
        rarityTier: db.tier, floatValue: db.floatValue, wear: db.wear, stattrak: db.stattrak,
        souvenir: db.souvenir, priceCents: db.priceCents,
      },
    });
  };

  for (const c of caseDefs) await openRound(c, false);

  let tiebreaks = 0;
  while (totalA === totalB && tiebreaks < MAX_TIEBREAKS) {
    await openRound(caseDefs[0], true);
    tiebreaks++;
  }
  return { rounds, instA, instB, totalA, totalB, tiebreaks };
}

/** Create a battle. The creator pays the total cost of every case up front. */
export async function createBattle(
  hub: RealtimeHub,
  user: { id: number },
  caseIds: number[],
  visibility: 'private' | 'public',
  opponent: 'human' | 'bot' = 'human',
) {
  const ids = caseIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) throw httpError(400, 'select at least one case');
  if (ids.length > 50) throw httpError(400, 'too many cases (max 50)');
  const isBot = opponent === 'bot';
  const uid = Number(user.id);

  let total = 0;
  for (const id of ids) {
    const c = await one<any>('SELECT cost_cents, active FROM cases WHERE id = $1', [id]);
    if (!c || !c.active) throw httpError(400, `case ${id} is not available`);
    if (c.cost_cents == null) throw httpError(400, `case ${id} has no price yet`);
    total += Number(c.cost_cents);
  }

  let botResult: { totalA: number; totalB: number } | null = null;
  const view = await tx(async (client) => {
    const u = await client.query('SELECT balance_cents, banned FROM users WHERE id = $1', [uid]);
    if (!u.rows.length) throw httpError(401, 'user gone');
    if (u.rows[0].banned) throw httpError(403, 'banned');
    const balBefore = Number(u.rows[0].balance_cents);
    const n = await client.update('UPDATE users SET balance_cents = balance_cents - $2, updated_at = now() WHERE id = $1 AND balance_cents >= $2', [uid, total]);
    if (!n) throw httpError(400, 'insufficient balance');
    await client.query(
      'INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)',
      [uid, 'battle_create', -total, balBefore - total, 'battle:pending'],
    );
    let code = makeBattleCode();
    let b: any = null;
    for (let i = 0; i < 5 && !b; i++) {
      try {
        const id = await client.insert(
          `INSERT INTO battles (code, creator_id, case_ids, cost_cents, visibility, opponent_type)
           VALUES ($1,$2,$3::bigint[],$4,$5,$6)`,
          [code, uid, ids, total, visibility, isBot ? 'bot' : 'human'],
        );
        b = await loadBattleFull(client, id, false);
      } catch (e) {
        if (i === 4) throw e;
        code = makeBattleCode();
      }
    }
    if (!b) throw httpError(500, 'could not create battle');

    if (isBot) {
      const caseDefs: CaseWithPools[] = [];
      for (const cid of ids) {
        const c = await loadCaseForTx(client, cid);
        if (!c) throw httpError(500, 'battle case missing from catalog');
        caseDefs.push(c);
      }
      const gen = await generateBattle(client, caseDefs, uid, uid, true);
      let winnerId: number | null = null;
      let rewardCents = 0;
      if (gen.totalA > gen.totalB) {
        // player beats the bot: keeps every item (own + bot side)
        winnerId = uid;
        rewardCents = gen.totalB;
      } else if (gen.totalB > gen.totalA) {
        // bot wins: nobody takes the prize, all items are burned
        const all = [...gen.instA, ...gen.instB];
        if (all.length) await client.query('DELETE FROM item_instances WHERE id = ANY($1::bigint[])', [all]);
      }
      await client.query(
        `UPDATE battles SET status = 'finished', rounds = $2::jsonb, total_a_cents = $3, total_b_cents = $4,
           tiebreaks = $5, winner_id = $6, reward_cents = $7, started_at = now(), finished_at = now()
         WHERE id = $1`,
        [b.id, JSON.stringify(gen.rounds), gen.totalA, gen.totalB, gen.tiebreaks, winnerId, rewardCents],
      );
      b = await loadBattleFull(client, b.id, false);
      botResult = { totalA: gen.totalA, totalB: gen.totalB };
    }
    return battleView(b);
  });

  if (isBot && botResult) {
    await refreshInventorySummary(uid).catch(() => {});
    const won = view.winnerId !== null;
    const text = won
      ? `You beat the bot ${fmt(view.totalA)} to ${fmt(view.totalB)} and kept all the items.`
      : view.totalA === view.totalB
        ? `Draw against the bot (${fmt(view.totalA)} - ${fmt(view.totalB)}): you kept your items.`
        : `The bot won ${fmt(view.totalB)} to ${fmt(view.totalA)}. All items were burned.`;
    await pushNotification(hub, uid, 'battle', 'Bot battle finished', text, { battleId: view.id }).catch(() => {});
  }

  await run('INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)', [
    uid, 'battle_create', `battle:${view.id}`, { code: view.code, cases: ids, cost: total, opponent },
  ]).catch(() => {});
  await hub.broadcast('battles', isBot ? { action: 'finished', battle: view } : { action: 'created', battle: view });
  return view;
}

/**
 * Join a waiting battle by code. One atomic transaction:
 *  - lock battle row (no double join, no race)
 *  - charge the joiner exactly the creator's cost
 *  - generate ALL rounds for both players with the normal RNG (no client input)
 *  - deterministic tiebreaks (up to MAX_TIEBREAKS sudden-death rounds, case 1)
 *  - winner takes all: loser instances transfer to the winner
 *  - status finished; nothing can be altered afterwards
 */
export async function joinBattle(hub: RealtimeHub, user: { id: number }, code: string): Promise<BattleView> {
  const joinerId = Number(user.id);
  const out = await tx(async (client) => {
    const b = await loadBattleFull(client, code.trim().toUpperCase(), true);
    if (!b) throw httpError(404, 'battle not found');
    if (b.status !== 'waiting') throw httpError(400, 'battle is not open');
    if (Number(b.creator_id) === joinerId) throw httpError(400, 'you created this battle');
    if (b.opponent_id != null) throw httpError(400, 'battle is full');
    const cost = Number(b.cost_cents);

    const u = await client.query('SELECT balance_cents, banned FROM users WHERE id = $1', [joinerId]);
    if (!u.rows.length) throw httpError(401, 'user gone');
    if (u.rows[0].banned) throw httpError(403, 'banned');
    const balBefore = Number(u.rows[0].balance_cents);
    // flip the slot first: exactly one joiner can win it
    const slot = await client.update('UPDATE battles SET opponent_id = $2 WHERE id = $1 AND opponent_id IS NULL', [b.id, joinerId]);
    if (!slot) throw httpError(400, 'battle is full');
    const n = await client.update('UPDATE users SET balance_cents = balance_cents - $2, updated_at = now() WHERE id = $1 AND balance_cents >= $2', [joinerId, cost]);
    if (!n) {
      await client.update('UPDATE battles SET opponent_id = NULL WHERE id = $1', [b.id]);
      throw httpError(400, 'insufficient balance');
    }
    await client.query(
      'INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)',
      [joinerId, 'battle_join', -cost, balBefore - cost, `battle:${b.id}`],
    );

    const caseDefs: CaseWithPools[] = [];
    for (const cid of b.case_ids) {
      const c = await loadCaseForTx(client, cid);
      if (!c) throw httpError(500, 'battle case missing from catalog');
      caseDefs.push(c);
    }

    const aId = Number(b.creator_id);
    const bId = joinerId;
    const gen = await generateBattle(client, caseDefs, aId, bId, false);

    let winnerId: number | null = null;
    let rewardCents = 0;
    if (gen.totalA > gen.totalB) {
      winnerId = aId;
      rewardCents = gen.totalB;
      if (gen.instB.length) await client.query('UPDATE item_instances SET user_id = $1 WHERE id = ANY($2::bigint[])', [aId, gen.instB]);
    } else if (gen.totalB > gen.totalA) {
      winnerId = bId;
      rewardCents = gen.totalA;
      if (gen.instA.length) await client.query('UPDATE item_instances SET user_id = $1 WHERE id = ANY($2::bigint[])', [bId, gen.instA]);
    }

    await client.query(
      `UPDATE battles SET opponent_id = $2, status = 'finished', rounds = $3::jsonb,
         total_a_cents = $4, total_b_cents = $5, tiebreaks = $6, winner_id = $7, reward_cents = $8,
         started_at = now(), finished_at = now()
       WHERE id = $1`,
      [b.id, bId, JSON.stringify(gen.rounds), gen.totalA, gen.totalB, gen.tiebreaks, winnerId, rewardCents],
    );
    return { battleId: Number(b.id), aId, bId, winnerId, rewardCents, totalA: gen.totalA, totalB: gen.totalB, tiebreaks: gen.tiebreaks };
  });

  const full = (await query<any>(`${BASE_SELECT} WHERE b.id = $1`, [out.battleId]))[0];
  const view = battleView(full ? await decorate(globalQ, full) : null);
  const text = (side: 'a' | 'b') => {
    const won = out.winnerId != null && Number(out.winnerId) === (side === 'a' ? out.aId : out.bId);
    const mine = side === 'a' ? out.totalA : out.totalB;
    const theirs = side === 'a' ? out.totalB : out.totalA;
    if (out.winnerId == null) return `Draw (${fmt(mine)} - ${fmt(theirs)}): each player keeps their items.`;
    if (won) return `You won ${fmt(mine)} vs ${fmt(theirs)} and took all the items!`;
    return `You lost ${fmt(mine)} vs ${fmt(theirs)}. The opponent took all the items.`;
  };
  await Promise.all([
    pushNotification(hub, out.aId, 'battle', 'Case battle finished', text('a'), { battleId: out.battleId }),
    pushNotification(hub, out.bId, 'battle', 'Case battle finished', text('b'), { battleId: out.battleId }),
  ]).catch(() => {});
  await Promise.all([refreshInventorySummary(out.aId), refreshInventorySummary(out.bId)]).catch(() => {});
  await run('INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)', [
    joinerId, 'battle_finish', `battle:${out.battleId}`,
    { winner: out.winnerId, reward: out.rewardCents, totalA: out.totalA, totalB: out.totalB, tiebreaks: out.tiebreaks },
  ]).catch(() => {});
  await hub.broadcast('battles', { action: 'finished', battle: view });
  return view;
}

/** Cancel a waiting battle (creator only): refunds the full cost. */
export async function cancelBattle(hub: RealtimeHub, user: { id: number }, battleId: number) {
  const out = await tx(async (client) => {
    const r = await client.query('SELECT * FROM battles WHERE id = $1 FOR UPDATE', [battleId]);
    if (!r.rows.length) throw httpError(404, 'battle not found');
    const row = r.rows[0];
    if (Number(row.creator_id) !== Number(user.id)) throw httpError(403, 'only the creator can cancel');
    if (row.status !== 'waiting') throw httpError(400, 'battle is not open');
    const cost = Number(row.cost_cents);
    const u = await client.query('SELECT balance_cents FROM users WHERE id = $1', [user.id]);
    // only the first cancel wins the flip; a join cannot sneak in between
    const flipped = await client.update("UPDATE battles SET status = 'cancelled', finished_at = now() WHERE id = $1 AND status = 'waiting'", [battleId]);
    if (!flipped) throw httpError(400, 'battle is not open');
    await client.query('UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1', [user.id, cost]);
    await client.query(
      'INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)',
      [user.id, 'battle_cancel_refund', cost, Number(u.rows[0].balance_cents) + cost, `battle:${battleId}`],
    );
    return { id: battleId, code: row.code, cost };
  });
  await run('INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)', [
    user.id, 'battle_cancel', `battle:${out.id}`, { code: out.code, refund: out.cost },
  ]).catch(() => {});
  await hub.broadcast('battles', { action: 'cancelled', battleId: out.id, code: out.code });
  return { ok: true };
}

export async function lobbyBattles(userId: number): Promise<BattleView[]> {
  const rows = await query<any>(
    `${BASE_SELECT} WHERE b.status = 'waiting' AND b.opponent_type = 'human' AND (b.visibility = 'public' OR b.creator_id = $1) ORDER BY b.created_at DESC LIMIT 100`,
    [userId],
  );
  const out: BattleView[] = [];
  for (const r of rows) out.push(battleView(await decorate(globalQ, r)));
  return out;
}

export async function myBattles(userId: number): Promise<BattleView[]> {
  const rows = await query<any>(
    `${BASE_SELECT} WHERE b.creator_id = $1 OR b.opponent_id = $1 ORDER BY b.created_at DESC LIMIT 100`,
    [userId],
  );
  const out: BattleView[] = [];
  for (const r of rows) out.push(battleView(await decorate(globalQ, r)));
  return out;
}

export async function getBattle(user: { id: number }, battleId: number): Promise<BattleView | null> {
  const rows = await query<any>(
    `${BASE_SELECT} WHERE b.id = $1 AND (b.creator_id = $2 OR b.opponent_id = $2)`,
    [battleId, user.id],
  );
  return rows.length ? battleView(await decorate(globalQ, rows[0])) : null;
}
