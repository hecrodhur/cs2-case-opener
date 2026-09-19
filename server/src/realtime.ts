import { runWithDb } from './db.js';
import { userFromToken } from './services/auth.js';
import type { Env } from './env.js';

/**
 * Realtime Durable Object: a single-instance message bus that holds the
 * WebSocket connections. The worker's Hub calls broadcast()/notifyUser()
 * through the stub; this object wakes up and pushes to the open sockets.
 *
 * Connections are authenticated with the same bearer token as the REST API
 * (passed as ?token= because browsers cannot set headers on WebSocket).
 * Message shape: { "event": <type>, "data": <payload> }
 */
export class Realtime {
  private all = new Set<WebSocket>();
  private byUser = new Map<number, Set<WebSocket>>();

  constructor(
    private state: { id: string; ctx: unknown },
    private env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('websocket upgrade required', { status: 400 });
    }
    let userId: number | null = null;
    const token = url.searchParams.get('token');
    if (token) {
      const user = await runWithDb(this.env.DB, () => userFromToken(token));
      userId = user ? Number(user.id) : null;
    }
    const [client, server] = new WebSocketPair();
    this.all.add(server);
    if (userId != null) {
      let set = this.byUser.get(userId);
      if (!set) {
        set = new Set();
        this.byUser.set(userId, set);
      }
      set.add(server);
    }
    server.addEventListener('close', () => {
      this.all.delete(server);
      if (userId != null) {
        const set = this.byUser.get(userId);
        set?.delete(server);
        if (set && !set.size) this.byUser.delete(userId);
      }
    });
    server.addEventListener('error', () => {
      this.all.delete(server);
    });
    return new Response(null, { status: 101, webSocket: server } as any);
  }

  async webSocketMessage(_ws: WebSocket, _msg: string | ArrayBuffer): Promise<void> {
    // client pings only; nothing to handle
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.all.delete(ws);
  }

  private send(ws: WebSocket, payload: string) {
    try {
      ws.send(payload);
    } catch {
      this.all.delete(ws);
    }
  }

  async broadcast(type: string, data: unknown): Promise<void> {
    const payload = JSON.stringify({ event: type, data });
    for (const ws of this.all) this.send(ws, payload);
  }

  async notifyUser(userId: number, type: string, data: unknown): Promise<void> {
    const set = this.byUser.get(Number(userId));
    if (!set) return;
    const payload = JSON.stringify({ event: type, data });
    for (const ws of set) this.send(ws, payload);
  }
}
