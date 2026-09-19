import { run, one } from '../db.js';
import { RealtimeHub } from './realtime.js';

export async function pushNotification(
  hub: RealtimeHub,
  userId: number,
  kind: string,
  title: string,
  body: string | null = null,
  meta: Record<string, unknown> | null = null,
) {
  await run('INSERT INTO notifications (user_id, kind, title, body, meta) VALUES ($1,$2,$3,$4,$5)', [
    userId, kind, title, body, meta ? JSON.stringify(meta) : null,
  ]);
  const n = await one<any>(
    'SELECT id, kind, title, body, meta, read, created_at FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
    [userId],
  );
  if (n) hub.notifyUser(userId, 'notify', n);
}
