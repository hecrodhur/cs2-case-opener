import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore, fmtCents, RARITY_META, reelDuration } from '../store';
import { setSoundEnabled, win, goldSound, sell as sellSound, click } from '../lib/sound';
import { CaseImage, ItemImage, ItemName, Price, RarityBar, RarityTag, useConfirm } from '../components/ui';
import Reel, { buildReel, REEL_LEN, type ReelWin } from '../components/Reel';
import InspectModal from '../components/InspectModal';

type Phase = 'idle' | 'spin' | 'gold-reveal' | 'gold-spin' | 'result';

const GOLD_CARD = { name: 'GOLD ITEM', image: '/gold.png', tier: 'rare_special' as const };

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  const caseId = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { me, setSetting } = useStore();

  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number>(() => Number((me?.settings?.reelSpeed as number) ?? 0));
  const [sold, setSold] = useState<number | null>(null);
  const [inspectItem, setInspectItem] = useState<any | null>(null);
  const [spinReel, setSpinReel] = useState<any[]>([]);
  const [goldReel, setGoldReel] = useState<any[]>([]);
  const [auto, setAuto] = useState(false);
  const autoRef = useRef(false);
  const revealTimer = useRef<number | null>(null);
  const { node: confirmNode, confirm } = useConfirm();

  useEffect(() => { autoRef.current = auto; }, [auto]);

  // quick sell skips the warning dialog by default (toggle in profile)
  const wantSellConfirm = !(me?.settings?.skipQuickSellConfirm ?? true);

  const { data: c, isLoading } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => api.get<any>(`/api/cases/${caseId}`),
  });

  const { data: globalSettings } = useQuery({
    queryKey: ['global-settings'],
    queryFn: () => api.get<any>('/api/global/settings'),
  });

  useEffect(() => {
    setSoundEnabled(Boolean(me?.settings?.sound));
  }, [me?.settings?.sound]);

  const pool = useMemo(() => {
    if (!c) return [];
    const out: { name: string; image: string | null; tier: string }[] = [];
    for (const tier of c.contents as any[]) {
      for (const it of tier.items) out.push({ name: it.name, image: it.image, tier: tier.tier });
    }
    return out;
  }, [c]);

  const goldPool = useMemo(() => pool.filter((p) => p.tier === 'rare_special'), [pool]);

  const probs = useMemo(() => (c?.probabilities as Record<string, number>) ?? {}, [c]);
  const dur = reelDuration(speed);

  const winOf = (r: any): ReelWin => ({
    itemName: r.itemName,
    image: r.image,
    rarityTier: r.rarityTier,
    floatValue: r.floatValue,
    wear: r.wear,
    stattrak: r.stattrak,
    souvenir: r.souvenir,
    priceCents: r.priceCents,
    pattern: r.pattern,
    phase: r.phase,
    instanceId: r.instanceId,
  });

  const open = async (force = false) => {
    if (!me) return nav('/auth');
    if (!c) return;
    if (!force && phase !== 'idle') return;
    const needConfirm = Boolean(me.settings?.confirmOpen) && !force;
    if (needConfirm && c.cost_cents != null && !(await confirm('Open case', `Open ${c.name} for ${fmtCents(Number(c.cost_cents))}?`, { confirmLabel: 'Open' }))) return;
    setPhase('spin');
    setError(null);
    setSold(null);
    try {
      const r = await api.post(`/api/cases/${caseId}/open`, {});
      setResult(r);
      if (r.rarityTier === 'rare_special') {
        // two-phase: main spin shows the generic gold card, then a second spin
        setSpinReel(buildReel(probs, pool, winOf(r)));
        const gr = buildReel({ rare_special: 100 }, pool, winOf(r));
        setGoldReel(gr);
      } else {
        setSpinReel(buildReel(probs, pool, winOf(r)));
        setGoldReel([]);
      }
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e: any) {
      setError(e.message);
      setPhase('idle');
      setAuto(false);
      autoRef.current = false;
    }
  };

  // auto-open: after each reveal, collect the drop and open the same case again
  useEffect(() => {
    if (phase !== 'result' || !auto || !result) return;
    const t = window.setTimeout(() => {
      if (!autoRef.current) return;
      setSold(null);
      setResult(null);
      setPhase('idle');
      void open(true);
    }, 1600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, auto, result]);

  const onSpinDone = () => {
    if (!result) return;
    if (result.rarityTier === 'rare_special') {
      goldSound();
      setPhase('gold-reveal');
      revealTimer.current = window.setTimeout(() => setPhase('gold-spin'), 2600);
    } else {
      win(result.rarityTier);
      setPhase('result');
    }
  };

  const onGoldSpinDone = () => {
    win('rare_special');
    setPhase('result');
  };

  const doQuickSell = async () => {
    if (!result?.instanceId) return;
    const pct = Number(globalSettings?.quickSellPct ?? 90);
    const val = Math.max(1, Math.round((Number(result.priceCents ?? 0) * pct) / 100));
    if (wantSellConfirm && !(await confirm('Quick sell', `Quick sell ${result.itemName} for ${fmtCents(val)}?`, { confirmLabel: 'Sell', danger: true }))) return;
    const r = await api.post<any>(`/api/inventory/${result.instanceId}/sell`);
    setSold(r.saleCents);
    sellSound();
    await qc.invalidateQueries({ queryKey: ['me'] });
  };

  const openInspect = async () => {
    if (!result?.instanceId) return;
    click();
    const item = await api.get<any>(`/api/inventory/${result.instanceId}`);
    setInspectItem(item);
  };

  if (isLoading) return <div className="page-loading">Loading case...</div>;
  if (!c) return <div className="page-error">Case not found.</div>;

  // ---------------- unboxing flow ----------------
  if (phase !== 'idle' && result) {
    const meta = RARITY_META[result.rarityTier] ?? RARITY_META.mil_spec;
    return (
      <div className="case-page unboxing">
        {confirmNode}
        <div className="reel-speedbar">
          {auto && (
            <button className="auto-chip" onClick={() => setAuto(false)} title="Stop auto-open">
              ⟳ AUTO — click to stop
            </button>
          )}
          <label>
            <span className="muted">Reel speed</span>
            <input
              type="range"
              min={-100}
              max={1000}
              step={25}
              value={speed}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSpeed(v);
                setSetting('reelSpeed', v).catch(() => {});
              }}
            />
            <span className="mono speed-val">{speed}%</span>
          </label>
        </div>

        {phase === 'spin' && (
          <Reel reel={spinReel} result={winOf(result)} durationMs={dur} onDone={onSpinDone} />
        )}

        {phase === 'gold-reveal' && (
          <div className="gold-reveal">
            <div className="gold-particles" />
            <div className="gold-img-wrap">
              <img src="/gold.png" alt="Gold" className="gold-img" />
            </div>
            <div className="gold-title">GOLD DROP</div>
            <div className="gold-sub">Revealing your weapon...</div>
          </div>
        )}

        {phase === 'gold-spin' && (
          <Reel reel={goldReel} result={winOf(result)} durationMs={Math.max(2000, dur * 0.45)} onDone={onGoldSpinDone} />
        )}

        {phase === 'result' && (
          <div className="result-zone" style={{ ['--rarity' as any]: meta.color, ['--rarity-glow' as any]: meta.glow }}>
            <div className="result-card">
              <div className="result-img">
                <ItemImage src={result.image} alt={result.itemName} big />
              </div>
              <div className="result-title" style={{ color: meta.color }}>
                {meta.label}
                {result.stattrak ? ' StatTrak™ ' : ' '}
                {result.itemName}
              </div>
              {result.wear && (
                <div className="result-sub">
                  {result.wear}
                  {result.floatValue != null ? ` · float ${Number(result.floatValue).toFixed(5)}` : ''}
                </div>
              )}
              <div className="result-price">
                <Price cents={result.priceCents} />
              </div>
              {sold != null ? (
                <div className="result-sold-wrap">
                  <div className="result-sold">
                    Sold for <b className="gold-text">{fmtCents(sold)}</b>
                  </div>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setSold(null);
                      setResult(null);
                      setPhase('idle');
                      if (autoRef.current) void open(true);
                    }}
                  >
                    Back to case
                  </button>
                </div>
              ) : (
                <div className="result-actions">
                  <button className="btn btn-ghost" onClick={openInspect}>
                    Inspect
                  </button>
                  <button className="btn btn-primary" onClick={() => void doQuickSell()}>
                    Quick sell {fmtCents(Math.max(1, Math.round((Number(result.priceCents ?? 0) * (Number(globalSettings?.quickSellPct ?? 90)) / 100))))}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setSold(null);
                      setResult(null);
                      setPhase('idle');
                      if (autoRef.current) void open(true);
                    }}
                  >
                    Collect
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------- case page ----------------
  return (
    <div className="case-page">
      {confirmNode}
      <div className="case-head">
        <div className="case-head-img">
          <CaseImage src={c.image} alt={c.name} className="case-hero-img" />
        </div>
        <div className="case-head-info">
          <h1>{c.name}</h1>
          {c.first_sale_date && <div className="muted">Released {c.first_sale_date}</div>}
          <div className="case-prices">
            <div className="price-row">
              <span>Case cost</span>
              <b className="case-cost-big">{fmtCents(c.cost_cents)}</b>
            </div>
            {c.price != null && (
              <div className="price-row">
                <span>Steam lowest ask</span>
                <b>{fmtCents(Number(c.price))}</b>
                {c.volume != null && <span className="muted">· vol {Number(c.volume).toLocaleString()}</span>}
              </div>
            )}
          </div>
          <button
            className="btn btn-primary btn-lg"
            disabled={phase !== 'idle' || c.cost_cents == null}
            onClick={() => void open()}
          >
            {me ? `Open case — ${fmtCents(c.cost_cents)}` : 'Login to open'}
          </button>
          <button
            className={`btn auto-toggle ${auto ? 'auto-on' : ''}`}
            disabled={c.cost_cents == null}
            title="Collect each drop and open the same case again, automatically"
            onClick={() => {
              const next = !auto;
              setAuto(next);
              if (next && phase === 'idle' && !result) void open(true);
            }}
          >
            ⟳ Auto
          </button>
          {error && <div className="form-error">{error}</div>}
        </div>
      </div>

      <div className="prob-bar">
        {(Object.entries(probs) as [string, number][]).map(([tier, p]) => (
          <div
            key={tier}
            className="prob-seg"
            style={{ width: `${p}%`, background: RARITY_META[tier]?.color }}
            title={`${RARITY_META[tier]?.label ?? tier}: ${p}%`}
          >
            {p >= 5 && <span>{p}%</span>}
          </div>
        ))}
      </div>

      <div className="contents">
        {((c.contents as any[]) ?? []).map((t: any) =>
          t.items.length ? (
            <div key={t.tier} className="tier-block">
              <div className="tier-head">
                <RarityTag tier={t.tier} />
                <span className="muted">{probs[t.tier] != null ? `${probs[t.tier]}%` : ''}</span>
              </div>
              <div className="tier-items">
                {t.items.map((it: any) => (
                  <div key={it.id} className="content-item" style={{ ['--rarity' as any]: RARITY_META[t.tier]?.color }}>
                    <div className="content-item-img">
                      <ItemImage src={it.image} alt={it.name} />
                    </div>
                    <ItemName name={it.name} stattrak={it.stattrak} souvenir={it.souvenir} />
                    <Price cents={it.price_cents} />
                    <RarityBar tier={t.tier} />
                  </div>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>

      {inspectItem && (
        <InspectModal
          item={inspectItem}
          quickSellPct={Number(globalSettings?.quickSellPct ?? 90)}
          onClose={() => setInspectItem(null)}
          onQuickSell={doQuickSell}
        />
      )}
    </div>
  );
}
