import { one, query, run, tx, js } from '../db.js';
import { hashPassword } from './auth.js';
import { refreshInventorySummary, loadCaseWithPools, rollDrop, persistDrop } from './opening.js';
import { estimatedValueCents, resolveSteamPrice } from '../util/value.js';
import { variantMhn } from '../util/marketHash.js';
import { rollFloat, wearFromFloat, makeSeed, rollInt } from '../util/rng.js';
import type { RarityTier } from 'shared';

/**
 * Admin console commands. Every command is validated and audited server-side;
 * the client never executes logic, it only submits the raw command string.
 */

export interface CmdResult {
  ok: boolean;
  output: string;
}

const HELP = `Commands:
  /help                          show this help
  /balance <user>                show user balance
  /setmoney <user> <amount>      set balance (dollars, e.g. 100 or 10.5)
  /give money <user> <amount>    add money (dollars)
  /give <user> <item name>       give an item (exact catalog name)
  /givecase <user> <case name>   give a case to the inventory
  /remove <user> <id|all>        remove inventory item by id, or all items
  /inventory <user>              list user inventory
  /price <item name>             show estimated value of an item
  /casecost <case name> <amount>  set case cost (dollars)
  /ban <user> | /unban <user>    ban / unban
  /stats                         server statistics
  /audit [n]                     last n audit entries (default 20)
  /password <new password>       change the admin password
  /delete <user>                 delete a user entirely (removes them from the leaderboard)
  /wipe <user>                   clear a user's openings + items (resets their leaderboard entry)
  /users [n]                     top n users by balance (default 10)
  /top [n]                       top n users by total opening value (default 10)
  /search <text>                 search catalog items by partial name
  /open <user> <case name>       open a case for a user (free drop)
  /caseinfo <case name>          case cost, probabilities and pool sizes
  /tx <user> [n]                 last n transactions of a user (default 10)`;

function moneyCents(s: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

function fmt(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

async function findUser(name: string): Promise<any | null> {
  return one<any>('SELECT * FROM users WHERE username = $1', [String(name ?? '').toLowerCase().trim()]);
}

async function findItem(name: string): Promise<any | null> {
  return one<any>('SELECT * FROM items WHERE name = $1 AND kind != \'case\'', [String(name ?? '').trim()]);
}

function instanceValueInput(r: any) {
  return {
    tier: (r.rarity_tier ?? 'mil_spec') as RarityTier,
    floatValue: r.float_value != null ? Number(r.float_value) : null,
    wear: r.wear,
    stattrak: Boolean(r.stattrak),
    souvenir: Boolean(r.souvenir),
    pattern: r.pattern,
    phase: r.phase,
    seed: r.seed,
  };
}

async function createInstanceFor(user: any, item: any): Promise<any> {
  return tx(async (c) => {
    const hasFloat = item.min_float != null && item.max_float != null && item.max_float > item.min_float;
    const floatValue = hasFloat ? rollFloat(Number(item.min_float), Number(item.max_float)) : null;
    const wear = floatValue != null ? wearFromFloat(floatValue) : null;
    const seed = makeSeed();
    const priceRows = (
      await c.query(
        'SELECT wear, stattrak, souvenir, lowest_price_cents FROM prices WHERE item_id = $1 AND lowest_price_cents IS NOT NULL',
        [item.id],
      )
    ).rows;
    const valueCents = estimatedValueCents(
      {
        tier: item.rarity_tier,
        floatValue,
        wear,
        stattrak: false,
        souvenir: false,
        pattern: item.pattern,
        phase: null,
        seed,
        category: item.category,
        exactMhn: variantMhn(item.name, { wear, stattrak: false, souvenir: false, glove: item.category === 'Gloves' }),
      },
      priceRows,
    );
    const id = await c.insert(
      `INSERT INTO item_instances
         (item_id, user_id, rarity_tier, float_value, wear, stattrak, souvenir, pattern, phase, seed, price_cents)
       VALUES ($1,$2,$3,$4,$5,FALSE,FALSE,$6,NULL,$7,$8)`,
      [item.id, user.id, item.rarity_tier, floatValue, wear, item.pattern, seed, valueCents],
    );
    await c.query(
      `INSERT INTO inventories (user_id, item_count, total_value_cents, updated_at)
       VALUES ($1, 1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET item_count = inventories.item_count + 1,
         total_value_cents = inventories.total_value_cents + $2, updated_at = now()`,
      [user.id, valueCents],
    );
    const row = await c.query('SELECT * FROM item_instances WHERE id = $1', [id]);
    return row.rows[0];
  });
}

async function audit(adminId: number, action: string, target: string, detail: unknown) {
  await run('INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)', [
    adminId,
    action,
    target,
    detail,
  ]);
}

export async function runAdminCommand(admin: { id: number }, raw: string): Promise<CmdResult> {
  const input = String(raw ?? '').trim();
  if (!input) return { ok: false, output: 'empty command' };
  const tokens = input.split(/\s+/);
  const cmd = tokens[0].toLowerCase();
  const args = tokens.slice(1);

  try {
    switch (cmd) {
      case '/help':
        return { ok: true, output: HELP };

      case '/balance': {
        if (!args[0]) return { ok: false, output: 'usage: /balance <user>' };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        await audit(admin.id, 'cmd_balance', u.username, {});
        return { ok: true, output: `${u.username}: ${fmt(Number(u.balance_cents))}` };
      }

      case '/setmoney': {
        if (!args[0] || args[1] == null) return { ok: false, output: 'usage: /setmoney <user> <amount>' };
        const cents = moneyCents(args[1]);
        if (cents == null || cents < 0) return { ok: false, output: 'invalid amount' };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        await run('UPDATE users SET balance_cents = $2, updated_at = now() WHERE id = $1', [u.id, cents]);
        await run(
          'INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)',
          [u.id, 'admin_set', cents - Number(u.balance_cents), cents, 'console:/setmoney'],
        );
        await audit(admin.id, 'cmd_setmoney', u.username, { cents });
        return { ok: true, output: `${u.username} balance set to ${fmt(cents)}` };
      }

      case '/give': {
        // /give money <user> <amount>
        if (args[0]?.toLowerCase() === 'money') {
          if (!args[1] || args[2] == null) return { ok: false, output: 'usage: /give money <user> <amount>' };
          const cents = moneyCents(args[2]);
          if (cents == null || cents <= 0) return { ok: false, output: 'invalid amount' };
          const u = await findUser(args[1]);
          if (!u) return { ok: false, output: `user "${args[1]}" not found` };
          await run('UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1', [u.id, cents]);
          await run(
            'INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)',
            [u.id, 'admin_give', cents, Number(u.balance_cents) + cents, 'console:/give money'],
          );
          await audit(admin.id, 'cmd_give_money', u.username, { cents });
          return { ok: true, output: `gave ${fmt(cents)} to ${u.username}` };
        }
        // /give <user> <item name...>
        const name = args[0];
        const itemName = args.slice(1).join(' ');
        if (!name || !itemName) return { ok: false, output: 'usage: /give <user> <item name>' };
        const u = await findUser(name);
        if (!u) return { ok: false, output: `user "${name}" not found` };
        const item = await findItem(itemName);
        if (!item) return { ok: false, output: `item "${itemName}" not in catalog` };
        const inst = await createInstanceFor(u, item);
        await refreshInventorySummary(u.id).catch(() => {});
        await audit(admin.id, 'cmd_give_item', u.username, { item: item.name, instanceId: inst.id });
        return { ok: true, output: `gave ${item.name} to ${u.username} (instance ${inst.id})` };
      }

      case '/givecase': {
        const name = args[0];
        const caseName = args.slice(1).join(' ');
        if (!name || !caseName) return { ok: false, output: 'usage: /givecase <user> <case name>' };
        const u = await findUser(name);
        if (!u) return { ok: false, output: `user "${name}" not found` };
        const item = await one<any>(`SELECT * FROM items WHERE kind = 'case' AND name ILIKE $1 LIMIT 1`, [`%${caseName}%`]);
        if (!item) return { ok: false, output: `case "${caseName}" not found` };
        const inst = await createInstanceFor(u, item);
        await refreshInventorySummary(u.id).catch(() => {});
        await audit(admin.id, 'cmd_give_case', u.username, { item: item.name, instanceId: inst.id });
        return { ok: true, output: `gave ${item.name} to ${u.username} (instance ${inst.id})` };
      }

      case '/remove': {
        const name = args[0];
        const what = args[1];
        if (!name || !what) return { ok: false, output: 'usage: /remove <user> <instance id | all>' };
        const u = await findUser(name);
        if (!u) return { ok: false, output: `user "${name}" not found` };
        if (what === 'all') {
          const rows = await query<any>('SELECT id FROM item_instances WHERE user_id = $1', [u.id]);
          for (const r of rows) {
            await run('UPDATE openings SET instance_id = NULL WHERE instance_id = $1', [r.id]);
            await run('DELETE FROM market_listings WHERE instance_id = $1', [r.id]);
            await run('DELETE FROM item_instances WHERE id = $1', [r.id]);
          }
          await refreshInventorySummary(u.id).catch(() => {});
          await audit(admin.id, 'cmd_remove_all', u.username, { count: rows.length });
          return { ok: true, output: `removed ${rows.length} items from ${u.username}` };
        }
        const id = Number(what);
        if (!Number.isInteger(id)) return { ok: false, output: 'invalid instance id' };
        const inst = await one<any>('SELECT * FROM item_instances WHERE id = $1 AND user_id = $2', [id, u.id]);
        if (!inst) return { ok: false, output: `instance ${id} not in ${u.username} inventory` };
        if (inst.listed) return { ok: false, output: 'item is listed on the market, cancel the listing first' };
        await run('UPDATE openings SET instance_id = NULL WHERE instance_id = $1', [id]);
        await run('DELETE FROM market_listings WHERE instance_id = $1', [id]);
        await run('DELETE FROM item_instances WHERE id = $1', [id]);
        await refreshInventorySummary(u.id).catch(() => {});
        await audit(admin.id, 'cmd_remove', u.username, { instanceId: id });
        return { ok: true, output: `removed instance ${id} from ${u.username}` };
      }

      case '/inventory': {
        if (!args[0]) return { ok: false, output: 'usage: /inventory <user>' };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        const rows = await query<any>(
          `SELECT ii.id, i.name, ii.wear, ii.float_value, ii.price_cents
           FROM item_instances ii JOIN items i ON i.id = ii.item_id
           WHERE ii.user_id = $1 ORDER BY ii.created_at DESC LIMIT 30`,
          [u.id],
        );
        if (!rows.length) return { ok: true, output: `${u.username} has no items` };
        const lines = rows.map(
          (r) => `#${r.id} ${r.name}${r.wear ? ` (${r.wear})` : ''} - ${fmt(r.price_cents ?? 0)}`,
        );
        await audit(admin.id, 'cmd_inventory', u.username, {});
        return { ok: true, output: lines.join('\n') };
      }

      case '/price': {
        const itemName = args.join(' ');
        if (!itemName) return { ok: false, output: 'usage: /price <item name>' };
        const item = await findItem(itemName);
        if (!item) return { ok: false, output: `item "${itemName}" not in catalog` };
        const rows = await resolveSteamPrice(item.id);
        const value = estimatedValueCents(
          { tier: item.rarity_tier, floatValue: null, wear: null, stattrak: false, souvenir: false, pattern: item.pattern, phase: null, seed: null, category: item.category, exactMhn: variantMhn(item.name, { wear: null, stattrak: false, souvenir: false, glove: item.category === 'Gloves' }) },
          rows ?? [],
        );
        const steam = rows?.length ? `Steam lowest ask: ${fmt(Math.min(...rows.map((r) => Number(r.lowest_price_cents))))}` : 'no Steam price yet';
        await audit(admin.id, 'cmd_price', item.name, {});
        return { ok: true, output: `${item.name}: estimated ${fmt(value)}\n${steam}` };
      }

      case '/casecost': {
        const amount = args[args.length - 1];
        const caseName = args.slice(0, -1).join(' ');
        const cents = moneyCents(amount);
        if (!caseName || cents == null || cents < 1) return { ok: false, output: 'usage: /casecost <case name> <amount>' };
        const c = await one<any>(`SELECT * FROM cases WHERE name ILIKE $1 LIMIT 1`, [`%${caseName}%`]);
        if (!c) return { ok: false, output: `case "${caseName}" not found` };
        await run('UPDATE cases SET cost_cents = $2, updated_at = now() WHERE id = $1', [c.id, cents]);
        await audit(admin.id, 'cmd_casecost', c.name, { cents });
        return { ok: true, output: `${c.name} cost set to ${fmt(cents)}` };
      }

      case '/ban':
      case '/unban': {
        if (!args[0]) return { ok: false, output: `usage: ${cmd} <user>` };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        if (u.role === 'admin') return { ok: false, output: 'cannot ban an admin' };
        const banned = cmd === '/ban';
        await run('UPDATE users SET banned = $2, updated_at = now() WHERE id = $1', [u.id, banned]);
        await run('DELETE FROM sessions WHERE user_id = $1', [u.id]);
        await audit(admin.id, banned ? 'cmd_ban' : 'cmd_unban', u.username, {});
        return { ok: true, output: `${u.username} ${banned ? 'banned' : 'unbanned'}` };
      }

      case '/stats': {
        const s = await one<any>(
          `SELECT (SELECT COUNT(*) FROM users)::int AS users,
                  (SELECT COUNT(*) FROM items WHERE kind != 'case')::int AS items,
                  (SELECT COUNT(*) FROM cases)::int AS cases,
                  (SELECT COUNT(*) FROM item_instances)::int AS instances,
                  (SELECT COUNT(*) FROM openings)::int AS openings,
                  (SELECT COALESCE(SUM(cost_cents),0)::bigint FROM openings) AS spent`,
        );
        await audit(admin.id, 'cmd_stats', 'server', {});
        return {
          ok: true,
          output:
            `users: ${s.users}\nitems: ${s.items}\ncases: ${s.cases}\ninstances: ${s.instances}\nopenings: ${s.openings}\ntotal spent: ${fmt(Number(s.spent))}`,
        };
      }

      case '/audit': {
        const n = Math.min(Math.max(Number(args[0]) || 20, 1), 100);
        const rows = await query<any>('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [n]);
        await audit(admin.id, 'cmd_audit', 'server', {});
        if (!rows.length) return { ok: true, output: 'no audit entries' };
        return {
          ok: true,
          output: rows.map((r) => `${new Date(r.created_at).toLocaleString()} ${r.action} ${r.target}`.trim()).join('\n'),
        };
      }

      case '/password': {
        const np = args.join(' ');
        if (!np || np.length < 6) return { ok: false, output: 'usage: /password <new password> (min 6 chars)' };
        const hash = await hashPassword(np);
        await run('UPDATE users SET pass_hash = $2, updated_at = now() WHERE id = $1', [admin.id, hash]);
        await audit(admin.id, 'cmd_password', 'admin', {});
        return { ok: true, output: 'admin password changed' }; }

      case '/delete': {
        if (!args[0]) return { ok: false, output: 'usage: /delete <user>' };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        if (u.role === 'admin') return { ok: false, output: 'cannot delete an admin' };
        if (Number(u.id) === admin.id) return { ok: false, output: 'cannot delete yourself' };
        await run('UPDATE market_listings SET sold_to = NULL WHERE sold_to = $1', [u.id]);
        await run('UPDATE audit_logs SET actor_user_id = NULL WHERE actor_user_id = $1', [u.id]);
        await run('DELETE FROM users WHERE id = $1', [u.id]);
        await audit(admin.id, 'cmd_delete', u.username, { userId: Number(u.id) });
        return { ok: true, output: `user ${u.username} deleted (account, items, history, leaderboard entry)` };
      }

      case '/wipe': {
        if (!args[0]) return { ok: false, output: 'usage: /wipe <user>' };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        if (u.role === 'admin') return { ok: false, output: 'cannot wipe an admin' };
        await run('UPDATE market_listings SET sold_to = NULL WHERE sold_to = $1', [u.id]);
        await run('DELETE FROM openings WHERE user_id = $1', [u.id]);
        const inst = await query<any>('SELECT id FROM item_instances WHERE user_id = $1', [u.id]);
        if (inst.length) {
          const ids = inst.map((r) => r.id);
          await run('DELETE FROM market_listings WHERE instance_id = ANY($1::bigint[])', [ids]);
          await run('DELETE FROM item_instances WHERE id = ANY($1::bigint[])', [ids]);
        }
        await refreshInventorySummary(u.id).catch(() => {});
        await audit(admin.id, 'cmd_wipe', u.username, { items: inst.length });
        return { ok: true, output: `wiped ${u.username}: openings + ${inst.length} items removed, balance kept` };
      }

      case '/users': {
        const n = Math.min(Math.max(Number(args[0]) || 10, 1), 50);
        const rows = await query<any>(
          'SELECT id, username, balance_cents, banned, role FROM users ORDER BY balance_cents DESC LIMIT $1',
          [n],
        );
        await audit(admin.id, 'cmd_users', 'server', {});
        return { ok: true, output: rows.map((r) => `#${r.id} ${r.username} - ${fmt(Number(r.balance_cents))}${r.banned ? ' (banned)' : ''}${r.role === 'admin' ? ' (admin)' : ''}`).join('\n') };
      }

      case '/top': {
        const n = Math.min(Math.max(Number(args[0]) || 10, 1), 50);
        const rows = await query<any>(
          `SELECT u.username, COUNT(o.id)::int AS openings, COALESCE(SUM(o.price_cents),0)::bigint AS value
           FROM users u JOIN openings o ON o.user_id = u.id
           GROUP BY u.id, u.username ORDER BY value DESC LIMIT $1`,
          [n],
        );
        await audit(admin.id, 'cmd_top', 'server', {});
        if (!rows.length) return { ok: true, output: 'no openings yet' };
        return { ok: true, output: rows.map((r, i) => `${i + 1}. ${r.username} - ${r.openings} openings, ${fmt(Number(r.value))} total`).join('\n') };
      }

      case '/search': {
        const text = args.join(' ');
        if (!text) return { ok: false, output: 'usage: /search <item name fragment>' };
        const rows = await query<any>(
          `SELECT id, name, rarity_tier, kind FROM items WHERE name ILIKE $1 AND kind != 'case' ORDER BY name LIMIT 10`,
          [`%${text}%`],
        );
        if (!rows.length) return { ok: true, output: `no items match "${text}"` };
        return { ok: true, output: rows.map((r) => `#${r.id} [${r.rarity_tier}] ${r.name}`).join('\n') };
      }

      case '/open': {
        const name = args[0];
        const caseName = args.slice(1).join(' ');
        if (!name || !caseName) return { ok: false, output: 'usage: /open <user> <case name>' };
        const u = await findUser(name);
        if (!u) return { ok: false, output: `user "${name}" not found` };
        const cRow = await one<any>(`SELECT id FROM cases WHERE name ILIKE $1 LIMIT 1`, [`%${caseName}%`]);
        if (!cRow) return { ok: false, output: `case "${caseName}" not found` };
        const c = await loadCaseWithPools(Number(cRow.id));
        if (!c) return { ok: false, output: 'case not found' };
        const d = await rollDrop(c);
        const res = await tx(async (client) => {
          const p = await persistDrop(client, Number(u.id), c, d, 0);
          return p;
        });
        await refreshInventorySummary(u.id).catch(() => {});
        await audit(admin.id, 'cmd_open', u.username, { case: c.name, item: d.item.name, instanceId: res.instanceId });
        return { ok: true, output: `opened ${c.name} for ${u.username}: ${d.item.name} (${fmt(d.priceCents)}, instance ${res.instanceId})` };
      }

      case '/caseinfo': {
        const caseName = args.join(' ');
        if (!caseName) return { ok: false, output: 'usage: /caseinfo <case name>' };
        const c = await one<any>(`SELECT * FROM cases WHERE name ILIKE $1 LIMIT 1`, [`%${caseName}%`]);
        if (!c) return { ok: false, output: `case "${caseName}" not found` };
        const pools = js(c.probabilities) ?? {};
        const counts = await query<any>(
          'SELECT p.tier, COUNT(DISTINCT pi.item_id)::int AS n FROM case_pools p JOIN case_pool_items pi ON pi.case_pool_id = p.id WHERE p.case_id = $1 GROUP BY p.tier',
          [c.id],
        );
        const lines = Object.entries(pools).map(([tier, p]) => {
          const n = counts.find((r) => r.tier === tier)?.n ?? 0;
          return `  ${tier}: ${(Number(p) * 100).toFixed(2)}% (${n} items)`;
        });
        await audit(admin.id, 'cmd_caseinfo', c.name, {});
        return { ok: true, output: `${c.name}\ncost: ${fmt(Number(c.cost_cents))}\n${lines.join('\n')}` };
      }

      case '/tx': {
        if (!args[0]) return { ok: false, output: 'usage: /tx <user> [n]' };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        const n = Math.min(Math.max(Number(args[1]) || 10, 1), 50);
        const rows = await query<any>(
          'SELECT created_at, kind, amount_cents, ref FROM transactions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2',
          [u.id, n],
        );
        await audit(admin.id, 'cmd_tx', u.username, {});
        if (!rows.length) return { ok: true, output: `${u.username} has no transactions` };
        return { ok: true, output: rows.map((r) => `${new Date(r.created_at).toLocaleString()} ${r.kind} ${Number(r.amount_cents) >= 0 ? '+' : ''}${fmt(Number(r.amount_cents))} (${r.ref})`).join('\n') };
      }

      default:
        return { ok: false, output: `unknown command "${cmd}". Try /help` };
    }
  } catch (e: any) {
    return { ok: false, output: `error: ${e.message}` };
  }
}
