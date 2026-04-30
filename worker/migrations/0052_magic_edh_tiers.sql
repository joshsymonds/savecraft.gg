-- EDHREC's four power/budget tiers per commander.
-- Tiers map to EDHREC URLs: /pages/commanders/{slug}/{tier}.json
--   budget    — cheapest commonly-built shape (~$150-300)
--   upgraded  — moderate budget (~$1k)
--   optimized — high power non-cEDH (~$2-3k)
--   cedh      — tournament-level (~$5k+)
--
-- Each tier is an empirical "average decklist for commander X at tier Y" with
-- its own avg_price + sample size + 99-card list.

CREATE TABLE IF NOT EXISTS magic_edh_commander_tiers (
  commander_id  TEXT NOT NULL,
  tier          TEXT NOT NULL,
  avg_price     REAL NOT NULL DEFAULT 0,
  num_decks_avg INTEGER NOT NULL DEFAULT 0,
  deck_size     INTEGER NOT NULL DEFAULT 100,
  PRIMARY KEY (commander_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_edh_tiers_commander ON magic_edh_commander_tiers(commander_id);
CREATE INDEX IF NOT EXISTS idx_edh_tiers_avg_price ON magic_edh_commander_tiers(tier, avg_price);

CREATE TABLE IF NOT EXISTS magic_edh_average_decks_by_tier (
  commander_id  TEXT NOT NULL,
  tier          TEXT NOT NULL,
  card_name     TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  category      TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (commander_id, tier, card_name)
);

CREATE INDEX IF NOT EXISTS idx_edh_avg_tier_commander
  ON magic_edh_average_decks_by_tier(commander_id, tier);
