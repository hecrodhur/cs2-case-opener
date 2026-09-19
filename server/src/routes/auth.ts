import { one, run, insert } from '../db.js';
import { hashPassword, verifyPassword, createSession } from '../services/auth.js';
import { getSettings } from '../services/global.js';
import { pushNotification } from '../services/notify.js';
import { route, json, authUser, httpError } from './index.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

route.get('/api/health', async () => json(200, { ok: true, ts: Date.now() }));

route.post('/api/auth/register', async (req, ctx) => {
  const { username, password } = (req.body ?? {}) as any;
  if (!USERNAME_RE.test(username ?? '')) {
    throw httpError(400, 'username must be 3-24 chars, letters/digits/underscore');
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
    throw httpError(400, 'password must be 6+ chars');
  }
  const exists = await one('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
  if (exists) throw httpError(409, 'username taken');

  const settings = await getSettings();
  const passHash = await hashPassword(password);
  const uid = await insert('INSERT INTO users (username, pass_hash, balance_cents) VALUES ($1,$2,$3)', [
    username.toLowerCase(),
    passHash,
    settings.welcomeBalanceCents,
  ]);
  await run('INSERT INTO inventories (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [uid]);
  const token = await createSession(uid);
  await pushNotification(ctx.hub, uid, 'welcome', 'Bienvenido', `Received $${(settings.welcomeBalanceCents / 100).toFixed(2)} virtual balance.`);
  return json(201, { token, user: { id: uid, username: username.toLowerCase(), balanceCents: settings.welcomeBalanceCents } });
});

route.post('/api/auth/login', async (req) => {
  const { username, password } = (req.body ?? {}) as any;
  const u = await one<any>('SELECT * FROM users WHERE username = $1', [String(username ?? '').toLowerCase()]);
  if (!u || !(await verifyPassword(String(password ?? ''), u.pass_hash))) {
    throw httpError(401, 'invalid credentials');
  }
  if (u.banned) throw httpError(403, 'account banned');
  const token = await createSession(u.id);
  return json(200, { token, user: { id: Number(u.id), username: u.username, role: u.role, balanceCents: Number(u.balance_cents) } });
});

route.post('/api/auth/logout', async (req) => {
  const h = req.headers.get('Authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) await run('DELETE FROM sessions WHERE token = $1', [token]);
  return json(200, { ok: true });
});

route.get('/api/auth/me', async (req) => {
  const user = await authUser(req);
  const inv = await one<any>('SELECT * FROM inventories WHERE user_id = $1', [user.id]);
  const stats = await one<any>(
    `SELECT COUNT(*) AS openings,
            COALESCE(SUM(cost_cents),0) AS spent,
            COALESCE(SUM(price_cents),0) AS earned,
            COALESCE(MAX(price_cents),0) AS best
     FROM openings WHERE user_id = $1`,
    [user.id],
  );
  return json(200, {
    id: Number(user.id),
    username: user.username,
    role: user.role,
    avatar: user.avatar ?? null,
    balanceCents: Number(user.balance_cents),
    banned: user.banned,
    settings: user.settings,
    inventory: { count: inv?.item_count ?? 0, valueCents: Number(inv?.total_value_cents ?? 0) },
    stats: {
      openings: Number(stats?.openings ?? 0),
      spentCents: Number(stats?.spent ?? 0),
      earnedCents: Number(stats?.earned ?? 0),
      bestDropCents: Number(stats?.best ?? 0),
    },
  });
});
