import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore, fmtCents, RARITY_META } from '../store';

type Tab = 'overview' | 'console' | 'users' | 'settings' | 'audit';

interface TermLine {
  text: string;
  cls: string;
}

function AdminGate() {
  const adoptToken = useStore((s) => s.adoptToken);
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !pw) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<any>('/api/admin/unlock', { password: pw });
      setPw('');
      await adoptToken(r.token);
    } catch (err: any) {
      setError(err.message ?? 'failed to unlock');
    }
    setBusy(false);
  };
  return (
    <div className="page">
      <form className="admin-gate" onSubmit={submit}>
        <div className="admin-gate-icon">🛡</div>
        <h1>Admin panel</h1>
        <p className="muted">Enter the admin password to access this panel.</p>
        {error && <div className="form-error">{error}</div>}
        <input
          className="input"
          type="password"
          placeholder="Admin password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !pw}>
          {busy ? 'Checking...' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const { me } = useStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [userSearch, setUserSearch] = useState('');
  const [delta, setDelta] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, number> | null>(null);
  const [termLines, setTermLines] = useState<TermLine[]>([]);
  const [cmdInput, setCmdInput] = useState('');
  const cmdHistoryRef = useRef<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const termRef = useRef<HTMLDivElement>(null);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [diagMhn, setDiagMhn] = useState('CS:GO Weapon Case');
  const [diagRes, setDiagRes] = useState<any>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  const runDiag = async (endpoint: 'overview' | 'search') => {
    setDiagBusy(true);
    setDiagRes(null);
    try {
      setDiagRes(await api.get<any>(`/api/admin/diag/steam?mhn=${encodeURIComponent(diagMhn)}&endpoint=${endpoint}`));
    } catch (e: any) {
      setDiagRes({ ok: false, error: e.message });
    }
    setDiagBusy(false);
  };

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [termLines]);

  const sendCmd = async (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    cmdHistoryRef.current = [line, ...cmdHistoryRef.current.filter((l) => l !== line)].slice(0, 50);
    setHistIdx(-1);
    setTermLines((ls) => [...ls, { text: `$ ${line}`, cls: 'term-cmd' }]);
    try {
      const r = await api.post<any>('/api/admin/command', { cmd: line });
      const out = String(r.output ?? '').split('\n');
      setTermLines((ls) => [...ls, ...out.map((t: string) => ({ text: t, cls: r.ok ? 'term-out' : 'term-err' }))]);
    } catch (e: any) {
      setTermLines((ls) => [...ls, { text: e.message ?? 'error', cls: 'term-err' }]);
    }
  };

  useEffect(() => {
    if (tab === 'console' && me?.role === 'admin' && termLines.length === 0) {
      void sendCmd('/help');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, me?.role]);

  const statsQ = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<any>('/api/admin/stats'),
    enabled: me?.role === 'admin',
  });
  const usersQ = useQuery({
    queryKey: ['admin', 'users', userSearch],
    queryFn: () => api.get<any>(`/api/admin/users${userSearch ? `?search=${encodeURIComponent(userSearch)}` : ''}`),
    enabled: me?.role === 'admin' && tab === 'users',
  });
  const auditQ = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () => api.get<any>('/api/admin/audit?limit=50'),
    enabled: me?.role === 'admin' && tab === 'audit',
  });
  const priceQ = useQuery({
    queryKey: ['admin', 'prices'],
    queryFn: () => api.get<any>('/api/admin/prices/stats'),
    enabled: me?.role === 'admin' && tab === 'overview',
    refetchInterval: 10_000,
  });
  const settingsQ = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const s = await api.get<any>('/api/admin/settings');
      setSettings(s);
      return s;
    },
    enabled: me?.role === 'admin' && tab === 'settings',
  });

  if (me?.role !== 'admin') return <AdminGate />;

  const act = async (fn: () => Promise<any>, msg?: string) => {
    setError(null);
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['admin'] });
      if (msg) alert(msg);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const saveSettings = () => {
    if (!settings) return;
    act(() => api.patch('/api/admin/settings', settings), 'Settings saved');
  };

  const changePassword = async () => {
    setPwMsg(null);
    setError(null);
    try {
      await api.post('/api/profile/password', { currentPassword: curPw, newPassword: newPw });
      setCurPw('');
      setNewPw('');
      setPwMsg('Password changed');
      setTimeout(() => setPwMsg(null), 4000);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Admin</h1>
        <div className="tabs">
          {(['overview', 'console', 'users', 'settings', 'audit'] as Tab[]).map((t) => (
            <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {tab === 'overview' && statsQ.data && (
        <>
          <div className="stat-grid">
            <div className="stat-card"><b>{statsQ.data.stats.users}</b><span>Users</span></div>
            <div className="stat-card"><b>{statsQ.data.stats.items}</b><span>Items</span></div>
            <div className="stat-card"><b>{statsQ.data.stats.cases}</b><span>Cases</span></div>
            <div className="stat-card"><b>{statsQ.data.stats.openings}</b><span>Openings</span></div>
            <div className="stat-card"><b>{fmtCents(Number(statsQ.data.stats.total_spent))}</b><span>Total spent</span></div>
            <div className="stat-card"><b>{fmtCents(Number(statsQ.data.stats.total_dropped_value))}</b><span>Total dropped</span></div>
          </div>
          <div className="tier-breakdown">
            {statsQ.data.perTier.map((t: any) => (
              <div key={t.rarity_tier} className="tier-row">
                <span style={{ color: RARITY_META[t.rarity_tier]?.color }}>{RARITY_META[t.rarity_tier]?.label}</span>
                <b>{t.n}</b>
              </div>
            ))}
          </div>
          <div className="toolbar">
            <button className="btn btn-ghost" onClick={() => act(() => api.post('/api/admin/sync/catalog', {}), 'Catalog sync started')}>
              Sync catalog
            </button>
            <button className="btn btn-ghost" onClick={() => act(() => api.post('/api/admin/sync/prices', {}), 'Price sync queued')}>
              Sync prices
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (!confirm('Invalidar el coste de TODAS las cajas activas y re-sincronizar desde Steam?\n\nNo toca balances, inventarios, aperturas ni battles.')) return;
                void act(() => api.post('/api/admin/prices/repair', {}), 'Reparacion lanzada: costes invalidados, re-sincronizando desde Steam');
              }}
            >
              Repair case prices
            </button>
          </div>
          {priceQ.data && (
            <div className="tier-breakdown">
              <div className="tier-row"><span>Active cases</span><b>{priceQ.data.cases}</b></div>
              <div className="tier-row"><span>With real Steam price</span><b>{priceQ.data.steamPriced}</b></div>
              <div className="tier-row"><span>With fallback price (Pricempire)</span><b>{priceQ.data.fallbackPriced}</b></div>
              <div className="tier-row"><span>Cases without price (NULL)</span><b>{priceQ.data.casesNoPrice}</b></div>
              <div className="tier-row"><span>Queue pending</span><b>{priceQ.data.pending}</b></div>
              <div className="tier-row"><span>Last price update</span><b>{priceQ.data.lastSyncedAt ? new Date(priceQ.data.lastSyncedAt).toLocaleString() : '-'}</b></div>
              <div className="tier-row"><span>Steam OK (total)</span><b>{priceQ.data.steamOk}</b></div>
              <div className="tier-row"><span>Recovered via Pricempire</span><b>{priceQ.data.fallbackOk}</b></div>
              <div className="tier-row"><span>No listing on Steam</span><b>{priceQ.data.notListed}</b></div>
              <div className="tier-row"><span>Errors (total)</span><b>{priceQ.data.errors}</b></div>
              <div className="tier-row"><span>&nbsp;&nbsp;HTTP 403</span><b>{priceQ.data.http403}</b></div>
              <div className="tier-row"><span>&nbsp;&nbsp;HTTP 429</span><b>{priceQ.data.http429}</b></div>
              <div className="tier-row"><span>&nbsp;&nbsp;HTTP 5xx</span><b>{priceQ.data.http5xx}</b></div>
              <div className="tier-row"><span>&nbsp;&nbsp;Bad JSON</span><b>{priceQ.data.jsonErrors}</b></div>
              <div className="tier-row"><span>&nbsp;&nbsp;Other</span><b>{priceQ.data.otherErrors}</b></div>
              <div className="tier-row"><span>Last success</span><b>{priceQ.data.lastOkAt ? new Date(priceQ.data.lastOkAt).toLocaleString() : '-'}</b></div>
              <div className="tier-row"><span>Last error</span><b>{priceQ.data.lastError ? `${priceQ.data.lastErrorAt ? new Date(priceQ.data.lastErrorAt).toLocaleString() : '-'} - ${priceQ.data.lastError}` : '-'}</b></div>
            </div>
          )}
          <div className="panel pw-change">
            <h3>Steam diagnostic (live fetch from this Worker)</h3>
            <div className="pw-row">
              <input className="input" placeholder="market_hash_name" value={diagMhn} onChange={(e) => setDiagMhn(e.target.value)} />
              <button className="btn btn-ghost" disabled={diagBusy} onClick={() => void runDiag('overview')}>Check priceoverview</button>
              <button className="btn btn-ghost" disabled={diagBusy} onClick={() => void runDiag('search')}>Check search/render</button>
            </div>
            {diagRes && (
              <pre className="terminal" style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: '8px 0 0' }}>{JSON.stringify(diagRes, null, 2)}</pre>
            )}
          </div>
          <div className="panel pw-change">
            <h3>Change admin password</h3>
            <div className="pw-row">
              <input className="input" type="password" placeholder="Current password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
              <input className="input" type="password" placeholder="New password (min 6 chars)" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              <button className="btn btn-primary" disabled={!curPw || newPw.length < 6} onClick={() => void changePassword()}>
                Change password
              </button>
            </div>
            {pwMsg && <div className="toast toast-ok">{pwMsg}</div>}
          </div>
        </>
      )}

      {tab === 'console' && (
        <div className="terminal" ref={termRef}>
          {termLines.map((l, i) => (
            <div key={i} className={l.cls}>
              {l.text}
            </div>
          ))}
          <div className="terminal-input">
            <span className="term-prompt">$</span>
            <input
              className="term-field"
              value={cmdInput}
              placeholder="type /help"
              onChange={(e) => setCmdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void sendCmd(cmdInput);
                  setCmdInput('');
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const n = Math.min(histIdx + 1, cmdHistoryRef.current.length - 1);
                  setHistIdx(n);
                  setCmdInput(cmdHistoryRef.current[n] ?? '');
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const n = Math.max(histIdx - 1, -1);
                  setHistIdx(n);
                  setCmdInput(n === -1 ? '' : (cmdHistoryRef.current[n] ?? ''));
                }
              }}
              autoFocus
            />
          </div>
        </div>
      )}

      {tab === 'users' && (
        <>
          <div className="toolbar">
            <input className="input" placeholder="Search users..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
            <input className="input" type="number" placeholder="delta cents" value={delta || ''} onChange={(e) => setDelta(Number(e.target.value))} />
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>User</th><th>Role</th><th>Balance</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {(usersQ.data?.items ?? []).map((u: any) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.role}</td>
                    <td>{fmtCents(Number(u.balance_cents))}</td>
                    <td>{u.banned ? 'banned' : 'active'}</td>
                    <td className="row-actions">
                      <button className="btn btn-ghost btn-sm" disabled={!delta} onClick={() => act(() => api.post(`/api/admin/users/${u.id}/balance`, { deltaCents: delta, reason: 'admin' }))}>
                        {delta >= 0 ? '+' : ''}{delta}
                      </button>
                      <button className="btn btn-ghost btn-sm" disabled={u.role === 'admin'} onClick={() => act(() => api.post(`/api/admin/users/${u.id}/ban`, { banned: !u.banned }))}>
                        {u.banned ? 'Unban' : 'Ban'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'settings' && settings && (
        <div className="settings">
          {Object.entries(settings).map(([k, v]) => (
            <label key={k} className="setting-row">
              <div>
                <div>{k}</div>
              </div>
              <input
                className="input input-num"
                type="number"
                step="any"
                defaultValue={v}
                onChange={(e) => setSettings({ ...settings, [k]: Number(e.target.value) })}
              />
            </label>
          ))}
          <div className="toolbar">
            <button className="btn btn-primary" onClick={saveSettings}>Save settings</button>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>When</th><th>Action</th><th>Target</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {(auditQ.data?.items ?? []).map((a: any) => (
                <tr key={a.id}>
                  <td className="muted">{new Date(a.created_at).toLocaleString()}</td>
                  <td>{a.action}</td>
                  <td>{a.target}</td>
                  <td className="muted">{a.detail ? JSON.stringify(a.detail) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
