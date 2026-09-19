import { FastifyInstance } from 'fastify';
import { userFromToken } from '../services/auth.js';

export async function registerRealtimeRoute(app: FastifyInstance) {
  app.get('/api/realtime', async (req, reply) => {
    const token = ((req.query as any).token as string | undefined) ?? extractBearer(req);
    const user = token ? await userFromToken(token) : null;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write('retry: 3000\n\n');
    const send = (event: string, data: string) => {
      reply.raw.write(`event: ${event}\ndata: ${data}\n\n`);
    };
    const hub = (app as any).ctx.hub;
    const unsubs = [hub.subscribeGlobal(send)];
    if (user) unsubs.push(hub.subscribeUser(user.id, send));
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => {
      clearInterval(ping);
      for (const u of unsubs) u();
    });
    // hold the handler
    return;
  });
}

function extractBearer(req: any): string | null {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
