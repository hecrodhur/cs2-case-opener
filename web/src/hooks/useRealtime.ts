import { useEffect } from 'react';
import { useStore } from '../store';
import { API_BASE, getToken } from '../lib/api';

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
let ws: WebSocket | null = null;
let closing = false;
let listeners = 0;
let authListenerInstalled = false;
let reconnectDelay = 1000;

function wsUrl(): string | null {
  const token = getToken();
  if (!token) return null;
  let base = API_BASE;
  if (!base) {
    base = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  } else {
    base = base.replace(/^http/, 'ws');
  }
  return `${base}/api/realtime?token=${encodeURIComponent(token)}`;
}

function connect() {
  if (ws || closing) return;
  const url = wsUrl();
  if (!url) return;
  ws = new WebSocket(url);
  ws.onopen = () => {
    reconnectDelay = 1000;
  };
  ws.onmessage = (e: MessageEvent) => {
    let msg: { event: string; data: any };
    try {
      msg = JSON.parse(String(e.data));
    } catch {
      return;
    }
    switch (msg.event) {
      case 'drop':
        tickerCbs.forEach((cb) => cb(msg.data as Drop));
        break;
      case 'user':
        useStore.getState().refresh().catch(() => {});
        break;
      case 'notify':
        useStore.getState().refreshNotifications().catch(() => {});
        break;
      case 'battles':
        useStore.setState((s) => ({ battlesTick: (s.battlesTick ?? 0) + 1 }));
        break;
    }
  };
  ws.onclose = () => {
    ws = null;
    if (closing) return;
    if (listeners > 0 && getToken()) {
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 15000);
    }
  };
  ws.onerror = () => ws?.close();
}

function closeSocket() {
  closing = true;
  if (ws) {
    try {
      ws.close();
    } catch {
      // already closed
    }
    ws = null;
  }
  closing = false;
}

function ensureAuthListener() {
  if (authListenerInstalled) return;
  authListenerInstalled = true;
  window.addEventListener('auth-changed', () => {
    const hasToken = Boolean(getToken());
    if (!hasToken) closeSocket();
    else if (listeners > 0) connect();
  });
}

function disconnect() {
  listeners = Math.max(0, listeners - 1);
  if (listeners > 0) return;
  closeSocket();
}

/** Keep the shared WebSocket alive while mounted (Navbar does this). */
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
