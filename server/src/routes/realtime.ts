import { route } from './index.js';

/**
 * Realtime endpoint. The WebSocket upgrade is proxied (via stub.fetch) to the
 * Realtime Durable Object, which owns the socket, authenticates it with the
 * ?token= query param and pushes events to it.
 */
route.get('/api/realtime', async (req, ctx) => {
  return await (ctx.env.RT.getByName('rt') as any).fetch(req.raw);
});
