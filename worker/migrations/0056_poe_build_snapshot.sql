-- Per-character Path of Building snapshot for PoE adapter saves.
--
-- One row per save = the build as of its last refresh_save. The
-- content-addressed pob_build_id + the PoB summary are surfaced to the
-- AI as the `pob_build` GameState section; the raw PoB XML is stored
-- ONLY here (never in a section or the FTS index) and is re-fed to
-- pob-server's /calc if the content-addressed build is evicted, so the
-- build_id stays resolvable for build_planner.
CREATE TABLE poe_build_snapshot (
  save_uuid TEXT PRIMARY KEY REFERENCES saves(uuid) ON DELETE CASCADE,
  pob_build_id TEXT NOT NULL,
  pob_xml TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
