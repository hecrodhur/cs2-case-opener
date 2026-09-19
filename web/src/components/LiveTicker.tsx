import { useState } from 'react';
import { useRealtime, type Drop } from '../hooks/useRealtime';
import { ItemImage } from './ui';
import { RARITY_META, fmtCents } from '../store';

/** Live drop ticker: streams the latest drops from all players via SSE. */
export default function LiveTicker() {
  const [drops, setDrops] = useState<Drop[]>([]);

  useRealtime((d) => setDrops((prev) => [d, ...prev].slice(0, 20)));

  if (!drops.length) return null;

  return (
    <div className="live-ticker">
      <span className="live-dot" /> LIVE
      <div className="ticker-track">
        {drops.slice(0, 8).map((d) => (
          <div key={d.openingId + '-' + d.itemName} className="ticker-item" style={{ ['--rarity' as any]: (RARITY_META[d.rarityTier] ?? RARITY_META.mil_spec).color }}>
            {d.image && <ItemImage src={d.image} alt={d.itemName} className="ticker-img" />}
            <span className="ticker-name">{d.username ? d.username + ': ' : ''}{d.itemName}</span>
            <span className="ticker-price">{fmtCents(d.priceCents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
