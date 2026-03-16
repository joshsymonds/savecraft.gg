-- Track periodic adapter refresh outcomes per save.
ALTER TABLE saves ADD COLUMN refresh_status TEXT;
ALTER TABLE saves ADD COLUMN refresh_error TEXT;

-- Indexes to support the adapter refresh cooldown query (JOIN on source_kind + last_updated).
CREATE INDEX IF NOT EXISTS idx_sources_source_kind ON sources(source_kind);
CREATE INDEX IF NOT EXISTS idx_saves_last_updated ON saves(last_updated);
