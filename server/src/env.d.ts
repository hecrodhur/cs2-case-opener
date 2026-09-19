/**
 * Minimal ambient types for the Cloudflare Workers runtime so the project
 * compiles with plain @types/node (no @cloudflare/workers-types needed).
 * Local tests provide plain objects with the same shape.
 */
export interface D1Binding {
  prepare(sql: string): any;
  transaction(mode?: string): Promise<any>;
}

export interface RealtimeNamespace {
  idFromName(name: string): string;
  idFromString(value: string): string;
  get(id: string): any;
  getByName(name: string): any;
  newUniqueId(): string;
}

export interface Env {
  DB: any;
  RT: RealtimeNamespace;
  ASSETS?: { fetch(request: Request): Promise<Response> } | null;
  ADMIN_PASSWORD?: string;
  SEED_CATALOG?: string;
  RATE_LIMIT_SCALE?: string;
  WELCOME_BALANCE_CENTS?: string;
}

declare global {
  // provided by the Workers runtime (worker-configuration.d.ts equivalent)
  const WebSocketPair: { new (): [WebSocket, WebSocket] };
}
