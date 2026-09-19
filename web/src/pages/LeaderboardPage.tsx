import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fmtCents } from '../store';

const SORTS = [
  { key: 'openings', label: 'Openings' },
  { key: 'value', label: 'Dropped value' },
  { key: 'spent', label: 'Spent' },
  { key: 'best', label: 'Best drop' },
];

export default function LeaderboardPage() {
  const [sort, setSort] = useState('openings');
  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', sort],
    queryFn: () => api.get<{ items: any[] }>(`/api/leaderboard?sort=${sort}`),
    refetchInterval: 20_000,
  });

  const rows = data?.items ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Leaderboard</h1>
        <div className="tabs">
          {SORTS.map((s) => (
            <button key={s.key} className={`tab ${sort === s.key ? 'tab-active' : ''}`} onClick={() => setSort(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="page-loading">Loading...</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Openings</th>
                <th>Spent</th>
                <th>Dropped value</th>
                <th>Best drop</th>
              </tr>

            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className={i < 3 ? 'lb-top' : ''}>{i + 1}</td>
                  <td><b>{r.username}</b></td>
                  <td>{r.openings}</td>
                  <td>{fmtCents(Number(r.spent))}</td>
                  <td>{fmtCents(Number(r.value))}</td>
                  <td>
                    {r.best_name ? (
                      <>
                        {r.best_name} <span className="muted">({fmtCents(r.best)})</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
