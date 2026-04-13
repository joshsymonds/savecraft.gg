-- Per-set metadata for draft scoring: fixing density (ASFAN) and pack structure.
-- ASFAN = average number of fixing/dual lands per booster pack in the format.
-- pack_size = number of cards per booster pack (typically 14 for Premier Draft).

CREATE TABLE IF NOT EXISTS mtga_set_metadata (
  set_code   TEXT PRIMARY KEY,
  asfan      REAL NOT NULL DEFAULT 0.4,
  pack_size  INTEGER NOT NULL DEFAULT 14
);
