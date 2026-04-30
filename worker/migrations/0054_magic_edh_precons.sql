-- EDHREC preconstructed deck data: ~5-10 new precons per year, retail $30-60.
-- Used by the deck-builder in M4 to support starting_point='precon:auto'
-- (the casual "buy precon + upgrade ~$60 of singles to hit your budget" path).
--
-- Four tables: header (slug + MSRP + set), decklist, upgrade pool (add/cut),
-- commander references (the dominant face commander + alternates).

CREATE TABLE IF NOT EXISTS magic_edh_precons (
  slug          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  msrp_usd      REAL,    -- NULL when precon is not in the hardcoded MSRP table
  set_code      TEXT,
  release_year  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_edh_precons_msrp ON magic_edh_precons(msrp_usd) WHERE msrp_usd IS NOT NULL;

CREATE TABLE IF NOT EXISTS magic_edh_precon_decks (
  precon_slug TEXT NOT NULL,
  card_name   TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  category    TEXT NOT NULL DEFAULT '',  -- card type ("Land", "Creature", etc.)
  PRIMARY KEY (precon_slug, card_name)
);

CREATE INDEX IF NOT EXISTS idx_edh_precon_decks_slug ON magic_edh_precon_decks(precon_slug);

CREATE TABLE IF NOT EXISTS magic_edh_precon_upgrades (
  precon_slug TEXT NOT NULL,
  card_name   TEXT NOT NULL,
  action      TEXT NOT NULL,  -- 'add' | 'cut' | 'land_add' | 'land_cut'
  category    TEXT,            -- EDHREC tag preserved (cardstoadd, landstocut, etc.)
  inclusion   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (precon_slug, card_name, action)
);

CREATE INDEX IF NOT EXISTS idx_edh_precon_upgrades_slug
  ON magic_edh_precon_upgrades(precon_slug, action);

CREATE TABLE IF NOT EXISTS magic_edh_precon_commanders (
  precon_slug    TEXT NOT NULL,
  commander_name TEXT NOT NULL,
  deck_count     INTEGER NOT NULL DEFAULT 0,
  is_face        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (precon_slug, commander_name)
);

CREATE INDEX IF NOT EXISTS idx_edh_precon_commanders_face
  ON magic_edh_precon_commanders(precon_slug, is_face) WHERE is_face = 1;
