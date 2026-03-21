-- Add file_patterns column for daemon-side filename filtering.
-- Games like Clair Obscur have multiple .sav files; file_patterns
-- lets the daemon skip non-save files (e.g. EXPEDITION_* only).
ALTER TABLE source_configs ADD COLUMN file_patterns TEXT NOT NULL DEFAULT '[]';
