import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';

const KIND_META: Record<string, { icon: string; label: string }> = {
  welcome: { icon: '👋', label: 'Welcome' },
  market: { icon: '🛒', label: 'Market' },
  battle: { icon: '⚔️', label: 'Battle' },
  trade: { icon: '🔄', label: 'Trade' },
  gift: { icon: '🎁', label: 'Gift' },
  friend: { icon: '👤', label: 'Friend' },
  friend_request: { icon: '👤', label: 'Friend' },
};

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function InboxPage() {
  const { notifications, unreadNotifications, refreshNotifications, markNotificationRead, markAllNotificationsRead } = useStore();
  const nav = useNavigate();

  useEffect(() => {
    refreshNotifications().catch(() => {});
  }, [refreshNotifications]);

  const actionFor = (n: any): { label: string; to: () => void } | null => {
    const meta = n.meta ?? {};
    if (n.kind === 'battle' && meta.battleId != null) {
      return { label: 'View battle', to: () => nav(`/battles?focus=${meta.battleId}`) };
    }
    if (n.kind === 'trade' || n.kind === 'gift') {
      return { label: 'View trades', to: () => nav('/friends') };
    }
    if (n.kind === 'friend_request') {
      return { label: 'View requests', to: () => nav('/friends') };
    }
    return null;
  };

  const open = (n: any) => {
    if (!n.read) markNotificationRead(Number(n.id)).catch(() => {});
    actionFor(n)?.to();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Inbox</h1>
        {unreadNotifications > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => markAllNotificationsRead().catch(() => {})}>
            Mark all as read
          </button>
        )}
      </div>
      {!notifications.length ? (
        <div className="empty">Nothing here yet. Battles, trades and gifts will show up in this inbox.</div>
      ) : (
        <div className="inbox-list">
          {notifications.map((n: any) => {
            const meta = KIND_META[n.kind] ?? { icon: '🔔', label: n.kind };
            const action = actionFor(n);
            return (
              <div key={Number(n.id)} className={`inbox-item ${n.read ? '' : 'inbox-unread'}`} onClick={() => open(n)}>
                <div className="inbox-icon">{meta.icon}</div>
                <div className="inbox-body">
                  <div className="inbox-title">
                    {n.title}
                    {!n.read && <span className="inbox-dot" />}
                  </div>
                  {n.body && <div className="inbox-text">{n.body}</div>}
                  <div className="inbox-time">{timeAgo(n.created_at)}</div>
                </div>
                {action && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!n.read) markNotificationRead(Number(n.id)).catch(() => {});
                      action.to();
                    }}
                  >
                    {action.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
