import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fmtCents } from '../store';
import { CaseImage } from '../components/ui';
import { Link } from 'react-router-dom';

export interface CaseRow {
  id: number;
  name: string;
  image: string | null;
  cost_cents: number | null;
  probabilities: Record<string, number>;
  item_count: number;
  openings: number;
  steam_price: number | null;
  steam_volume: number | null;
}

export default function Home() {
  const { data, isLoading } = useQuery({
    queryKey: ['cases'],
    queryFn: () => api.get<{ items: CaseRow[]; total: number }>('/api/cases?limit=200'),
  });

  const cases = data?.items ?? [];

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-glow" />
        <h1>Unlock <span className="accent">containers</span></h1>
        <p>Real CSGO-API case data · live Steam Market prices · provably fair server-side RNG</p>
        <div className="hero-stats">
          <div className="stat"><b>{cases.length}</b><span>cases</span></div>
          <div className="stat"><b>{cases.reduce((a, c) => a + Number(c.openings ?? 0), 0).toLocaleString()}</b><span>opens</span></div>
        </div>
      </section>

      {isLoading ? (
        <div className="page-loading">Loading cases...</div>
      ) : (
        <div className="case-grid">
          {cases.map((c) => (
            <Link to={`/case/${c.id}`} className="case-card" key={c.id}>
              <div className="case-card-img">
                <CaseImage src={c.image} alt={c.name} />
              </div>
              <div className="case-card-body">
                <div className="case-name">{c.name}</div>
                <div className="case-meta">
                  <span className="case-cost">{fmtCents(c.cost_cents)}</span>
                  <span className="case-items">{c.item_count} items</span>
                </div>
                {c.steam_price != null && (
                  <div className="case-steam" title="Steam Market lowest ask">
                    Steam {fmtCents(Number(c.steam_price))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
