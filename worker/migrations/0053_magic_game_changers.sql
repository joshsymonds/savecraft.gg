-- WotC Bracket System "Game Changers" — the canonical ~50-card list of
-- cards that push a Commander deck toward higher brackets. Maintained as
-- a hardcoded Go slice in plugins/magic/tools/edhrec-fetch/gamechangers.go
-- (source of truth: Scryfall's `is:gamechanger` predicate).
--
-- The deck-builder uses this table in M4 to enforce bracket constraints
-- (e.g. Bracket 1-2 requires zero game changers).

CREATE TABLE IF NOT EXISTS magic_game_changers (
  card_name TEXT PRIMARY KEY,
  source    TEXT NOT NULL DEFAULT 'wotc-official',
  added_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
