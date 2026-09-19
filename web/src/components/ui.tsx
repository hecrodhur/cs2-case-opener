import { useEffect, useState } from 'react';
import { RARITY_META, fmtCents } from '../store';

interface ConfirmOpts {
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * In-game confirmation dialog (replaces browser window.confirm).
 * const { node, confirm } = useConfirm(); ... {await confirm('title', 'body', opts)} ... render {node}
 */
export function useConfirm() {
  const [state, setState] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    cancelLabel: string;
    danger: boolean;
    resolve: (v: boolean) => void;
  } | null>(null);
  const confirm = (title: string, body: string, opts?: ConfirmOpts) =>
    new Promise<boolean>((resolve) =>
      setState({
        title,
        body,
        confirmLabel: opts?.confirmLabel ?? 'Confirm',
        cancelLabel: opts?.cancelLabel ?? 'Cancel',
        danger: Boolean(opts?.danger),
        resolve,
      }),
    );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const node = state ? (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
    >
      <div className={`confirm-modal ${state.danger ? 'confirm-danger' : ''}`}>
        <div className="confirm-icon">{state.danger ? '⚠' : '🛡'}</div>
        <h3>{state.title}</h3>
        <p>{state.body}</p>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={() => close(false)}>{state.cancelLabel}</button>
          <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;
  return { node, confirm };
}

/** User avatar: uploaded image or initials fallback. */
export function Avatar({ src, name, size = 32, className = '' }: { src: string | null; name: string; size?: number; className?: string }) {
  if (src) return <img className={`avatar ${className}`} src={src} alt={name} style={{ width: size, height: size }} />;
  const initials = (name ?? '?').slice(0, 2).toUpperCase();
  return (
    <div className={`avatar avatar-initials ${className}`} style={{ width: size, height: size, fontSize: size / 2.6 }}>
      {initials}
    </div>
  );
}

export function ItemImage({ src, alt, className = '', big }: { src: string | null; alt: string; className?: string; big?: boolean }) {
  if (!src) return <div className={`item-img item-img-empty ${big ? 'item-img-big' : ''} ${className}`}><span>?</span></div>;
  return <img className={`item-img ${big ? 'item-img-big' : ''} ${className}`} src={src} alt={alt} loading="lazy" />;
}

export function RarityBar({ tier }: { tier: string }) {
  const meta = RARITY_META[tier] ?? RARITY_META.mil_spec;
  return <div className="rarity-bar" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.glow}` }} />;
}

export function RarityTag({ tier }: { tier: string }) {
  const meta = RARITY_META[tier] ?? RARITY_META.mil_spec;
  return <span className="rarity-tag" style={{ color: meta.color }}>{meta.label}</span>;
}

export function ItemName({ name, stattrak, souvenir }: { name: string; stattrak?: boolean; souvenir?: boolean }) {
  return (
    <span className="item-name">
      {stattrak && <span className="st-label">ST▲ </span>}
      {souvenir && <span className="souvenir-label">Souvenir </span>}
      {name}
    </span>
  );
}

export function Price({ cents, className = '' }: { cents: number | null; className?: string }) {
  return <span className={`price ${className}`}>{fmtCents(cents)}</span>;
}

export function ItemCard({ item, onClick }: { item: any; onClick?: () => void }) {
  const meta = RARITY_META[item.rarity_tier] ?? RARITY_META.mil_spec;
  return (
    <div
      className="item-card"
      style={{ ['--rarity' as any]: meta.color, ['--rarity-glow' as any]: meta.glow }}
      onClick={onClick}
    >
      <div className="item-card-img">
        <ItemImage src={item.image} alt={item.name} />
      </div>
      <div className="item-card-body">
        <ItemName name={item.name} stattrak={item.stattrak} souvenir={item.souvenir} />
        {item.wear && <div className="item-card-sub">{item.wear}{item.float_value ? ` · ${Number(item.float_value).toFixed(4)}` : ''}</div>}
        {item.price_cents != null && <Price cents={Number(item.price_cents)} />}
      </div>
      <RarityBar tier={item.rarity_tier} />
    </div>
  );
}

export function CaseImage({ src, alt, className = '' }: { src: string | null; alt: string; className?: string }) {
  if (!src) return <div className={`case-img-empty ${className}`}>CASE</div>;
  return <img className={`case-img ${className}`} src={src} alt={alt} loading="lazy" />;
}
