ALTER TABLE sources ADD COLUMN ip TEXT;
CREATE INDEX IF NOT EXISTS idx_sources_ip ON sources(ip);
