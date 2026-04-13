-- Per-set sigmoid calibration parameters for draft scoring axes.
-- Computed from empirical value distributions during 17lands-fetch.
-- center = mean of raw values, steepness = 4/σ (maps ±2σ to ~0.02-0.98).

CREATE TABLE IF NOT EXISTS magic_draft_calibration (
  set_code   TEXT NOT NULL,
  axis       TEXT NOT NULL,
  center     REAL NOT NULL,
  steepness  REAL NOT NULL,
  PRIMARY KEY (set_code, axis)
);
