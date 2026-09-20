import { query, one, run, js } from '../db.js';
import { getSettings } from './global.js';
import { config, getAdminPassword } from '../config.js';

const PBKDF2_ITERATIONS = 100_000;

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

async function deriveBits(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password).buffer as ArrayBuffer, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await deriveBits(plain, salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(h)}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  try {
    const expected = await deriveBits(plain, unb64(parts[2]));
    const actual = unb64(parts[3]);
    if (expected.length !== actual.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
    return diff === 0;
  } catch {
    return false;
  }
}

export function randomHex(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

export async function createSession(userId: number): Promise<string> {
  const token = randomHex(32);
  const expires = new Date(Date.now() + config.sessionDays * 864e5).toISOString();
  await run('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)', [token, userId, expires]);
  return token;
}

export async function userFromToken(token: string): Promise<any | null> {
  const row = await one<any>(
    `SELECT u.id, u.username, u.role, u.avatar, u.balance_cents, u.banned, u.settings,
            i.item_count, i.total_value_cents
     FROM users u
     JOIN sessions s ON s.user_id = u.id
     LEFT JOIN inventories i ON i.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [token],
  );
  if (!row) return null;
  const user: any = { ...row, id: Number(row.id), balance_cents: Number(row.balance_cents) };
  user.settings = js<Record<string, any>>(row.settings) ?? {};
  return user;
}

export function requireAdmin(user: any) {
  if (user.role !== 'admin') {
    const e: any = new Error('forbidden');
    e.statusCode = 403;
    throw e;
  }
  return user;
}

/** Create the default admin account (username "admin") when the table is empty. */
export async function seedAdmin(): Promise<void> {
  const existing = await one<any>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (existing) return;
  const settings = await getSettings();
  const hash = await hashPassword(getAdminPassword());
  await run(
    `INSERT INTO users (username, pass_hash, role, balance_cents)
     VALUES ('admin', $1, 'admin', $2)`,
    [hash, settings.welcomeBalanceCents],
  );
}
