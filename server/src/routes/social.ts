import { FastifyInstance } from 'fastify';
import { run, one } from '../db.js';
import { httpError } from '../services/opening.js';
import {
  requestFriend, respondFriend, listFriends, pendingFriendRequests,
  sendGift, createTradeOffer, respondTrade, listTradeOffers, listFriendItems, cancelTrade,
} from '../services/social.js';

const MIN_AVATAR_LEN = 10;
const MAX_AVATAR_LEN = 200_000; // ~150KB data URLs

export async function registerSocialRoutes(app: FastifyInstance) {
  const authed = async (req: any, reply: any) => {
    const user = await app.getUser(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized' }), null;
    if (user.banned) return reply.code(403).send({ error: 'banned' }), null;
    return user;
  };

  // ---------- profile: username / avatar / password ----------
  app.patch('/api/profile', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { username, avatar } = (req.body ?? {}) as any;
    try {
      if (username != null) {
        const name = String(username).trim();
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) throw httpError(400, 'username must be 3-20 chars (letters, numbers, _)');
        const clash = await one<any>('SELECT id FROM users WHERE lower(username) = lower($1) AND id <> $2', [name, user.id]);
        if (clash) throw httpError(409, 'username is taken');
        await run('UPDATE users SET username = $2, updated_at = now() WHERE id = $1', [user.id, name]);
      }
      if (avatar !== undefined) {
        if (avatar === null) {
          await run('UPDATE users SET avatar = NULL WHERE id = $1', [user.id]);
        } else {
          const a = String(avatar);
          if (a.length < MIN_AVATAR_LEN || a.length > MAX_AVATAR_LEN || !a.startsWith('data:image/')) {
            throw httpError(400, 'avatar must be a small image (data URL)');
          }
          await run('UPDATE users SET avatar = $2 WHERE id = $1', [user.id, a]);
        }
      }
      const u = await one<any>('SELECT id, username, avatar, role FROM users WHERE id = $1', [user.id]);
      return { ok: true, user: u };
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  app.post('/api/profile/password', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { currentPassword, newPassword } = (req.body ?? {}) as any;
    try {
      const { hashPassword, verifyPassword } = await import('../services/auth.js');
      if (!currentPassword || !newPassword) throw httpError(400, 'passwords required');
      if (String(newPassword).length < 6) throw httpError(400, 'new password must be at least 6 chars');
      const u = await one<any>('SELECT pass_hash FROM users WHERE id = $1', [user.id]);
      if (!u || !(await verifyPassword(String(currentPassword), u.pass_hash))) throw httpError(401, 'current password is wrong');
      const h = await hashPassword(String(newPassword));
      await run('UPDATE users SET pass_hash = $2, updated_at = now() WHERE id = $1', [user.id, h]);
      return { ok: true };
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  // ---------- friends ----------
  app.get('/api/friends', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    return listFriends(user.id);
  });

  app.get('/api/friends/requests', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    return pendingFriendRequests(user.id);
  });

  app.post('/api/friends/request', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { username } = (req.body ?? {}) as any;
    try {
      return await requestFriend((app as any).ctx.hub, user, String(username ?? ''));
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  app.post('/api/friends/:requestId/respond', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { accept } = (req.body ?? {}) as any;
    try {
      return await respondFriend((app as any).ctx.hub, user, Number(req.params.requestId), Boolean(accept));
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  // list a friend's sellable items (friends only, used to pick a trade target)
  app.get('/api/friends/items', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    try {
      return await listFriendItems(user, String((req.query as any).username ?? ''));
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  // ---------- gifts ----------
  app.post('/api/friends/gift', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { username, instanceId } = (req.body ?? {}) as any;
    try {
      return await sendGift((app as any).ctx.hub, user, String(username ?? ''), Number(instanceId));
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  // ---------- trades ----------
  app.get('/api/trades', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    return listTradeOffers(user.id);
  });

  app.post('/api/trades', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { username, myInstanceId, theirInstanceId } = (req.body ?? {}) as any;
    try {
      return await createTradeOffer(
        (app as any).ctx.hub, user, String(username ?? ''),
        Number(myInstanceId), theirInstanceId == null ? null : Number(theirInstanceId),
      );
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  app.post('/api/trades/:offerId/cancel', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    try {
      return await cancelTrade((app as any).ctx.hub, user, Number(req.params.offerId));
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  app.post('/api/trades/:offerId/respond', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { accept } = (req.body ?? {}) as any;
    try {
      return await respondTrade((app as any).ctx.hub, user, Number(req.params.offerId), Boolean(accept));
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });
}
