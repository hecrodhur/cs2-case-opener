import type { FastifyBaseLogger } from 'fastify';

/**
 * In-process SSE hub. For ~50 concurrent users a single-process in-memory
 * bus is more than enough and keeps deployment simple.
 */
export type SseListener = (event: string, data: unknown) => void;

export class RealtimeHub {
  private global = new Set<SseListener>();
  private users = new Map<number, Set<SseListener>>();
  private logger: any;

  constructor(logger?: any) {
    this.logger = logger ?? console;
  }

  subscribeGlobal(fn: SseListener): () => void {
    this.global.add(fn);
    return () => this.global.delete(fn);
  }

  subscribeUser(userId: number, fn: SseListener): () => void {
    let set = this.users.get(userId);
    if (!set) {
      set = new Set();
      this.users.set(userId, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (!set.size) this.users.delete(userId);
    };
  }

  broadcast(type: string, data: unknown) {
    const payload = JSON.stringify(data);
    for (const fn of this.global) {
      try {
        fn(type, payload);
      } catch (e) {
        this.logger.debug?.('sse global listener failed', e);
      }
    }
  }

  notifyUser(userId: number, type: string, data: unknown) {
    const set = this.users.get(userId);
    if (!set) return;
    const payload = JSON.stringify(data);
    for (const fn of set) {
      try {
        fn(type, payload);
      } catch {
        /* listener gone */
      }
    }
  }
}
