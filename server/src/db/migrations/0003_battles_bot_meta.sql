-- 0003: bot battles + notification metadata (for interactive inbox)

ALTER TABLE battles ADD COLUMN opponent_type TEXT NOT NULL DEFAULT 'human'
  CHECK (opponent_type IN ('human', 'bot'));

ALTER TABLE notifications ADD COLUMN meta TEXT;
