-- Play advisor tables: aggregated per-turn gameplay statistics from 17Lands replay_data.
-- Populated by replay-fetch tool, queried by play_advisor reference module.

-- Per-card deployment timing → win rate by turn.
CREATE TABLE IF NOT EXISTS mtga_play_card_timing (
  set_code TEXT NOT NULL,
  card_name TEXT NOT NULL,
  archetype TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  times_deployed INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  total_games INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_code, card_name, archetype, turn_number)
);

-- Mana efficiency per turn per archetype.
-- mana_spent_bucket: 0, 1, 2, 3, 4, 5 (where 5 = 5+).
CREATE TABLE IF NOT EXISTS mtga_play_tempo (
  set_code TEXT NOT NULL,
  archetype TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  on_play INTEGER NOT NULL,
  mana_spent_bucket INTEGER NOT NULL,
  games_won INTEGER NOT NULL DEFAULT 0,
  total_games INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_code, archetype, turn_number, on_play, mana_spent_bucket)
);

-- Attack patterns: per-creature attack decisions correlated with outcome.
-- user_creatures_count/oppo_creatures_count capped at 4 (4 = 4+).
-- attacked: 1 = creature attacked this turn, 0 = held back.
CREATE TABLE IF NOT EXISTS mtga_play_combat (
  set_code TEXT NOT NULL,
  attacker_name TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  user_creatures_count INTEGER NOT NULL,
  oppo_creatures_count INTEGER NOT NULL,
  attacked INTEGER NOT NULL,
  games_won INTEGER NOT NULL DEFAULT 0,
  total_games INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_code, attacker_name, turn_number, user_creatures_count, oppo_creatures_count, attacked)
);

-- Mulligan hand shapes → win rate.
-- nonland_cmc_bucket: 'low' (avg < 2.0), 'mid' (2.0-3.0), 'high' (> 3.0).
CREATE TABLE IF NOT EXISTS mtga_play_mulligan (
  set_code TEXT NOT NULL,
  archetype TEXT NOT NULL,
  on_play INTEGER NOT NULL,
  land_count INTEGER NOT NULL,
  nonland_cmc_bucket TEXT NOT NULL,
  num_mulligans INTEGER NOT NULL,
  games_won INTEGER NOT NULL DEFAULT 0,
  total_games INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_code, archetype, on_play, land_count, nonland_cmc_bucket, num_mulligans)
);

-- Per-turn aggregate baselines for game_review normalization.
-- Stores totals (not averages) so averages can be computed at query time
-- and sample sizes are transparent.
CREATE TABLE IF NOT EXISTS mtga_play_turn_baselines (
  set_code TEXT NOT NULL,
  archetype TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  on_play INTEGER NOT NULL,
  total_mana_spent REAL NOT NULL DEFAULT 0,
  total_creatures_cast INTEGER NOT NULL DEFAULT 0,
  total_spells_cast INTEGER NOT NULL DEFAULT 0,
  total_creatures_attacked INTEGER NOT NULL DEFAULT 0,
  total_attacks_possible INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  total_games INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_code, archetype, turn_number, on_play)
);
