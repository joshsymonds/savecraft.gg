-- crossSetCardTiming (plugins/magic/reference/play-advisor.ts) queries
-- magic_play_card_timing WHERE archetype = 'ALL' AND card_name IN (...)
-- with no set_code predicate — the table's only index is the PRIMARY KEY
-- (set_code, card_name, archetype, turn_number), whose leading column is
-- unconstrained here. That forces a full table scan on the default
-- (set-omitted) path, which is what Constructed/Brawl decks hit since
-- they span many sets.
CREATE INDEX IF NOT EXISTS idx_magic_play_card_timing_card
  ON magic_play_card_timing(card_name, archetype, set_code, turn_number);
