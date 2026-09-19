import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore, fmtCents, RARITY_META } from '../store';
import { ItemImage } from '../components/ui';

function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const SIZE = 160;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(SIZE / img.width, SIZE / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('not a valid image'));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { me, setSetting, refresh } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const { data: prof } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<any>('/api/profile'),
    enabled: !!me,
  });
  const [error, setError] = useState<string | null>(null);

  if (!me) return <div className="page-error">Login to view your profile.</div>;

  const s = me.stats;
  const stats = prof?.stats;
  const byTier = stats?.byTier ?? [];

  const toggle = (key: string, def = false) => {
    setError(null);
    setSetting(key, !(me.settings?.[key] ?? def)).catch((e) => setError(e.message));
  };

  const onAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setAvatarBusy(true);
    try {
      const avatar = await fileToAvatarDataUrl(file);
      if (avatar.length > 200_000) throw new Error('image too large, pick a smaller one');
      await api.patch('/api/profile', { avatar });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    }
    setAvatarBusy(false);
  };

  const removeAvatar = async () => {
    setError(null);
    setAvatarBusy(true);
    try {
      await api.patch('/api/profile', { avatar: null });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    }
    setAvatarBusy(false);
  };

  const settingRow = (key: string, label: string, desc: string, def = false) => (
    <label className="setting-row">
      <div>
        <div>{label}</div>
        <div className="muted setting-desc">{desc}</div>
      </div>
      <input type="checkbox" checked={me.settings?.[key] ?? def} onChange={() => toggle(key, def)} />
    </label>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div className="profile-head">
          {me.avatar
            ? <img className="avatar avatar-img avatar-big" src={me.avatar} alt={me.username} />
            : <span className="avatar avatar-big">{me.username[0]?.toUpperCase()}</span>}
          <div>
            <h1>{me.username}</h1>
            <div className="avatar-controls">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarFile} />
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={avatarBusy}>
                {avatarBusy ? 'Saving...' : me.avatar ? 'Change photo' : 'Upload photo'}
              </button>
              {me.avatar && <button className="btn btn-ghost btn-sm" onClick={removeAvatar} disabled={avatarBusy}>Remove</button>}
            </div>
          </div>
          <span className="balance-chip">◈ {fmtCents(me.balanceCents)}</span>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><b>{s.openings}</b><span>Openings</span></div>
        <div className="stat-card"><b>{fmtCents(s.spentCents)}</b><span>Spent</span></div>
        <div className="stat-card"><b>{fmtCents(s.earnedCents)}</b><span>Dropped value</span></div>
        <div className="stat-card"><b>{fmtCents(s.bestDropCents)}</b><span>Best drop</span></div>
        {stats?.first_opening && <div className="stat-card"><b>{new Date(stats.first_opening).toLocaleDateString()}</b><span>First opening</span></div>}
      </div>

      {byTier.length > 0 && (
        <div className="tier-breakdown">
          {byTier.map((t: any) => (
            <div key={t.rarity_tier} className="tier-row">
              <span style={{ color: RARITY_META[t.rarity_tier]?.color }}>{RARITY_META[t.rarity_tier]?.label ?? t.rarity_tier}</span>
              <b>{t.n}</b>
            </div>
          ))}
        </div>
      )}

      <h2>Preferences</h2>
      {error && <div className="form-error">{error}</div>}
      <div className="settings">
        {settingRow('confirmOpen', 'Confirm before opening', 'Ask for confirmation every time you open a case')}
        {settingRow('showPrice', 'Show item prices', 'Display Steam-based prices next to items')}
        {settingRow('showFloat', 'Show float values', 'Display float / wear values in inventory')}
        {settingRow('sound', 'Sound effects', 'Reel ticks, wins and gold reveals')}
        {settingRow('skipQuickSellConfirm', 'Remove quick sell confirmation', 'Sell instantly without the warning dialog', true)}
        <label className="setting-row setting-row-slider">
          <div>
            <div>Reel speed</div>
            <div className="muted setting-desc">-100 = 2x slower, 0 = normal, +1000 = 11x faster</div>
          </div>
          <div className="slider-wrap">
            <input
              type="range"
              min={-100}
              max={1000}
              step={25}
              value={Number(me.settings?.reelSpeed ?? 0)}
              onChange={(e) => setSetting('reelSpeed', Number(e.target.value)).catch((e) => setError(e.message))}
            />
            <span className="mono">{Number(me.settings?.reelSpeed ?? 0)}%</span>
          </div>
        </label>
      </div>
    </div>
  );
}
