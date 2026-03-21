ALTER TABLE saves ADD COLUMN removed_at TEXT;
ALTER TABLE source_configs ADD COLUMN exclude_saves TEXT NOT NULL DEFAULT '[]';
