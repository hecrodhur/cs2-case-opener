import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore, fmtCents, RARITY_META } from '../store';
import { CaseImage } from '../components/ui';
import type { CaseRow } from './Home';

interface DropView {
  instanceId: number;
  itemName: string;
  weapon: string;
  image: string | null;
  rarityTier: string;
  floatValue: number;
  wear: string;
  stattrak: boolean;
  souvenir: boolean;
  priceCents: number;
}

interface RoundView {
  i: number;
  caseId: number;
  caseName: string;
  caseImage: string | null;
  tiebreak: boolean;
  a: DropView;
  b: DropView;
}

interface BattleView {
  id: number;
  code: string;
  creator: { id: number; username: string; avatar: string | null };
  opponent: { id: number; username: string; avatar: string | null } | null;
  opponentType: 'human' | 'bot';
  cases: { id: number; name: string; image: string | null; cost_cents: number }[];
  caseIds: number[];
  costCents: number;
  visibility: string;
  status: string;
  rounds: RoundView[];
  totalA: number;
  totalB: number;
  tiebreaks: number;
  winnerId: number | null;
  rewardCents: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

type Tab = 'lobby' | 'create' | 'join' | 'mine' | 'replay';

function DropCell({ d, align }: { d: DropView; align: 'left' | 'right' }) {
  const meta = RARITY_META[d.rarityTier] ?? RARITY_META.mil_spec;
  return (
    <div className={`battle-drop ${align}`} style={{ borderColor: meta.color }}>
      <div className="battle-drop-img">
        <CaseImage src={d.image} alt={d.itemName} />
      </div>
      <div className="battle-drop-body">
        <div className="battle-drop-name" title={d.itemName}>
          {d.stattrak && <span className="st-tag">ST™</span>}{d.itemName}
        </div>
        <div className="muted mono small">{d.wear} · float {d.floatValue?.toFixed(4)}</div>
        <div className="battle-drop-val" style={{ color: meta.color }}>{fmtCents(d.priceCents)}</div>
      </div>
    </div>
  );
}

/**
 * Live replay of a finished battle: rounds reveal one by one with running
 * totals, like watching both players open at the same time.
 */
function BattleReplay({ b, meId, auto }: { b: BattleView; meId: number; auto: boolean }) {
  const iAmCreator = b.creator.id === meId;
  const totalRounds = b.rounds.length;
  const [step, setStep] = useState(auto ? 0 : totalRounds);
  const done = step >= totalRounds;

  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 500 : 1700);
    return () => clearTimeout(t);
  }, [step, done]);

  const revealed = b.rounds.slice(0, step);
  const mySum = revealed.reduce((a, r) => a + Number((iAmCreator ? r.a : r.b).priceCents), 0);
  const theirSum = revealed.reduce((a, r) => a + Number((iAmCreator ? r.b : r.a).priceCents), 0);

  const iWon = b.winnerId != null && b.winnerId === meId;
  const iLost = b.winnerId != null && b.winnerId !== meId;
  const isBot = b.opponentType === 'bot';
  const oppName = isBot ? '🤖 Case Bot' : (iAmCreator ? b.opponent?.username : b.creator.username) ?? '—';

  return (
    <div className="battle-replay">
      <div className="replay-head">
        <div className="replay-side me">
          <span className="replay-name">You</span>
          <span className="replay-total" style={{ color: iWon || (done && !iLost) ? 'var(--accent-2)' : undefined }}>{fmtCents(mySum)}</span>
        </div>
        <div className="replay-step mono small muted">
          {done ? `${totalRounds}/${totalRounds} rounds` : `${step}/${totalRounds} rounds`}
        </div>
        <div className="replay-side opp">
          <span className="replay-name">{oppName}</span>
          <span className="replay-total" style={{ color: iLost ? 'var(--accent-2)' : undefined }}>{fmtCents(theirSum)}</span>
        </div>
      </div>

      <div className="replay-body">
        {revealed.length === 0 && <div className="muted pad">Opening first case...</div>}
        {revealed.map((r) => (
          <div key={r.i} className={`battle-round ${done ? '' : 'replay-live'}`}>
            <div className="battle-round-head">
              <span className="mono small">#{r.i + 1}{r.tiebreak && <span className="tb-tag"> tiebreak</span>}</span>
              <span className="muted small">{r.caseName}</span>
            </div>
            <div className="battle-round-body">
              <DropCell d={iAmCreator ? r.a : r.b} align="left" />
              <span className="battle-vs">VS</span>
              <DropCell d={iAmCreator ? r.b : r.a} align="right" />
            </div>
          </div>
        ))}
      </div>

      {done ? (
        <div className="replay-end">
          {iWon && <div className="battle-result win replay-verdict">🏆 You won {fmtCents(mySum)} vs {fmtCents(theirSum)} — you took all the items</div>}
          {iLost && <div className="battle-result lose replay-verdict">💀 You lost {fmtCents(mySum)} vs {fmtCents(theirSum)}{isBot ? ' — all items were burned' : ' — the opponent took all the items'}</div>}
          {b.winnerId == null && <div className="battle-result draw replay-verdict">🤝 Draw {fmtCents(mySum)} - {fmtCents(theirSum)} — items kept</div>}
          {b.tiebreaks > 0 && <div className="muted small">{b.tiebreaks} tiebreak round(s)</div>}
          {!auto && <button className="btn btn-ghost btn-sm" onClick={() => setStep(0)}>Replay</button>}
        </div>
      ) : (
        <button className="btn btn-ghost btn-sm replay-skip" onClick={() => setStep(totalRounds)}>Skip to end »</button>
      )}
    </div>
  );
}

function BattleCard({ b, meId, onJoined }: { b: BattleView; meId: number; onJoined?: (b: BattleView) => void }) {
  const [busy, setBusy] = useState(false);
  const mine = b.creator.id === meId;
  const other = mine ? b.opponent : b.creator;

  const doJoin = async () => {
    setBusy(true);
    try {
      const r = await api.post<BattleView>('/api/battles/join', { code: b.code });
      onJoined?.(r);
    } catch (e: any) {
      setBusy(false);
      alert(e.message);
    }
  };

  return (
    <div className="battle-card">
      <div className="battle-cases">
        {b.cases.slice(0, 4).map((c, i) => <CaseImage key={c.id + '-' + i} src={c.image} alt={c.name} className="case-pick-img" />)}
        {b.cases.length > 4 && <span className="muted">+{b.cases.length - 4}</span>}
      </div>
      <div className="battle-card-body">
        <div className="battle-card-name">{b.cases.map((c) => c.name).slice(0, 2).join(', ')}{b.cases.length > 2 ? ` +${b.cases.length - 2}` : ''}</div>
        <div className="muted small">
          Host: <b>{b.creator.username}</b>
          {other && <span> vs <b>{other.username}</b></span>}
          {' · '}cost <b>{fmtCents(b.costCents)}</b>
        </div>
        <div className="mono small muted">code <b className="battle-code">{b.code}</b></div>
        <div className="battle-card-actions">
          <span className={`status-pill status-${b.status}`}>{b.status}</span>
          {b.status === 'waiting' && !mine && (
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={doJoin}>
              {busy ? 'Joining...' : 'Join battle'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FinishedBattle({ b, meId, onReplay }: { b: BattleView; meId: number; onReplay: (b: BattleView) => void }) {
  const iAmCreator = b.creator.id === meId;
  const myTotal = iAmCreator ? b.totalA : b.totalB;
  const theirTotal = iAmCreator ? b.totalB : b.totalA;
  const iWon = b.winnerId === meId;
  const iLost = b.winnerId != null && b.winnerId !== meId;
  const draw = b.winnerId == null;
  const oppName = b.opponentType === 'bot' ? '🤖 Case Bot' : (iAmCreator ? b.opponent?.username : b.creator.username) ?? '—';

  return (
    <div className="battle-card battle-finished">
      <div className="battle-card-body">
        <div className="battle-card-name">
          {b.cases.map((c) => c.name).slice(0, 2).join(', ')}{b.cases.length > 2 ? ` +${b.cases.length - 2}` : ''}
          {' · '}vs <b>{oppName}</b>
        </div>
        <div className="muted small">
          {new Date(b.finishedAt ?? b.createdAt).toLocaleString()}
          {b.tiebreaks > 0 && <span> · {b.tiebreaks} tiebreak(s)</span>}
        </div>
        <div className="battle-card-actions">
          <span className={`status-pill status-${b.status}`}>{b.status}</span>
          {iWon && <span className="battle-result win">You won {fmtCents(b.rewardCents)} of items</span>}
          {iLost && <span className="battle-result lose">You lost</span>}
          {draw && <span className="battle-result draw">Draw - items kept</span>}
          {myTotal > 0 && <span className="muted small">yours {fmtCents(myTotal)} vs theirs {fmtCents(theirTotal)}</span>}
          <button className="btn btn-ghost btn-sm" onClick={() => onReplay(b)}>Replay</button>
        </div>
      </div>
    </div>
  );
}

export default function BattlesPage() {
  const { me, refresh } = useStore();
  const battlesTick = useStore((s) => s.battlesTick);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('lobby');
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [created, setCreated] = useState<BattleView | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Record<number, number>>({});
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [opponentMode, setOpponentMode] = useState<'human' | 'bot'>('human');
  const [copied, setCopied] = useState(false);
  const [replay, setReplay] = useState<BattleView | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const casesQ = useQuery({
    queryKey: ['cases'],
    queryFn: () => api.get<{ items: CaseRow[]; total: number }>('/api/cases?limit=500'),
  });
  const lobbyQ = useQuery({
    queryKey: ['battles', 'lobby'],
    queryFn: () => api.get<BattleView[]>('/api/battles/lobby'),
    enabled: !!me,
    refetchInterval: 10_000,
  });
  const mineQ = useQuery({
    queryKey: ['battles', 'mine'],
    queryFn: () => api.get<BattleView[]>('/api/battles/mine'),
    enabled: !!me,
    refetchInterval: 10_000,
  });

  // realtime: refresh lists as soon as any battle event lands
  useEffect(() => {
    lobbyQ.refetch().catch(() => {});
    mineQ.refetch().catch(() => {});
  }, [battlesTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // inbox deep link: /battles?focus=<id>
  const focus = searchParams.get('focus');
  useEffect(() => {
    if (!focus) return;
    let alive = true;
    api.get<BattleView>(`/api/battles/${focus}`)
      .then((b) => { if (alive) { setReplay(b); setTab('replay'); } })
      .catch(() => {})
      .finally(() => { if (alive) setSearchParams({}, { replace: true }); });
    return () => { alive = false; };
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const cases = (casesQ.data?.items ?? []).filter((c) => c.cost_cents != null);
  const selCount = Object.values(sel).reduce((a, n) => a + n, 0);
  const selectedTotal = useMemo(
    () => cases.reduce((a, c) => a + (sel[c.id] ?? 0) * Number(c.cost_cents), 0),
    [cases, sel],
  );

  if (!me) return <div className="page-error">Login to play battles.</div>;

  const addCase = (id: number) => {
    if (selCount >= 50) return;
    setSel((s) => ({ ...s, [id]: (s[id] ?? 0) + 1 }));
  };
  const removeCase = (id: number) => {
    setSel((s) => {
      const n = (s[id] ?? 0) - 1;
      const next = { ...s };
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['battles'] });
    refresh();
  };

  const onJoined = (b: BattleView) => {
    setReplay(b);
    setTab('replay');
    setCodeInput('');
    invalidateAll();
  };

  const doJoinCode = async () => {
    setError(null);
    if (!codeInput.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<BattleView>('/api/battles/join', { code: codeInput.trim().toUpperCase() });
      onJoined(r);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const doCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      const caseIds = Object.entries(sel).flatMap(([id, n]) => Array(n).fill(Number(id)));
      const r = await api.post<BattleView>('/api/battles', { caseIds, visibility, opponent: opponentMode });
      setCreated(r);
      setSel({});
      setCopied(false);
      invalidateAll();
      if (r.status === 'finished') {
        setReplay(r);
        setTab('replay');
      }
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const doCancel = async (id: number) => {
    try {
      await api.post(`/api/battles/${id}/cancel`);
      invalidateAll();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const copyCode = async (b: BattleView) => {
    try {
      await navigator.clipboard.writeText(b.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const waiting = (mineQ.data ?? []).filter((b) => b.status === 'waiting');
  const finished = (mineQ.data ?? []).filter((b) => b.status !== 'waiting');

  return (
    <div className="page battles-page">
      <div className="page-head">
        <h1>Case Battles</h1>
        <span className="muted">Pick cases, pay the entry, beat your opponent's drops. Winner takes all items.</span>
      </div>

      <div className="tabs">
        {(['lobby', 'create', 'join', 'mine'] as Tab[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => { setTab(t); setError(null); }}>
            {t === 'lobby' ? 'Lobby' : t === 'create' ? 'Create battle' : t === 'join' ? 'Join by code' : `My battles${waiting.length ? ` (${waiting.length})` : ''}`}
          </button>
        ))}
      </div>

      {error && <div className="form-error">{error}</div>}

      {tab === 'lobby' && (
        <div className="battle-grid">
          {(lobbyQ.data ?? []).map((b) => (
            <BattleCard key={b.id} b={b} meId={me.id} onJoined={onJoined} />
          ))}
          {lobbyQ.data?.length === 0 && <div className="muted">No open battles in the lobby. Create one!</div>}
        </div>
      )}

      {tab === 'create' && (
        <div className="battle-create">
          <div className="panel">
            <h3>Select cases <span className="muted small">({selCount} selected, max 50 - duplicates allowed)</span></h3>
            <div className="battle-case-pick">
              {cases.map((c) => (
                <div
                  key={c.id}
                  className={`case-pick ${sel[c.id] ? 'picked' : ''}`}
                  title={c.name}
                >
                  <button className="case-pick-btn" onClick={() => addCase(c.id)}>
                    <CaseImage src={c.image} alt={c.name} className="case-pick-img" />
                    <span className="case-pick-name">{c.name}</span>
                    <span className="mono small">{fmtCents(c.cost_cents)}</span>
                    {sel[c.id] ? <span className="case-pick-count">{sel[c.id]}</span> : null}
                  </button>
                  {sel[c.id] ? <button className="case-pick-remove" onClick={() => removeCase(c.id)} title="Remove one">×</button> : null}
                </div>
              ))}
            </div>
            {selCount > 0 && (
              <div className="sel-summary">
                {Object.entries(sel).map(([id, n]) => {
                  const c = cases.find((x) => x.id === Number(id));
                  return c ? (
                    <span key={id} className="sel-chip">
                      {c.name}{n > 1 ? ` ×${n}` : ''}
                      <button className="sel-chip-x" onClick={() => { for (let i = 0; i < n; i++) removeCase(Number(id)); }}>×</button>
                    </span>
                  ) : null;
                })}
              </div>
            )}
            <div className="battle-create-foot">
              <label className="muted">
                <input type="radio" name="opp" checked={opponentMode === 'human'} onChange={() => setOpponentMode('human')} />
                vs a player
              </label>
              <label className="muted">
                <input type="radio" name="opp" checked={opponentMode === 'bot'} onChange={() => setOpponentMode('bot')} />
                vs bot (instant)
              </label>
              <label className="muted">
                <input type="radio" name="vis" checked={visibility === 'private'} onChange={() => setVisibility('private')} />
                Private
              </label>
              <label className="muted">
                <input type="radio" name="vis" checked={visibility === 'public'} onChange={() => setVisibility('public')} />
                Public
              </label>
              <span className="battle-total">Entry: <b>{fmtCents(selectedTotal)}</b> (balance {fmtCents(me.balanceCents)})</span>
              <button className="btn btn-primary" disabled={!selCount || busy} onClick={doCreate}>
                {busy ? 'Creating...' : opponentMode === 'bot' ? 'Battle the bot' : 'Create battle'}
              </button>
            </div>
          </div>

          {created && created.status === 'waiting' && (
            <div className="panel battle-created">
              <h3>Battle created - share this code</h3>
              <div className="battle-big-code mono">{created.code}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => copyCode(created)}>
                {copied ? 'Copied!' : 'Copy code'}
              </button>
              <p className="muted small">
                Waiting for an opponent... Cost {fmtCents(created.costCents)} was charged and will be refunded if you cancel.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'join' && (
        <div className="panel battle-join">
          <h3>Join with a code</h3>
          <div className="join-row">
            <input
              className="input code-input"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. AB3K9X"
              maxLength={6}
            />
            <button className="btn btn-primary" disabled={busy || codeInput.trim().length < 4} onClick={doJoinCode}>
              {busy ? 'Joining...' : 'Join'}
            </button>
          </div>
          <p className="muted small">Joining starts the battle instantly - you will be taken to the live replay.</p>
        </div>
      )}

      {tab === 'mine' && (
        <div className="battle-mine">
          {waiting.length > 0 && <>
            <h2>Waiting for opponent</h2>
            {waiting.map((b) => (
              <div key={b.id} className="panel battle-waiting">
                <div className="battle-waiting-head">
                  <b className="mono battle-code">{b.code}</b>
                  <span className="muted small">{b.cases.length} case(s) · entry {fmtCents(b.costCents)} · {b.visibility}</span>
                </div>
                <div className="battle-card-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => copyCode(b)}>{copied ? 'Copied!' : 'Copy code'}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => doCancel(b.id)}>Cancel & refund</button>
                </div>
              </div>
            ))}
          </>}
          <h2>History</h2>
          {finished.map((b) => <FinishedBattle key={b.id} b={b} meId={me.id} onReplay={(bb) => { setReplay(bb); setTab('replay'); }} />)}
          {finished.length === 0 && waiting.length === 0 && <div className="muted">No battles yet. Create one or join from the lobby.</div>}
        </div>
      )}

      {tab === 'replay' && (
        <div className="battle-replay-wrap">
          {replay ? (
            <BattleReplay key={replay.id} b={replay} meId={me.id} auto />
          ) : (
            <div className="muted pad">No battle selected. Join a battle or pick one from "My battles" to replay it.</div>
          )}
        </div>
      )}
    </div>
  );
}
