import type { RealtimeNamespace } from '../env.js';

/**
 * In-request realtime hub. Every event is forwarded to the Realtime Durable
 * Object, which pushes it to the connected WebSockets. Stub calls are
 * fire-and-forget: a realtime failure must never break the API response.
 */
export class RealtimeHub {
  constructor(private ns: RealtimeNamespace) {}

  private get do() {
    return this.ns.getByName('rt');
  }

  broadcast(type: string, data: unknown): Promise<void> {
    return this.do.broadcast(type, data).catch(() => {});
  }

  notifyUser(userId: number, type: string, data: unknown): Promise<void> {
    return this.do.notifyUser(userId, type, data).catch(() => {});
  }
}
