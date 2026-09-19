import { FastifyInstance } from 'fastify';
import { hashPassword, verifyPassword, createSession } from '../services/auth.js';
import { query, one, run } from '../db.js';
import { getSettings } from '../services/global.js';
import { pushNotification } from '../services/notify.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (req, reply) => {
    const { username, password } = (req.body ?? {}) as any;
    if (!USERNAME_RE.test(username ?? '')) {
      return reply.code(400).send({ error: 'username must be 3-24 chars, letters/digits/underscore' });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
      return reply.code(400).send({ error: 'password must be 6+ chars' });
    }
    const exists = await one('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
    if (exists) return reply.code(409).send({ error: 'username taken' });

    const settings = await getSettings();
    const passHash = await hashPassword(password);
    const row = await one<any>(
      'INSERT INTO users (username, pass_hash, balance_cents) VALUES ($1,$2,$3) RETURNING id',
      [username.toLowerCase(), passHash, settings.welcomeBalanceCents],
    );
    await run(
      'INSERT INTO inventories (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [row.id],
    );
    const token = await createSession(row.id);
    const hub = (app as any).ctx.hub;
    await pushNotification(hub, row.id, 'welcome', 'Bienvenido', `Received $${(settings.welcomeBalanceCents / 100).toFixed(2)} virtual balance.`);
    return { token, user: { id: Number(row.id), username: username.toLowerCase(), balanceCents: settings.welcomeBalanceCents } };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { username, password } = (req.body ?? {}) as any;
    const u = await one<any>('SELECT * FROM users WHERE username = $1', [String(username ?? '').toLowerCase()]);
    if (!u || !(await verifyPassword(String(password ?? ''), u.pass_hash))) {
      return reply.code(401).send({ error: 'invalid credentials' });
    }
    if (u.banned) return reply.code(403).send({ error: 'account banned' });
    const token = await createSession(u.id);
    return { token, user: { id: Number(u.id), username: u.username, role: u.role, balanceCents: Number(u.balance_cents) } };
  });

  app.post('/api/auth/logout', async (req) => {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (token) await run('DELETE FROM sessions WHERE token = $1', [token]);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req, reply) => {
    const user = await app.getUser(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const inv = await one<any>('SELECT * FROM inventories WHERE user_id = $1', [user.id]);
    const stats = await one<any>(
      `SELECT COUNT(*)::int AS openings,
              COALESCE(SUM(cost_cents),0)::bigint AS spent,
              COALESCE(SUM(price_cents),0)::bigint AS earned,
              COALESCE(MAX(price_cents),0)::int AS best
       FROM openings WHERE user_id = $1`,
      [user.id],
    );
    return {
      id: Number(user.id),
      username: user.username,
      role: user.role,
      avatar: user.avatar ?? null,
      balanceCents: Number(user.balance_cents),
      banned: user.banned,
      settings: user.settings,
      inventory: { count: inv?.item_count ?? 0, valueCents: Number(inv?.total_value_cents ?? 0) },
      stats: {
        openings: stats?.openings ?? 0,
        spentCents: Number(stats?.spent ?? 0),
        earnedCents: Number(stats?.earned ?? 0),
        bestDropCents: stats?.best ?? 0,
      },
    };
  });
}
