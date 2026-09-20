-- Persistent price pipeline counters (single row, id=1).
-- Updated once per batch run; per-event details go to audit_logs.
CREATE TABLE IF NOT EXISTS price_run_stats (
  id INTEGER PRIMARY KEY DEFAULT 1,
  steam_ok INTEGER NOT NULL DEFAULT 0,
  not_listed INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  http_403 INTEGER NOT NULL DEFAULT 0,
  http_429 INTEGER NOT NULL DEFAULT 0,
  http_5xx INTEGER NOT NULL DEFAULT 0,
  json_errors INTEGER NOT NULL DEFAULT 0,
  other_errors INTEGER NOT NULL DEFAULT 0,
  last_ok_at TEXT,
  last_error_at TEXT,
  last_error TEXT
);
