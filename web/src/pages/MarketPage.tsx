import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore, fmtCents, RARITY_META } from '../store';
import { ItemImage, ItemName, RarityBar } from '../components/ui';

export default function MarketPage() {
  const qc = useQueryClient();
  const { me } = useStore();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['market', search],
    queryFn: () => api.get<{ items: any[]; total: number }>(`/api/market?limit=200${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    refetchInterval: 15_000,
  });

  const items = data?.items ?? [];

  const buy = async (id: number) => {
    setError(null);
    try {
      await api.post(`/api/market/${id}/buy`, {});
      await qc.invalidateQueries({ queryKey: ['market'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
      await qc.invalidateQueries({ queryKey: ['inventory'] });
    } catch (e: any) {
      setError(e.message);
    }
  };

  const cancel = async (id: number) => {
    setError(null);
    try {
      await api.post(`/api/market/${id}/cancel`, {});
      await qc.invalidateQueries({ queryKey: ['market'] });
      await qc.invalidateQueries({ queryKey: ['inventory'] });
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Market</h1>
        <span className="muted">{data?.total ?? 0} active listings · 5% fee on sales</span>
      </div>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Search market..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {error && <div className="form-error">{error}</div>}
      {isLoading ? (
        <div className="page-loading">Loading market...</div>
      ) : items.length === 0 ? (
        <div className="empty">No active listings. List an item from your inventory.</div>
      ) : (
        <div className="item-grid">
          {items.map((it) => {
            const mine = me?.id === it.seller_id;
            return (
              <div
                key={it.id}
                className="item-card market-card"
                style={{ ['--rarity' as any]: RARITY_META[it.rarity_tier]?.color }}
              >
                <div className="item-card-img">
                  <ItemImage src={it.image} alt={it.name} />
                </div>
                <div className="item-card-body">
                  <ItemName name={it.name} stattrak={it.stattrak} souvenir={it.souvenir} />
                  <div className="item-card-sub">
                    {it.wear}{it.float_value ? ` · ${Number(it.float_value).toFixed(4)}` : ''}
                  </div>
                  <div className="market-seller">by {it.seller_name}</div>
                  <div className="market-row">
                    <b className="market-price">{fmtCents(Number(it.price_cents))}</b>
                    {me && !mine ? (
                      <button className="btn btn-primary btn-sm" onClick={() => buy(it.id)}>Buy</button>
                    ) : mine ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => cancel(it.id)}>Cancel</button>
                    ) : (
                      <span className="muted">owned</span>
                    )}
                  </div>
                </div>
                <RarityBar tier={it.rarity_tier} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
