-- Rebuild prices and price_history with a souvenir dimension.
-- A souvenir is a distinct Steam market variant ("Souvenir <name> (Wear)")
-- with its own market_hash_name, so it needs its own price row.

CREATE TABLE prices_new (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  wear TEXT NOT NULL DEFAULT 'any',
  stattrak INTEGER NOT NULL DEFAULT 0,
  souvenir INTEGER NOT NULL DEFAULT 0,
  lowest_price_cents INTEGER,
  median_price_cents INTEGER,
  volume INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL DEFAULT 'steam_market',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_known_cents INTEGER,
  UNIQUE (item_id, wear, stattrak, souvenir)
);
INSERT INTO prices_new (item_id, wear, stattrak, lowest_price_cents, median_price_cents, volume, currency, source, updated_at, last_known_cents)
  SELECT item_id, wear, stattrak, lowest_price_cents, median_price_cents, volume, currency, source, updated_at, last_known_cents FROM prices;
DROP TABLE prices;
ALTER TABLE prices_new RENAME TO prices;
CREATE INDEX prices_item ON prices(item_id);

CREATE TABLE price_history_new (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  wear TEXT NOT NULL DEFAULT 'any',
  stattrak INTEGER NOT NULL DEFAULT 0,
  souvenir INTEGER NOT NULL DEFAULT 0,
  lowest_price_cents INTEGER,
  median_price_cents INTEGER,
  volume INTEGER,
  source TEXT,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO price_history_new (item_id, wear, stattrak, lowest_price_cents, median_price_cents, volume, source, recorded_at)
  SELECT item_id, wear, stattrak, lowest_price_cents, median_price_cents, volume, source, recorded_at FROM price_history;
DROP TABLE price_history;
ALTER TABLE price_history_new RENAME TO price_history;
CREATE INDEX ph_item ON price_history(item_id, recorded_at DESC);
