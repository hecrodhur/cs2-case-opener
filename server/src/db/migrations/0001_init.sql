-- CS2 Case Opener - initial schema (SQLite / D1)
-- All money values are virtual credits expressed in cents (100 = 1 USD equivalent).
-- JSON columns are TEXT; array columns (collections, case_ids) are JSON TEXT.

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  balance_cents INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Catalog: every skin / knife / glove / case is an item row.
CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  api_id TEXT UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('skin', 'knife', 'glove', 'case')),
  market_hash_name TEXT NOT NULL,
  name TEXT NOT NULL,
  weapon TEXT,
  category TEXT,
  pattern TEXT,
  paint_index TEXT,
  rarity_tier TEXT,
  min_float REAL,
  max_float REAL,
  stattrak INTEGER NOT NULL DEFAULT 0,
  souvenir INTEGER NOT NULL DEFAULT 0,
  phase INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  collections TEXT,
  def_index TEXT,
  extra TEXT NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX items_mhn ON items(market_hash_name, kind);
CREATE INDEX items_weapon ON items(weapon);
CREATE INDEX items_kind ON items(kind);

CREATE TABLE cases (
  id INTEGER PRIMARY KEY,
  item_id INTEGER UNIQUE REFERENCES items(id),
  name TEXT NOT NULL,
  market_hash_name TEXT,
  image TEXT,
  first_sale_date TEXT,
  def_index TEXT,
  cost_cents INTEGER,
  probabilities TEXT NOT NULL DEFAULT '{"mil_spec":79.92,"restricted":15.98,"classified":3.2,"covert":0.64,"rare_special":0.26}',
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE case_pools (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  UNIQUE (case_id, tier)
);

CREATE TABLE case_pool_items (
  id INTEGER PRIMARY KEY,
  case_pool_id INTEGER NOT NULL REFERENCES case_pools(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  UNIQUE (case_pool_id, item_id)
);
CREATE INDEX cpi_item ON case_pool_items(item_id);

CREATE TABLE prices (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  wear TEXT NOT NULL DEFAULT 'any',
  stattrak INTEGER NOT NULL DEFAULT 0,
  lowest_price_cents INTEGER,
  median_price_cents INTEGER,
  volume INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL DEFAULT 'steam_market',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_known_cents INTEGER,
  UNIQUE (item_id, wear, stattrak)
);
CREATE INDEX prices_item ON prices(item_id);

CREATE TABLE price_history (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  wear TEXT NOT NULL DEFAULT 'any',
  stattrak INTEGER NOT NULL DEFAULT 0,
  lowest_price_cents INTEGER,
  median_price_cents INTEGER,
  volume INTEGER,
  source TEXT,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ph_item ON price_history(item_id, recorded_at DESC);

CREATE TABLE item_instances (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rarity_tier TEXT NOT NULL,
  float_value REAL,
  wear TEXT,
  stattrak INTEGER NOT NULL DEFAULT 0,
  souvenir INTEGER NOT NULL DEFAULT 0,
  pattern TEXT,
  phase INTEGER,
  seed TEXT,
  price_cents INTEGER,
  case_id INTEGER REFERENCES cases(id),
  listed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX inst_user ON item_instances(user_id, created_at DESC);
CREATE INDEX inst_item ON item_instances(item_id);

CREATE TABLE inventories (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  item_count INTEGER NOT NULL DEFAULT 0,
  total_value_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE openings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  instance_id INTEGER UNIQUE REFERENCES item_instances(id) ON DELETE CASCADE,
  rarity_tier TEXT NOT NULL,
  float_value REAL,
  wear TEXT,
  item_name TEXT NOT NULL,
  price_cents INTEGER,
  cost_cents INTEGER,
  seed TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX openings_user ON openings(user_id, created_at DESC);
CREATE INDEX openings_time ON openings(created_at DESC);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER,
  ref TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX tx_user ON transactions(user_id, created_at DESC);

CREATE TABLE market_listings (
  id INTEGER PRIMARY KEY,
  instance_id INTEGER UNIQUE NOT NULL REFERENCES item_instances(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled')),
  sold_to INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sold_at TEXT
);
CREATE INDEX listings_active ON market_listings(status, created_at DESC);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX notif_user ON notifications(user_id, created_at DESC);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX audit_time ON audit_logs(created_at DESC);
CREATE INDEX audit_action ON audit_logs(action, created_at DESC);
