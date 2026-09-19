-- 0002: social (friends, trades, avatar) + case battles

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

CREATE TABLE IF NOT EXISTS friend_requests (
  id BIGSERIAL PRIMARY KEY,
  from_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS fr_to ON friend_requests(to_id, status);

CREATE TABLE IF NOT EXISTS friends (
  a BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (a, b)
);

CREATE TABLE IF NOT EXISTS trade_offers (
  id BIGSERIAL PRIMARY KEY,
  from_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_instance BIGINT NOT NULL REFERENCES item_instances(id) ON DELETE CASCADE,
  to_instance BIGINT REFERENCES item_instances(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS trade_to ON trade_offers(to_id, status);

-- case battles: creator pays up front for every case; joiner pays the same.
-- All rounds are generated server-side at join time (battles.rounds) so the
-- client can only play back immutable results.
CREATE TABLE IF NOT EXISTS battles (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  case_ids BIGINT[] NOT NULL,
  cost_cents BIGINT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','finished','cancelled')),
  rounds JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_a_cents BIGINT NOT NULL DEFAULT 0,
  total_b_cents BIGINT NOT NULL DEFAULT 0,
  tiebreaks INT NOT NULL DEFAULT 0,
  winner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reward_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS battles_lobby ON battles(status, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS battles_creator ON battles(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS battles_opponent ON battles(opponent_id, created_at DESC);
