import { useState } from 'react';
import { fmtCents, RARITY_META } from '../store';
import { ItemImage, ItemName, RarityTag } from './ui';
import { sell } from '../lib/sound';

/**
 * Full item inspection: big image, exact float, wear, pattern/phase,
 * StatTrak/souvenir, value and actions (inspect is read-only, actions are
 * injected by the parent).
 */
export default function InspectModal({
  item,
  quickSellPct = 90,
  onClose,
  onQuickSell,
  onList,
}: {
  item: any;
  quickSellPct?: number;
  onClose: () => void;
  onQuickSell?: () => Promise<void>;
  onList?: () => void;
}) {
  const [selling, setSelling] = useState(false);
  const [sold, setSold] = useState<number | null>(null);
  const meta = RARITY_META[item.rarity_tier] ?? RARITY_META.mil_spec;
  const value = Number(item.price_cents ?? 0);
  const quickValue = Math.max(1, Math.round((value * quickSellPct) / 100));

  const doSell = async () => {
    // the parent decides whether to confirm; we just execute
    if (selling) return;
    setSelling(true);
    try {
      await onQuickSell?.();
      sell();
      setSold(quickValue);
    } catch (e: any) {
      alert(e.message ?? 'error');
    } finally {
      setSelling(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="inspect" style={{ ['--rarity' as any]: meta.color, ['--rarity-glow' as any]: meta.glow }}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <div className="inspect-img-wrap">
          <ItemImage src={item.image} alt={item.name} big />
        </div>
        <div className="inspect-body">
          <div className="inspect-name">
            <ItemName name={item.name} stattrak={item.stattrak} souvenir={item.souvenir} />
          </div>
          {item.weapon && <div className="muted">{item.weapon}</div>}
          <div className="inspect-tags">
            <RarityTag tier={item.rarity_tier} />
            {item.stattrak && <span className="badge badge-st">StatTrak™</span>}
            {item.souvenir && <span className="badge badge-souv">Souvenir</span>}
            {item.listed && <span className="badge badge-listed">Listed</span>}
          </div>

          <div className="inspect-grid">
            {item.wear && (
              <div className="inspect-row">
                <span>Wear</span>
                <b>{item.wear}</b>
              </div>
            )}
            {item.float_value != null && (
              <div className="inspect-row">
                <span>Float value</span>
                <b className="mono">{Number(item.float_value).toFixed(5)}</b>
              </div>
            )}
            {item.pattern != null && <div className="inspect-row"><span>Pattern</span><b>{item.pattern}</b></div>}
            {item.phase != null && <div className="inspect-row"><span>Phase</span><b>{item.phase}</b></div>}
            <div className="inspect-row">
              <span>Estimated value</span>
              <b className="gold-text">{fmtCents(value)}</b>
            </div>
          </div>

          {sold != null ? (
            <div className="inspect-sold">
              Sold for <b className="gold-text">{fmtCents(sold)}</b>
            </div>
          ) : (
            <div className="inspect-actions">
              {onQuickSell && (
                <button className="btn btn-primary" disabled={selling || item.listed} onClick={doSell}>
                  {item.listed ? 'Listed on market' : `Quick sell ${fmtCents(quickValue)}`}
                </button>
              )}
              {onList && !item.listed && <button className="btn btn-ghost" onClick={onList}>List on market</button>}
              <button className="btn btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
