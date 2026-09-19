import { run, one } from '../db.js';
import { httpError } from '../services/opening.js';
import { hashPassword, verifyPassword } from '../services/auth.js';
import {
  requestFriend, respondFriend, listFriends, pendingFriendRequests,
  sendGift, createTradeOffer, respondTrade, listTradeOffers, listFriendItems, cancelTrade,
} from '../services/social.js';
import { route, json, authUser } from './index.js';

const MIN_AVATAR_LEN = 10;
const MAX_AVATAR_LEN = 200_000; // ~150KB data URLs

// ---------- profile: username / avatar / password ----------
route.patch('/api/profile', async (req) => {
  const user = await authUser(req);
  const { username, avatar } = (req.body ?? {}) as any;
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
  return json(200, { ok: true, user: { ...u, id: Number(u.id) } });
});

route.post('/api/profile/password', async (req) => {
  const user = await authUser(req);
  const { currentPassword, newPassword } = (req.body ?? {}) as any;
  if (!currentPassword || !newPassword) throw httpError(400, 'passwords required');
  if (String(newPassword).length < 6) throw httpError(400, 'new password must be at least 6 chars');
  const u = await one<any>('SELECT pass_hash FROM users WHERE id = $1', [user.id]);
  if (!u || !(await verifyPassword(String(currentPassword), u.pass_hash))) throw httpError(401, 'current password is wrong');
  const h = await hashPassword(String(newPassword));
  await run('UPDATE users SET pass_hash = $2, updated_at = now() WHERE id = $1', [user.id, h]);
  return json(200, { ok: true });
});

// ---------- friends ----------
route.get('/api/friends', async (req) => {
  const user = await authUser(req);
  return json(200, await listFriends(user.id));
});

route.get('/api/friends/requests', async (req) => {
  const user = await authUser(req);
  return json(200, await pendingFriendRequests(user.id));
});

route.post('/api/friends/request', async (req, ctx) => {
  const user = await authUser(req);
  const { username } = (req.body ?? {}) as any;
  return json(200, await requestFriend(ctx.hub, user, String(username ?? '')));
});

route.post('/api/friends/:requestId/respond', async (req, ctx) => {
  const user = await authUser(req);
  const { accept } = (req.body ?? {}) as any;
  return json(200, await respondFriend(ctx.hub, user, Number(req.params.requestId), Boolean(accept)));
});

// list a friend's sellable items (friends only, used to pick a trade target)
route.get('/api/friends/items', async (req) => {
  const user = await authUser(req);
  return json(200, await listFriendItems(user, String(req.query.get('username') ?? '')));
});

// ---------- gifts ----------
route.post('/api/friends/gift', async (req, ctx) => {
  const user = await authUser(req);
  const { username, instanceId } = (req.body ?? {}) as any;
  return json(200, await sendGift(ctx.hub, user, String(username ?? ''), Number(instanceId)));
});

// ---------- trades ----------
route.get('/api/trades', async (req) => {
  const user = await authUser(req);
  return json(200, await listTradeOffers(user.id));
});

route.post('/api/trades', async (req, ctx) => {
  const user = await authUser(req);
  const { username, myInstanceId, theirInstanceId } = (req.body ?? {}) as any;
  return json(
    200,
    await createTradeOffer(
      ctx.hub, user, String(username ?? ''),
      Number(myInstanceId), theirInstanceId == null ? null : Number(theirInstanceId),
    ),
  );
});

route.post('/api/trades/:offerId/cancel', async (req, ctx) => {
  const user = await authUser(req);
  return json(200, await cancelTrade(ctx.hub, user, Number(req.params.offerId)));
});

route.post('/api/trades/:offerId/respond', async (req, ctx) => {
  const user = await authUser(req);
  const { accept } = (req.body ?? {}) as any;
  return json(200, await respondTrade(ctx.hub, user, Number(req.params.offerId), Boolean(accept)));
});
