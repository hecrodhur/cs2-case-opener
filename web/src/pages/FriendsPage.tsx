import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore, fmtCents, RARITY_META } from '../store';
import { ItemImage, useConfirm } from '../components/ui';

interface Friend {
  id: number;
  username: string;
  avatar: string | null;
}

function Avatar({ f, size = 36 }: { f: { username: string; avatar: string | null }; size?: number }) {
  return f.avatar
    ? <img className="avatar avatar-img" style={{ width: size, height: size }} src={f.avatar} alt={f.username} />
    : <span className="avatar" style={{ width: size, height: size }}>{f.username[0]?.toUpperCase()}</span>;
}

function ItemPicker({ title, items, selected, onSelect, onClose }: {
  title: string;
  items: any[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal item-picker" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>×</button>
        </div>
        {items.length === 0 ? (
          <div className="empty">No items available.</div>
        ) : (
          <div className="picker-grid">
            {items.map((it) => {
              const price = it.price_cents != null ? Number(it.price_cents) : it.priceCents;
              const img = it.image ?? null;
              const name = it.name ?? it.item_name;
              const id = Number(it.id);
              return (
                <button
                  key={id}
                  className={`picker-item ${selected === id ? 'picker-selected' : ''}`}
                  style={{ ['--rarity' as any]: (RARITY_META[it.rarity_tier ?? it.rarityTier] ?? RARITY_META.mil_spec).color }}
                  onClick={() => onSelect(id)}
                >
                  <ItemImage src={img} alt={name} className="picker-img" />
                  <span className="picker-name">{name}</span>
                  <span className="picker-price">{fmtCents(price)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FriendsPage() {
  const qc = useQueryClient();
  const { me } = useStore();
  const [addName, setAddName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [giftTo, setGiftTo] = useState<Friend | null>(null);
  const [tradeWith, setTradeWith] = useState<Friend | null>(null);
  const [myPick, setMyPick] = useState<number | null>(null);
  const [theirPick, setTheirPick] = useState<number | null>(null);
  const { node: confirmNode, confirm } = useConfirm();

  const { data: friends = [], refetch: refetchFriends } = useQuery({
    queryKey: ['friends'],
    queryFn: () => api.get<Friend[]>('/api/friends'),
    enabled: !!me,
    refetchInterval: 5000,
  });
  const { data: requests = [], refetch: refetchRequests } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: () => api.get<any[]>('/api/friends/requests'),
    enabled: !!me,
    refetchInterval: 5000,
  });
  const { data: trades = [], refetch: refetchTrades } = useQuery({
    queryKey: ['trades'],
    queryFn: () => api.get<any[]>('/api/trades'),
    enabled: !!me,
    refetchInterval: 5000,
  });
  const { data: myItems = [], refetch: refetchMyItems } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get<{ items: any[] }>('/api/inventory?limit=200').then((r) => r.items.filter((i) => !i.listed)),
    enabled: !!me,
  });
  const { data: friendItems = [], refetch: refetchFriendItems } = useQuery({
    queryKey: ['friend-items', tradeWith?.username],
    queryFn: () => api.get<any[]>(`/api/friends/items?username=${encodeURIComponent(tradeWith!.username)}`),
    enabled: !!me && !!tradeWith,
  });

  useEffect(() => {
    if (!giftTo) setMyPick(null);
  }, [giftTo]);

  const invalidate = async () => {
    await Promise.all([
      refetchFriends().catch(() => {}),
      refetchRequests().catch(() => {}),
      refetchTrades().catch(() => {}),
      qc.invalidateQueries({ queryKey: ['inventory'] }),
      qc.invalidateQueries({ queryKey: ['me'] }),
    ]);
  };

  if (!me) return <div className="page-error">Login to manage friends.</div>;

  const addFriend = async () => {
    setError(null);
    if (!addName.trim()) return;
    try {
      await api.post('/api/friends/request', { username: addName.trim() });
      setAddName('');
      await invalidate();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const respond = async (id: number, accept: boolean) => {
    setError(null);
    try {
      await api.post(`/api/friends/${id}/respond`, { accept });
      await invalidate();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const sendGift = async (pick?: number | null) => {
    const id = pick ?? myPick;
    if (!giftTo || id == null) return;
    setError(null);
    const item = myItems.find((i) => Number(i.id) === id);
    try {
      await api.post('/api/friends/gift', { username: giftTo.username, instanceId: id });
      setGiftTo(null);
      setMyPick(null);
      await invalidate();
      setError(null);
      window.dispatchEvent(new CustomEvent('toast', { detail: { ok: true, text: `Sent ${item?.name ?? 'item'} to ${giftTo.username}` } }));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const sendTrade = async () => {
    if (!tradeWith || myPick == null) return;
    setError(null);
    try {
      await api.post('/api/trades', {
        username: tradeWith.username,
        myInstanceId: myPick,
        theirInstanceId: theirPick,
      });
      setTradeWith(null);
      setMyPick(null);
      setTheirPick(null);
      await invalidate();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const respondTrade = async (id: number, accept: boolean) => {
    setError(null);
    try {
      await api.post(`/api/trades/${id}/respond`, { accept });
      await invalidate();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const cancelTrade = async (id: number) => {
    setError(null);
    if (!(await confirm('Cancel trade', 'Cancel this trade offer?', { confirmLabel: 'Cancel', danger: true }))) return;
    try {
      await api.post(`/api/trades/${id}/cancel`);
      await invalidate();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const pendingTrades = trades.filter((t) => t.status === 'pending');
  const resolvedTrades = trades.filter((t) => t.status !== 'pending').slice(0, 10);

  return (
    <div className="page">
      {confirmNode}
      <div className="page-head">
        <h1>Friends</h1>
        <div className="add-friend">
          <input
            className="input input-sm"
            placeholder="username"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addFriend()}
          />
          <button className="btn btn-primary btn-sm" onClick={() => void addFriend()}>Add friend</button>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}

      <section className="panel">
        <h2 className="panel-title">Friend requests</h2>
        {requests.length === 0 ? (
          <div className="muted pad">No pending requests.</div>
        ) : (
          <div className="friend-row-list">
            {requests.map((r: any) => (
              <div key={Number(r.id)} className="friend-row">
                <Avatar f={r} />
                <span className="friend-name">{r.username}</span>
                <span className="muted">wants to add you</span>
                <div className="row-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => void respond(Number(r.id), true)}>Accept</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => void respond(Number(r.id), false)}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">Friends ({friends.length})</h2>
        {friends.length === 0 ? (
          <div className="muted pad">No friends yet. Add someone by username above.</div>
        ) : (
          <div className="friend-row-list">
            {friends.map((f) => (
              <div key={Number(f.id)} className="friend-row">
                <Avatar f={f} />
                <span className="friend-name">{f.username}</span>
                <div className="row-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => { setGiftTo(f); setMyPick(null); }}>🎁 Gift</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setTradeWith(f); setMyPick(null); setTheirPick(null); }}>🔄 Trade</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">Trades</h2>
        {pendingTrades.length === 0 && resolvedTrades.length === 0 ? (
          <div className="muted pad">No trades yet. Pick a friend above to start one.</div>
        ) : (
          <div className="friend-row-list">
            {pendingTrades.map((t: any) => {
              const isIn = t.direction === 'in';
              const theirName = isIn ? t.from_username : t.to_username;
              const theirAvatar = isIn ? t.from_avatar : t.to_avatar;
              const mine = isIn ? { name: t.b_item_name, image: t.b_item_image, value: t.b_item_value } : { name: t.a_item_name, image: t.a_item_image, value: t.a_item_value };
              const theirs = isIn ? { name: t.a_item_name, image: t.a_item_image, value: t.a_item_value } : { name: t.b_item_name, image: t.b_item_image, value: t.b_item_value };
              return (
                <div key={Number(t.id)} className="friend-row trade-row">
                  <Avatar f={{ username: theirName, avatar: theirAvatar }} size={28} />
                  <span className="friend-name">{theirName}</span>
                  <span className="trade-arrow">
                    <span title="your item">{mine.name ?? '—'} {mine.value != null && <em>{fmtCents(Number(mine.value))}</em>}</span>
                    <span className="trade-swap">⇄</span>
                    <span title="their item">{theirs.name ?? '—'} {theirs.value != null && <em>{fmtCents(Number(theirs.value))}</em>}</span>
                  </span>
                  <div className="row-actions">
                    {isIn && <button className="btn btn-primary btn-sm" onClick={() => void respondTrade(Number(t.id), true)}>Accept</button>}
                    {isIn && <button className="btn btn-ghost btn-sm" onClick={() => void respondTrade(Number(t.id), false)}>Decline</button>}
                    {!isIn && <button className="btn btn-ghost btn-sm" onClick={() => void cancelTrade(Number(t.id))}>Cancel</button>}
                  </div>
                </div>
              );
            })}
            {resolvedTrades.map((t: any) => (
              <div key={Number(t.id)} className="friend-row trade-row trade-resolved">
                <span className="muted">{t.direction === 'in' ? t.from_username : t.to_username}</span>
                <span className="muted">{t.a_item_name} ⇄ {t.b_item_name ?? '—'}</span>
                <span className={`trade-status trade-${t.status}`}>{t.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {giftTo && (
        <ItemPicker
          title={`Gift an item to ${giftTo.username}`}
          items={myItems}
          selected={myPick}
          onSelect={(id) => {
            setMyPick(id);
            if (id != null) void sendGift(id);
          }}
          onClose={() => { setGiftTo(null); setMyPick(null); }}
        />
      )}

      {tradeWith && (
        <div className="modal-backdrop" onClick={() => { setTradeWith(null); setMyPick(null); setTheirPick(null); }}>
          <div className="modal trade-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Trade with {tradeWith.username}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setTradeWith(null); setMyPick(null); setTheirPick(null); }}>×</button>
            </div>
            <div className="trade-cols">
              <div className="trade-col">
                <h4>Your item {myPick != null && <button className="btn btn-ghost btn-xs" onClick={() => setMyPick(null)}>clear</button>}</h4>
                {myItems.length === 0 ? (
                  <div className="muted">No sellable items.</div>
                ) : (
                  <div className="trade-grid">
                    {myItems.map((it) => (
                      <button
                        key={Number(it.id)}
                        className={`trade-cell ${myPick === Number(it.id) ? 'trade-cell-on' : ''}`}
                        onClick={() => setMyPick(Number(it.id))}
                      >
                        <ItemImage src={it.image} alt={it.name} className="picker-img" />
                        <span className="trade-cell-name">{it.name}</span>
                        <span className="trade-cell-price">{fmtCents(it.price_cents)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="trade-col">
                <h4>Their item (optional) {theirPick != null && <button className="btn btn-ghost btn-xs" onClick={() => setTheirPick(null)}>clear</button>}</h4>
                {friendItems.length === 0 ? (
                  <div className="muted">They have no sellable items.</div>
                ) : (
                  <div className="trade-grid">
                    {friendItems.map((it) => (
                      <button
                        key={Number(it.id)}
                        className={`trade-cell ${theirPick === Number(it.id) ? 'trade-cell-on' : ''}`}
                        onClick={() => setTheirPick(Number(it.id))}
                      >
                        <ItemImage src={it.image} alt={it.name} className="picker-img" />
                        <span className="trade-cell-name">{it.name}</span>
                        <span className="trade-cell-price">{fmtCents(it.priceCents)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setTradeWith(null); setMyPick(null); setTheirPick(null); }}>Close</button>
              <button className="btn btn-primary" disabled={myPick == null} onClick={() => void sendTrade()}>Send trade offer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
