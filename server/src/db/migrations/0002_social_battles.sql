-- 0002: social (friends, trades, avatar) + case battles

ALTER TABLE users ADD COLUMN avatar TEXT;

CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT,
  UNIQUE (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS fr_to ON friend_requests(to_id, status);

CREATE TABLE IF NOT EXISTS friends (
  a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (a, b)
);

CREATE TABLE IF NOT EXISTS trade_offers (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_instance INTEGER NOT NULL REFERENCES item_instances(id) ON DELETE CASCADE,
  to_instance INTEGER REFERENCES item_instances(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS trade_to ON trade_offers(to_id, status);

-- case battles: creator pays up front for every case; joiner pays the same.
-- All rounds are generated server-side at join time (battles.rounds) so the
-- client can only play back immutable results.
CREATE TABLE IF NOT EXISTS battles (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  case_ids TEXT NOT NULL,
  cost_cents INTEGER NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','finished','cancelled')),
  rounds TEXT NOT NULL DEFAULT '[]',
  total_a_cents INTEGER NOT NULL DEFAULT 0,
  total_b_cents INTEGER NOT NULL DEFAULT 0,
  tiebreaks INTEGER NOT NULL DEFAULT 0,
  winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reward_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS battles_lobby ON battles(status, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS battles_creator ON battles(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS battles_opponent ON battles(opponent_id, created_at DESC);
