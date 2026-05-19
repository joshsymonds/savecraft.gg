-- The adapter-refresh cron filters `WHERE last_refresh_at IS NULL OR
-- last_refresh_at < datetime('now', ?)` and `ORDER BY last_refresh_at
-- ASC LIMIT 50` every 15 minutes. Without this index that query is a
-- full SCAN of `saves` + a TEMP B-TREE filesort, regressing as the
-- table grows — mirrors idx_saves_last_updated (migration 0010), the
-- index the column functionally replaced.
CREATE INDEX IF NOT EXISTS idx_saves_last_refresh ON saves(last_refresh_at);
