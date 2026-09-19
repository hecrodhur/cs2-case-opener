import { createBattle, joinBattle, cancelBattle, lobbyBattles, myBattles, getBattle } from '../services/battles.js';
import { route, json, authUser, httpError } from './index.js';

route.get('/api/battles/lobby', async (req) => {
  const user = await authUser(req);
  return json(200, await lobbyBattles(user.id));
});

route.get('/api/battles/mine', async (req) => {
  const user = await authUser(req);
  return json(200, await myBattles(user.id));
});

route.post('/api/battles', async (req, ctx) => {
  const user = await authUser(req);
  const { caseIds, visibility, opponent } = (req.body ?? {}) as any;
  return json(
    200,
    await createBattle(
      ctx.hub,
      user,
      caseIds ?? [],
      visibility === 'public' ? 'public' : 'private',
      opponent === 'bot' ? 'bot' : 'human',
    ),
  );
});

route.post('/api/battles/join', async (req, ctx) => {
  const user = await authUser(req);
  const { code } = (req.body ?? {}) as any;
  return json(200, await joinBattle(ctx.hub, user, String(code ?? '')));
});

route.post('/api/battles/:id/cancel', async (req, ctx) => {
  const user = await authUser(req);
  return json(200, await cancelBattle(ctx.hub, user, Number(req.params.id)));
});

route.get('/api/battles/:id', async (req) => {
  const user = await authUser(req);
  const b = await getBattle(user, Number(req.params.id));
  if (!b) throw httpError(404, 'not found');
  return json(200, b);
});
