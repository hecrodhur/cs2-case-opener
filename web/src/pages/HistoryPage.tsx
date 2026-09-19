import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore, fmtCents, RARITY_META } from '../store';
import { ItemImage } from '../components/ui';

export default function HistoryPage() {
  const { me } = useStore();
  const { data, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: () => api.get<{ items: any[]; total: number }>('/api/history?limit=200'),
    enabled: !!me,
  });

  if (!me) return <div className="page-error">Login to view your history.</div>;

  const rows = data?.items ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Opening history</h1>
        <span className="muted">{data?.total ?? 0} total</span>
      </div>
      {isLoading ? (
        <div className="page-loading">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="empty">Nothing opened yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Wear / Float</th>
                <th>Rarity</th>
                <th>Case</th>
                <th>Cost</th>
                <th>Value</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o: any) => (
                <tr key={o.id}>
                  <td className="cell-item">
                    <ItemImage src={o.image} alt={o.item_name} className="cell-img" />
                    <span>{o.item_name}</span>
                  </td>
                  <td>{o.wear ?? '—'}{o.float_value != null ? ` · ${Number(o.float_value).toFixed(4)}` : ''}</td>
                  <td style={{ color: RARITY_META[o.rarity_tier]?.color }}>{RARITY_META[o.rarity_tier]?.label ?? o.rarity_tier}</td>
                  <td>{o.case_name}</td>
                  <td>{fmtCents(Number(o.cost_cents))}</td>
                  <td>{fmtCents(o.price_cents)}</td>
                  <td className="muted">{new Date(o.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
