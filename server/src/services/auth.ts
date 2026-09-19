import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { query, one, run, getPool } from '../db.js';
import { config } from '../config.js';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 32)) as Buffer;
  return `${salt}:${buf.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const buf = (await scryptAsync(password, salt, 32)) as Buffer;
  return timingSafeEqual(buf, Buffer.from(hash, 'hex'));
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + config.sessionDays * 86400_000);
  await run('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)', [token, userId, expires]);
  return token;
}

export async function userFromToken(token: string | null | undefined): Promise<any | null> {
  if (!token) return null;
  const row = await one<any>(
    `SELECT u.id, u.username, u.role, u.balance_cents, u.banned, u.settings, u.avatar
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  if (!row) return null;
  // pg returns bigint as string; keep ids numeric for JS comparisons
  return { ...row, id: Number(row.id), balance_cents: Number(row.balance_cents) };
}

export async function seedAdmin() {
  const existing = await one<any>('SELECT id FROM users WHERE username = $1', [config.adminUsername]);
  if (existing) return;
  const passHash = await hashPassword(config.adminPassword);
  await run(
    'INSERT INTO users (username, pass_hash, role, balance_cents) VALUES ($1,$2,$3,$4)',
    [config.adminUsername, passHash, 'admin', config.welcomeBalanceCents],
  );
  await run(
    'INSERT INTO audit_logs (action, target, detail) VALUES ($1,$2,$3::jsonb)',
    ['admin_seed', config.adminUsername, { note: 'admin account created at boot; change password via DB if deploying' }],
  );
}

export function requireLogin(user: any): any {
  if (!user) {
    const e: any = new Error('unauthorized');
    e.statusCode = 401;
    throw e;
  }
  if (user.banned) {
    const e: any = new Error('banned');
    e.statusCode = 403;
    throw e;
  }
  return user;
}

export function requireAdmin(user: any): any {
  requireLogin(user);
  if (user.role !== 'admin') {
    const e: any = new Error('forbidden');
    e.statusCode = 403;
    throw e;
  }
  return user;
}
