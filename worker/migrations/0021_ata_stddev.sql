-- Add ata_stddev (standard deviation of pick position) to draft rating tables.
-- Used by the signal axis in draft scoring: σ-normalized ATA deviation makes
-- signals comparable across card quality tiers (bombs vs filler).

ALTER TABLE mtga_draft_ratings ADD COLUMN ata_stddev REAL NOT NULL DEFAULT 0;
ALTER TABLE mtga_draft_color_stats ADD COLUMN ata_stddev REAL NOT NULL DEFAULT 0;
