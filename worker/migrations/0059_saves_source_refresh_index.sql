-- The adapter-refresh cron drives from `sources` (source_kind='adapter'
-- is selective, served by idx_sources_source_kind) and nested-loops
-- into `saves` on s.last_source_uuid = src.source_uuid, then needs
-- last_refresh_at for the cooldown filter + ordering. The single-column
-- idx_saves_last_refresh from 0058 is inert there (the probe is on the
-- unindexed last_source_uuid; saves is the inner table so it can't
-- satisfy ORDER BY s.last_refresh_at). Replace it with a composite that
-- indexes the join probe AND yields per-source rows already ordered by
-- last_refresh_at.
DROP INDEX IF EXISTS idx_saves_last_refresh;
CREATE INDEX IF NOT EXISTS idx_saves_source_refresh
  ON saves(last_source_uuid, last_refresh_at);
