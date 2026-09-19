-- CS2 Case Opener - initial schema
-- All money values are virtual credits expressed in cents (100 = 1 USD equivalent).

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  balance_cents BIGINT NOT NULL DEFAULT 0,
  banned BOOLEAN NOT NULL DEFAULT FALSE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Catalog: every skin / knife / glove / case is an item row.
CREATE TABLE items (
  id BIGSERIAL PRIMARY KEY,
  api_id TEXT UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('skin', 'knife', 'glove', 'case')),
  market_hash_name TEXT NOT NULL,
  name TEXT NOT NULL,
  weapon TEXT,
  category TEXT,
  pattern TEXT,
  paint_index TEXT,
  rarity_tier TEXT,
  min_float NUMERIC(8,5),
  max_float NUMERIC(8,5),
  stattrak BOOLEAN NOT NULL DEFAULT FALSE,
  souvenir BOOLEAN NOT NULL DEFAULT FALSE,
  phase BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  collections TEXT[],
  def_index TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX items_mhn ON items(market_hash_name, kind);
CREATE INDEX items_weapon ON items(weapon);
CREATE INDEX items_kind ON items(kind);

CREATE TABLE cases (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT UNIQUE REFERENCES items(id),
  name TEXT NOT NULL,
  market_hash_name TEXT,
  image TEXT,
  first_sale_date TEXT,
  def_index TEXT,
  cost_cents BIGINT,
  probabilities JSONB NOT NULL DEFAULT '{"mil_spec":79.92,"restricted":15.98,"classified":3.2,"covert":0.64,"rare_special":0.26}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE case_pools (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  UNIQUE (case_id, tier)
);

CREATE TABLE case_pool_items (
  id BIGSERIAL PRIMARY KEY,
  case_pool_id BIGINT NOT NULL REFERENCES case_pools(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES items(id),
  UNIQUE (case_pool_id, item_id)
);
CREATE INDEX cpi_item ON case_pool_items(item_id);

CREATE TABLE prices (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  wear TEXT NOT NULL DEFAULT 'any',
  stattrak BOOLEAN NOT NULL DEFAULT FALSE,
  lowest_price_cents INT,
  median_price_cents INT,
  volume INT,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL DEFAULT 'steam_market',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_known_cents INT,
  UNIQUE (item_id, wear, stattrak)
);
CREATE INDEX prices_item ON prices(item_id);

CREATE TABLE price_history (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  wear TEXT NOT NULL DEFAULT 'any',
  stattrak BOOLEAN NOT NULL DEFAULT FALSE,
  lowest_price_cents INT,
  median_price_cents INT,
  volume INT,
  source TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ph_item ON price_history(item_id, recorded_at DESC);

CREATE TABLE item_instances (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES items(id),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rarity_tier TEXT NOT NULL,
  float_value NUMERIC(8,5),
  wear TEXT,
  stattrak BOOLEAN NOT NULL DEFAULT FALSE,
  souvenir BOOLEAN NOT NULL DEFAULT FALSE,
  pattern TEXT,
  phase INT,
  seed TEXT,
  price_cents INT,
  case_id BIGINT REFERENCES cases(id),
  listed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inst_user ON item_instances(user_id, created_at DESC);
CREATE INDEX inst_item ON item_instances(item_id);

CREATE TABLE inventories (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  item_count INT NOT NULL DEFAULT 0,
  total_value_cents BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE openings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id BIGINT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  instance_id BIGINT UNIQUE REFERENCES item_instances(id) ON DELETE CASCADE,
  rarity_tier TEXT NOT NULL,
  float_value NUMERIC(8,5),
  wear TEXT,
  item_name TEXT NOT NULL,
  price_cents INT,
  cost_cents BIGINT,
  seed TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX openings_user ON openings(user_id, created_at DESC);
CREATE INDEX openings_time ON openings(created_at DESC);

CREATE TABLE transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  balance_after_cents BIGINT,
  ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tx_user ON transactions(user_id, created_at DESC);

CREATE TABLE market_listings (
  id BIGSERIAL PRIMARY KEY,
  instance_id BIGINT UNIQUE NOT NULL REFERENCES item_instances(id) ON DELETE CASCADE,
  seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price_cents BIGINT NOT NULL CHECK (price_cents > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled')),
  sold_to BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sold_at TIMESTAMPTZ
);
CREATE INDEX listings_active ON market_listings(status, created_at DESC);

CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notif_user ON notifications(user_id, created_at DESC);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  target TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_time ON audit_logs(created_at DESC);
CREATE INDEX audit_action ON audit_logs(action, created_at DESC);
