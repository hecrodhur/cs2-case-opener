import { useEffect, useMemo, useRef, useState } from 'react';
import { RARITY_META, reelDuration, REEL_BASE_MS } from '../store';
import { tick } from '../lib/sound';
import { ItemImage, ItemName, RarityBar } from './ui';

export interface ReelWin {
  itemName: string;
  image: string | null;
  rarityTier: string;
  floatValue: number | null;
  wear: string | null;
  stattrak: boolean;
  souvenir: boolean;
  priceCents: number | null;
  pattern?: string | null;
  phase?: number | null;
  instanceId?: number;
}

export interface ReelEntry {
  name: string;
  image: string | null;
  tier: string;
  gold?: boolean;
  win?: boolean;
}

export interface PoolItem {
  name: string;
  image: string | null;
  tier: string;
}

const CARD_W = 210;
const GAP = 14;
export const REEL_LEN = 60;
const WIN_INDEX = 45;

const GOLD_CARD: ReelEntry = { name: 'GOLD ITEM', image: '/gold.png', tier: 'rare_special', gold: true };

function weightedTier(probs: Record<string, number>): string | null {
  const entries = Object.entries(probs).filter(([, p]) => (p ?? 0) > 0);
  const total = entries.reduce((a, [, p]) => a + Number(p), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [tier, p] of entries) {
    r -= Number(p);
    if (r < 0) return tier;
  }
  return entries[entries.length - 1][0];
}

/**
 * Reel whose tier frequency matches the case probabilities (not uniform).
 * The winning tier always appears at least once more. Gold results are
 * hidden behind the generic gold card; the specific knife/glove is revealed
 * by a second spin.
 */
export function buildReel(
  probs: Record<string, number>,
  pool: PoolItem[],
  result: ReelWin,
): ReelEntry[] {
  const byTier: Record<string, PoolItem[]> = {};
  for (const p of pool) (byTier[p.tier] ??= []).push(p);
  const reel: ReelEntry[] = [];
  for (let i = 0; i < REEL_LEN; i++) {
    if (i === WIN_INDEX) continue;
    let tier = weightedTier(probs);
    // if the reel would show the gold tier but the result is not gold, downgrade
    if (tier === 'rare_special' && result.rarityTier !== 'rare_special') tier = 'covert';
    const src = tier ? byTier[tier] : undefined;
    if (src?.length) {
      const p = src[Math.floor(Math.random() * src.length)];
      reel.push(p.tier === 'rare_special' ? { ...GOLD_CARD } : { name: p.name, image: p.image, tier: p.tier });
    } else {
      reel.push({ name: '???', image: null, tier: 'mil_spec' });
    }
  }
  // ensure the winning tier appears elsewhere for realism (only non-gold)
  if (result.rarityTier !== 'rare_special') {
    const src = byTier[result.rarityTier];
    if (src?.length) {
      const p = src[Math.floor(Math.random() * src.length)];
      const i = Math.floor(Math.random() * (WIN_INDEX - 10)) + 5;
      reel[i] = { name: p.name, image: p.image, tier: p.tier };
    }
  }
  const win: ReelEntry =
    result.rarityTier === 'rare_special'
      ? { ...GOLD_CARD, win: true }
      : { name: result.itemName, image: result.image, tier: result.rarityTier, win: true };
  reel.splice(WIN_INDEX, 0, win);
  return reel;
}

/**
 * The server already decided the result; this reel only choreographs it.
 * durationMs controls speed (slower base + user adjustment).
 */
export default function Reel({
  reel,
  result,
  durationMs,
  sound = true,
  onDone,
}: {
  reel: ReelEntry[];
  result: ReelWin;
  durationMs?: number;
  sound?: boolean;
  onDone?: () => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const doneRef = useRef(false);

  const dur = durationMs ?? reelDuration(0);

  useEffect(() => {
    const el = stripRef.current;
    if (!el || !el.parentElement) return;
    const target = WIN_INDEX * (CARD_W + GAP) + CARD_W / 2 - el.parentElement.clientWidth / 2;
    el.style.transition = 'none';
    el.style.transform = 'translateX(0px)';
    let raf = 0;
    let lastIdx = -1;
    const t0 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${dur / 1000}s cubic-bezier(0.12, 0.8, 0.16, 1)`;
        el.style.transform = `translateX(${-target}px)`;
      });
    });
    const loop = () => {
      if (doneRef.current) return;
      const m = getComputedStyle(el).transform;
      if (m && m !== 'none') {
        const x = -parseFloat(m.split(',')[4] || '0');
        const idx = Math.round((x + el.parentElement!.clientWidth / 2 - CARD_W / 2) / (CARD_W + GAP));
        if (idx !== lastIdx && idx >= 0) {
          lastIdx = idx;
          if (sound) tick(0.8 + Math.min(0.6, ((dur / REEL_BASE_MS) > 1 ? 0.3 : 0.6)));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const t1 = window.setTimeout(() => finish(), dur + 80);
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      cancelAnimationFrame(raf);
      setDone(true);
      onDone?.();
    };
    (el as any).__finish = finish;
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      doneRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel]);

  const skip = () => {
    const el = stripRef.current as any;
    if (!el || done) return;
    setSkipped(true);
    const target = WIN_INDEX * (CARD_W + GAP) + CARD_W / 2 - el.parentElement.clientWidth / 2;
    el.style.transition = 'transform 0.45s cubic-bezier(0.2, 0.8, 0.3, 1)';
    el.style.transform = `translateX(${-target}px)`;
    window.setTimeout(() => el.__finish?.(), 470);
  };

  return (
    <div className={`reel ${done ? 'reel-done' : ''}`}>
      <div className="reel-viewport">
        <div className="reel-pointer" />
        <div className="reel-strip" ref={stripRef} style={{ gap: GAP }}>
          {reel.map((it, i) => (
            <div
              key={i}
              className={`reel-card ${it.win ? 'reel-card-win' : ''} ${done && it.win ? 'reel-flash' : ''} ${it.gold ? 'reel-card-gold' : ''}`}
              style={{ width: CARD_W, ['--rarity' as any]: (RARITY_META[it.tier] ?? RARITY_META.mil_spec).color }}
            >
              <div className="reel-card-img">
                <ItemImage src={it.image} alt={it.name} />
              </div>
              <div className="reel-card-name">
                <ItemName name={it.name} stattrak={it.win && result.stattrak} souvenir={it.win && result.souvenir} />
              </div>
              <RarityBar tier={it.tier} />
            </div>
          ))}
        </div>
      </div>
      {!done && (
        <button className="btn btn-ghost reel-skip" onClick={skip}>
          Skip
        </button>
      )}
    </div>
  );
}
