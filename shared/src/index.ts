export type RarityTier = 'mil_spec' | 'restricted' | 'classified' | 'covert' | 'rare_special';

export const RARITY_TIERS: RarityTier[] = ['mil_spec', 'restricted', 'classified', 'covert', 'rare_special'];

export const RARITY_LABELS: Record<RarityTier, string> = {
  mil_spec: 'Mil-Spec',
  restricted: 'Restricted',
  classified: 'Classified',
  covert: 'Covert',
  rare_special: 'Rare Special',
};

export const RARITY_COLORS: Record<RarityTier, string> = {
  mil_spec: '#4b69ff',
  restricted: '#8847ff',
  classified: '#d32ce6',
  covert: '#eb4b4b',
  rare_special: '#ffd700',
};

export const DEFAULT_PROBABILITIES: Record<RarityTier, number> = {
  mil_spec: 79.92,
  restricted: 15.98,
  classified: 3.2,
  covert: 0.64,
  rare_special: 0.26,
};

export const WEARS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'] as const;
export type Wear = (typeof WEARS)[number];

export const WEAR_RANGES: Record<Wear, [number, number]> = {
  'Factory New': [0, 0.07],
  'Minimal Wear': [0.07, 0.15],
  'Field-Tested': [0.15, 0.38],
  'Well-Worn': [0.38, 0.45],
  'Battle-Scarred': [0.45, 1.0],
};

export type Probabilities = Partial<Record<RarityTier, number>>;

export interface SkinInfo {
  id: string;
  name: string;
  weapon: string;
  category: string;
  pattern: string | null;
  paintIndex: string | null;
  rarity: RarityTier;
  minFloat: number;
  maxFloat: number;
  stattrak: boolean;
  souvenir: boolean;
  wears: Wear[];
  image: string;
  crates: { id: string; name: string }[];
  collections: string[];
  phase?: boolean;
}

export interface CrateInfo {
  id: string;
  name: string;
  marketHashName: string;
  image: string;
  type: string | null;
  firstSaleDate: string | null;
  defIndex: number | null;
  contains: { id: string; name: string; rarity: string }[];
  containsRare: { id: string; name: string; rarity: string }[];
}

export interface CaseDefinition {
  case: string;
  probabilities?: Probabilities;
  pools?: Partial<Record<RarityTier, string[]>>;
  /** Explicit case cost in virtual cents. Omitted = derive from Steam price. */
  costCents?: number;
  note?: string;
}

export interface InstanceView {
  id: number;
  itemId: number;
  itemName: string;
  weapon: string;
  category: string;
  image: string;
  rarityTier: RarityTier;
  floatValue: number | null;
  wear: Wear | null;
  stattrak: boolean;
  souvenir: boolean;
  pattern: string | null;
  phase: number | null;
  priceCents: number | null;
  caseName: string | null;
  createdAt: string;
}

export interface CaseView {
  id: number;
  name: string;
  image: string;
  costCents: number | null;
  probabilities: Probabilities;
  active: boolean;
  items: { tier: RarityTier; count: number }[];
  contents: { tier: RarityTier; items: PoolItemView[] }[];
  price: number | null;
  volume: number | null;
  priceUpdatedAt: string | null;
}

export interface PoolItemView {
  id: number;
  name: string;
  weapon: string;
  category: string;
  image: string;
  floatValueMin: number | null;
  floatValueMax: number | null;
  stattrak: boolean;
  priceCents: number | null;
}

export interface OpeningView {
  id: number;
  caseName: string;
  caseImage: string;
  instanceId: number;
  itemName: string;
  weapon: string;
  image: string;
  rarityTier: RarityTier;
  floatValue: number | null;
  wear: string | null;
  priceCents: number | null;
  costCents: number | null;
  createdAt: string;
}

export interface ListingView {
  id: number;
  instance: InstanceView;
  priceCents: number;
  sellerName: string;
  createdAt: string;
}

export interface UserView {
  id: number;
  username: string;
  role: string;
  balanceCents: number;
  createdAt: string;
  stats: { openings: number; spentCents: number; earnedCents: number; bestDropCents: number; bestDropName: string | null };
}

export interface NotificationView {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

export interface SseEvent {
  type: 'drop' | 'market' | 'notify' | 'price' | 'activity';
  data: Record<string, unknown>;
}
