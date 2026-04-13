-- Drop magic_set_metadata. The table has been empty across staging and
-- production for the entire history of the project; no fetch tool ever
-- populated it and draft_advisor has always fallen back to the hardcoded
-- DEFAULT_ASFAN (0.4) and DEFAULT_PACK_SIZE (14) constants in scoring.ts.
-- Removing the dead lookup in favor of the inline defaults.

DROP TABLE IF EXISTS magic_set_metadata;
