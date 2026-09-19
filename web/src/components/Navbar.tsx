import { useEffect } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useStore, fmtCents } from '../store';
import { useRealtimeConnection } from '../hooks/useRealtime';
import { setSoundEnabled } from '../lib/sound';

const NAV = [
  { to: '/inventory', label: 'Inventory' },
  { to: '/battles', label: 'Battles' },
  { to: '/market', label: 'Market' },
  { to: '/friends', label: 'Friends' },
  { to: '/history', label: 'History' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/admin', label: 'Admin' },
];

export default function Navbar() {
  const { me, ready, refresh, logout, notifications, unreadNotifications, refreshNotifications } = useStore();
  const nav = useNavigate();
  useRealtimeConnection();

  useEffect(() => {
    if (me) refreshNotifications().catch(() => {});
  }, [me?.username, refreshNotifications]);

  useEffect(() => {
    if (!ready) refresh();
  }, [ready, refresh]);

  useEffect(() => {
    setSoundEnabled(Boolean(me?.settings?.sound));
  }, [me?.settings?.sound]);

  useEffect(() => {
    const onAuth = () => setTimeout(refresh, 50);
    window.addEventListener('auth-changed', onAuth);
    const iv = setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener('auth-changed', onAuth);
      clearInterval(iv);
    };
  }, [refresh]);

  return (
    <header className="navbar">
      <div className="nav-inner">
        <Link to="/" className="brand">
          <span className="brand-icon">▣</span> CS2 <span className="brand-accent">CASE OPENER</span>
        </Link>
        <nav className="nav-links">
          <NavLink to="/" end>Cases</NavLink>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="nav-right">
          {me ? (
            <>
              <Link to="/inbox" className="bell-chip" title="Inbox">
                <span className="bell-ico">&#9993;</span>
                {unreadNotifications > 0 && <span className="bell-badge">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}
              </Link>
              <div className="balance-chip" title="Virtual balance">
                <span className="balance-ico">◈</span> {fmtCents(me.balanceCents)}
              </div>
              <Link to="/profile" className="user-chip">
                {me.avatar
                  ? <img className="avatar avatar-img" src={me.avatar} alt={me.username} />
                  : <span className="avatar">{me.username[0]?.toUpperCase()}</span>}
                <span className="user-name">{me.username}</span>
              </Link>
              <button className="btn btn-ghost btn-sm" onClick={async () => { await logout(); nav('/'); }}>
                Logout
              </button>
            </>
          ) : (
            <Link to="/auth" className="btn btn-primary btn-sm">Login / Register</Link>
          )}
        </div>
      </div>
    </header>
  );
}
