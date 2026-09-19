import { FastifyInstance } from 'fastify';
import { createBattle, joinBattle, cancelBattle, lobbyBattles, myBattles, getBattle } from '../services/battles.js';

export async function registerBattleRoutes(app: FastifyInstance) {
  const authed = async (req: any, reply: any) => {
    const user = await app.getUser(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized' }), null;
    if (user.banned) return reply.code(403).send({ error: 'banned' }), null;
    return user;
  };

  app.get('/api/battles/lobby', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    return lobbyBattles(user.id);
  });

  app.get('/api/battles/mine', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    return myBattles(user.id);
  });

  app.post('/api/battles', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { caseIds, visibility, opponent } = (req.body ?? {}) as any;
    try {
      return await createBattle(
        (app as any).ctx.hub,
        user,
        caseIds ?? [],
        visibility === 'public' ? 'public' : 'private',
        opponent === 'bot' ? 'bot' : 'human',
      );
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  app.post('/api/battles/join', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const { code } = (req.body ?? {}) as any;
    try {
      return await joinBattle((app as any).ctx.hub, user, String(code ?? ''));
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  app.post('/api/battles/:id/cancel', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    try {
      return await cancelBattle((app as any).ctx.hub, user, Number(req.params.id));
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  app.get('/api/battles/:id', async (req: any, reply) => {
    const user = await authed(req, reply);
    if (!user) return;
    const b = await getBattle(user, Number(req.params.id));
    if (!b) return reply.code(404).send({ error: 'not found' });
    return b;
  });
}
