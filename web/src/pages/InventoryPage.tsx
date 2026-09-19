import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore, fmtCents } from '../store';
import { ItemCard, useConfirm } from '../components/ui';
import InspectModal from '../components/InspectModal';
import { sell as sellSound } from '../lib/sound';

export default function InventoryPage() {
  const qc = useQueryClient();
  const { me } = useStore();
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const [listing, setListing] = useState<number | null>(null);
  const [price, setPrice] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [inspect, setInspect] = useState<any | null>(null);
  const [soldMsg, setSoldMsg] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selling, setSelling] = useState(false);
  const { node: confirmNode, confirm } = useConfirm();

  const { data: globalSettings } = useQuery({
    queryKey: ['global-settings'],
    queryFn: () => api.get<any>('/api/global/settings'),
    enabled: !!me,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', sort, search],
    queryFn: () =>
      api.get<{ items: any[]; total: number }>(
        `/api/inventory?limit=200&sort=${sort}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
    enabled: !!me,
  });

  if (!me) return <div className="page-error">Login to view your inventory.</div>;

  const items = data?.items ?? [];

  const list = async (instanceId: number) => {
    setError(null);
    try {
      await api.post('/api/market/list', { instanceId, priceCents: price });
      setListing(null);
      await qc.invalidateQueries({ queryKey: ['market'] });
    } catch (e: any) {
      setError(e.message);
    }
  };

  const sellMany = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    const pct = Number(globalSettings?.quickSellPct ?? 90);
    const total = ids.reduce((a, id) => {
      const it = items.find((x) => Number(x.id) === id);
      return a + (it ? Math.max(1, Math.round((Number(it.price_cents ?? 0) * pct) / 100)) : 0);
    }, 0);
    if (!(me.settings?.skipQuickSellConfirm ?? true) && !(await confirm('Quick sell', `Sell ${ids.length} item${ids.length === 1 ? '' : 's'} for ${fmtCents(total)}?`, { confirmLabel: 'Sell', danger: true }))) return;
    setSelling(true);
    try {
      const r = await api.post<any>('/api/inventory/sell-many', { instanceIds: ids });
      setSoldMsg(`Sold ${r.count} item${r.count === 1 ? '' : 's'} for ${fmtCents(r.saleCents)}`);
      setTimeout(() => setSoldMsg(null), 5000);
      sellSound();
      setSelected(new Set());
      setSelectMode(false);
      await qc.invalidateQueries({ queryKey: ['inventory'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e: any) {
      setError(e.message);
    }
    setSelling(false);
  };

  const quickSell = async (it: any) => {
    const pct = Number(globalSettings?.quickSellPct ?? 90);
    const val = Math.max(1, Math.round((Number(it.price_cents ?? 0) * pct) / 100));
    if (!(me.settings?.skipQuickSellConfirm ?? true) && !(await confirm('Quick sell', `Sell ${it.name} for ${fmtCents(val)}?`, { confirmLabel: 'Sell', danger: true }))) return;
    try {
      const r = await api.post<any>(`/api/inventory/${it.id}/sell`);
      setSoldMsg(`Sold ${it.name} for ${fmtCents(r.saleCents)}`);
      setTimeout(() => setSoldMsg(null), 4000);
      sellSound();
      setInspect(null);
      await qc.invalidateQueries({ queryKey: ['inventory'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="page">
      {confirmNode}
      <div className="page-head">
        <h1>Inventory</h1>
        <div className="inv-summary">
          <span>{items.length} items</span>
          <span className="muted">value {fmtCents(items.reduce((a, i) => a + Number(i.price_cents ?? 0), 0))}</span>
        </div>
      </div>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest</option>
          <option value="price_desc">Price (high to low)</option>
          <option value="price_asc">Price (low to high)</option>
          <option value="float_asc">Float (low to high)</option>
          <option value="name">Name</option>
        </select>
        <button
          className={`btn btn-sm ${selectMode ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setSelectMode((v) => !v); if (selectMode) setSelected(new Set()); }}
        >
          {selectMode ? 'Done selecting' : 'Select items'}
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {isLoading ? (
        <div className="page-loading">Loading...</div>
      ) : items.length === 0 ? (
        <div className="empty">No items yet. Open a case to start collecting.</div>
      ) : (
        <div className="item-grid">
          {items.map((it) => (
            <div key={it.id} className={`inv-cell ${selected.has(Number(it.id)) ? 'inv-cell-selected' : ''}`}>
              <ItemCard
                item={it}
                onClick={() => {
                  if (selectMode) {
                    const next = new Set(selected);
                    if (next.has(Number(it.id))) next.delete(Number(it.id));
                    else next.add(Number(it.id));
                    setSelected(next);
                  } else setInspect(it);
                }}
              />
              {selectMode && (
                <div className={`inv-check ${selected.has(Number(it.id)) ? 'inv-check-on' : ''}`}>
                  {selected.has(Number(it.id)) ? '✓' : ''}
                </div>
              )}
              <div className="inv-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setInspect(it)}>Inspect</button>
                {!it.listed && (
                  <button
                    className="btn btn-ghost btn-sm"
                    title={`Quick sell at ${globalSettings?.quickSellPct ?? 90}% of value`}
                    onClick={() => void quickSell(it)}
                  >
                    Sell {fmtCents(Math.max(1, Math.round((Number(it.price_cents ?? 0) * (Number(globalSettings?.quickSellPct ?? 90)) / 100))))}
                  </button>
                )}
                {it.listed ? (
                  <span className="listed-badge">Listed {fmtCents(it.listing_price ?? it.price_cents)}</span>
                ) : listing === it.id ? (
                  <div className="list-form">
                    <input
                      type="number"
                      className="input input-sm"
                      min={1}
                      placeholder="price"
                      value={price || ''}
                      onChange={(e) => setPrice(Number(e.target.value))}
                    />
                    <button className="btn btn-primary btn-sm" onClick={() => list(it.id)}>List</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setListing(null); setPrice(0); }}>×</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => { setListing(it.id); setPrice(Number(it.price_cents) || 0); }}>
                    List on market
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {selectMode && selected.size > 0 && (() => {
        const pct = Number(globalSettings?.quickSellPct ?? 90);
        const total = items.reduce((a, it) => a + (selected.has(Number(it.id)) ? Math.max(1, Math.round((Number(it.price_cents ?? 0) * pct) / 100)) : 0), 0);
        return (
          <div className="bulk-bar">
            <span><b>{selected.size}</b> item{selected.size === 1 ? '' : 's'} selected · total {fmtCents(total)}</span>
            <div className="row-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
              <button className="btn btn-primary btn-sm" disabled={selling} onClick={() => void sellMany()}>
                {selling ? 'Selling...' : `Sell all (${fmtCents(total)})`}
              </button>
            </div>
          </div>
        );
      })()}

      {soldMsg && <div className="toast toast-ok">{soldMsg}</div>}

      {inspect && (
        <InspectModal
          item={inspect}
          quickSellPct={Number(globalSettings?.quickSellPct ?? 90)}
          onClose={() => setInspect(null)}
          onQuickSell={() => quickSell(inspect)}
        />
      )}
    </div>
  );
}
