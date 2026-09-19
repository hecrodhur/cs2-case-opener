import { create } from 'zustand';
import { api, setToken } from './lib/api';

export interface Me {
  id: number;
  username: string;
  avatar: string | null;
  role: string;
  balanceCents: number;
  banned: boolean;
  settings: Record<string, any> | null;
  inventory: { count: number; valueCents: number };
  stats: { openings: number; spentCents: number; earnedCents: number; bestDropCents: number };
}

interface State {
  me: Me | null;
  ready: boolean;
  notifications: any[];
  unreadNotifications: number;
  battlesTick: number;
  refresh: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: number) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  adoptToken: (token: string) => Promise<void>;
  setSetting: (key: string, value: any) => Promise<void>;
}

export const useStore = create<State>((set, get) => ({
  me: null,
  ready: false,
  notifications: [],
  unreadNotifications: 0,
  battlesTick: 0,
  refreshNotifications: async () => {
    try {
      const r = await api.get<{ items: any[]; unread: number }>('/api/notifications');
      set({ notifications: r.items, unreadNotifications: r.unread });
    } catch {
      // not logged in or transient error
    }
  },
  markNotificationRead: async (id) => {
    await api.post(`/api/notifications/${id}/read`).catch(() => {});
    set((s) => ({
      notifications: s.notifications.map((n: any) => (Number(n.id) === id ? { ...n, read: true } : n)),
      unreadNotifications: Math.max(0, s.unreadNotifications - 1),
    }));
  },
  markAllNotificationsRead: async () => {
    await api.post('/api/notifications/read').catch(() => {});
    set((s) => ({ notifications: s.notifications.map((n: any) => ({ ...n, read: true })), unreadNotifications: 0 }));
  },
  refresh: async () => {
    try {
      const me = await api.get<Me>('/api/auth/me');
      set({ me, ready: true });
    } catch {
      set({ me: null, ready: true });
    }
  },
  login: async (username, password) => {
    const r = await api.post<{ token: string }>('/api/auth/login', { username, password });
    setToken(r.token);
    await get().refresh();
  },
  register: async (username, password) => {
    const r = await api.post<{ token: string }>('/api/auth/register', { username, password });
    setToken(r.token);
    await get().refresh();
  },
  logout: async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {}
    setToken(null);
    set({ me: null, notifications: [], unreadNotifications: 0 });
  },
  adoptToken: async (token: string) => {
    setToken(token);
    await get().refresh();
  },
  setSetting: async (key, value) => {
    const me = get().me;
    if (!me) return;
    const settings = { ...(me.settings ?? {}), [key]: value };
    await api.patch('/api/profile/settings', { [key]: value });
    set({ me: { ...me, settings } });
  },
}));

export function fmtCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return '$' + (Number(cents) / 100).toFixed(2);
}

export const RARITY_META: Record<string, { label: string; color: string; glow: string }> = {
  mil_spec: { label: 'Mil-Spec', color: '#4b69ff', glow: 'rgba(75,105,255,0.45)' },
  restricted: { label: 'Restricted', color: '#8847ff', glow: 'rgba(136,71,255,0.45)' },
  classified: { label: 'Classified', color: '#d32ce6', glow: 'rgba(211,44,230,0.45)' },
  covert: { label: 'Covert', color: '#eb4b4b', glow: 'rgba(235,75,75,0.45)' },
  rare_special: { label: 'Gold', color: '#ffd700', glow: 'rgba(255,215,0,0.55)' },
  gold: { label: 'Gold', color: '#ffd700', glow: 'rgba(255,215,0,0.55)' },
};

// base reel duration in ms (before user speed adjustments)
export const REEL_BASE_MS = 9600;

/**
 * Reel speed setting: -100 = 2x slower, 0 = base, +1000 = 11x faster.
 */
export function reelDuration(speed: number): number {
  const s = Math.max(-100, Math.min(1000, Number(speed) || 0));
  if (s < 0) return REEL_BASE_MS * (1 + (-s) / 100);
  return REEL_BASE_MS / (1 + s / 100);
}
