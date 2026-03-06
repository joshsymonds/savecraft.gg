-- Add config result columns to source_configs for persisting ConfigResult from daemon.
ALTER TABLE source_configs ADD COLUMN config_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE source_configs ADD COLUMN resolved_path TEXT NOT NULL DEFAULT '';
ALTER TABLE source_configs ADD COLUMN last_error TEXT NOT NULL DEFAULT '';
ALTER TABLE source_configs ADD COLUMN result_at TEXT;
