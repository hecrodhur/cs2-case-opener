/**
 * In-process test harness: boots the real worker fetch handler against a
 * D1Shim (node:sqlite) database, no network involved. Requests are plain
 * `new Request('http://localhost/api/...')` objects.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { D1Shim, applyMigrations } from './d1shim.js';

export interface WorkerHandle {
  fetch: (req: Request) => Promise<Response>;
  db: DatabaseSync;
  withDb: <T>(fn: () => Promise<T>) => Promise<T>;
  stop: () => Promise<void>;
}

export async function startWorker(): Promise<WorkerHandle> {
  const { runWithDb } = await import('../db.js');
  const dir = mkdtempSync(join(tmpdir(), 'cs2-test-'));
  const db = new DatabaseSync(join(dir, 'test.db'));
  await applyMigrations(db);
  const shim = new D1Shim(db);
  const { default: worker } = await import('../worker.js');

  const env: any = {
    DB: shim,
    // DO stub: realtime fan-out is not exercised in API tests
    RT: {
      getByName: () => ({
        broadcast: async () => {},
        notifyUser: async () => {},
        fetch: async () => new Response('ws-stub', { status: 200 }),
      }),
    },
    ASSETS: null,
    ADMIN_PASSWORD: 'hola67',
  };

  return {
    fetch: (req: Request) => (worker as any).fetch(req, env, {}),
    db,
    withDb: (fn) => runWithDb(shim, fn),
    stop: async () => {
      try {
        db.close();
      } catch {}
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const H = (token: string | null): Record<string, string> => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
};

export async function register(handle: WorkerHandle, username: string): Promise<{ token: string; user: any }> {
  const r = await handle.fetch(
    new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: H(null),
      body: JSON.stringify({ username, password: 'pw123456' }),
    }),
  );
  if (r.status >= 300) throw new Error(`register failed: ${await r.text()}`);
  return r.json();
}

export async function post(
  handle: WorkerHandle,
  path: string,
  token: string | null,
  body: any = {},
): Promise<{ status: number; body?: any; text?: string }> {
  const r = await handle.fetch(
    new Request(`http://localhost${path}`, { method: 'POST', headers: H(token), body: JSON.stringify(body) }),
  );
  const text = await r.text();
  try {
    return { status: r.status, body: JSON.parse(text) };
  } catch {
    return { status: r.status, text };
  }
}

export async function get(handle: WorkerHandle, path: string, token?: string): Promise<any> {
  const r = await handle.fetch(new Request(`http://localhost${path}`, { headers: H(token ?? null) }));
  return r.json();
}
