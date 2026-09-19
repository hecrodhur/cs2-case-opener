import { useEffect } from 'react';
import { useStore } from '../store';

export interface Drop {
  openingId: number;
  username: string | null;
  itemName: string;
  image: string | null;
  rarityTier: string;
  priceCents: number;
}

type TickerCb = (d: Drop) => void;

const tickerCbs = new Set<TickerCb>();
let es: EventSource | null = null;
let listeners = 0;
let authListenerInstalled = false;

function connect() {
  if (es) return;
  const token = localStorage.getItem('token');
  if (!token) return;
  es = new EventSource(`/api/realtime?token=${encodeURIComponent(token)}`);
  es.addEventListener('ticker', (e: MessageEvent) => {
    try {
      const d = JSON.parse(e.data) as Drop;
      tickerCbs.forEach((cb) => cb(d));
    } catch {
      // ignore malformed event
    }
  });
  es.addEventListener('user', () => useStore.getState().refresh().catch(() => {}));
  es.addEventListener('notify', () => useStore.getState().refreshNotifications().catch(() => {}));
  es.addEventListener('battles', () => useStore.setState((s) => ({ battlesTick: (s.battlesTick ?? 0) + 1 })));
}

function closeSocket() {
  if (es) {
    es.close();
    es = null;
  }
}

function ensureAuthListener() {
  if (authListenerInstalled) return;
  authListenerInstalled = true;
  window.addEventListener('auth-changed', () => {
    const hasToken = Boolean(localStorage.getItem('token'));
    if (!hasToken) closeSocket();
    else if (listeners > 0) connect();
  });
}

function disconnect() {
  listeners = Math.max(0, listeners - 1);
  if (listeners > 0) return;
  closeSocket();
}

/** Keep the shared SSE socket alive while mounted (Navbar does this). */
export function useRealtimeConnection() {
  useEffect(() => {
    listeners++;
    ensureAuthListener();
    connect();
    return () => disconnect();
  }, []);
}

/** Subscribe to live ticker drops. */
export function useRealtime(cb: TickerCb) {
  useEffect(() => {
    tickerCbs.add(cb);
    return () => {
      tickerCbs.delete(cb);
    };
  }, [cb]);
}
