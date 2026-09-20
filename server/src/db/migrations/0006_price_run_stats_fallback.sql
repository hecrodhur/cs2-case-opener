-- Fallback recovery counter: prices recovered from Pricempire after a Steam
-- error. Kept separate from steam_ok so "Steam OK" only ever counts real
-- steam_market results.
ALTER TABLE price_run_stats ADD COLUMN fallback_ok INTEGER NOT NULL DEFAULT 0;
