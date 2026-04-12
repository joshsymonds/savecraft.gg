-- Add support gem mechanical fields to poe_gems for richer gem_search output.
-- These fields surface minion/totem interaction rules and cost multipliers
-- that LLMs need to reason correctly about support gem mechanics.

ALTER TABLE poe_gems ADD COLUMN mana_multiplier INTEGER;
ALTER TABLE poe_gems ADD COLUMN cannot_support_minions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE poe_gems ADD COLUMN minion_excluded_effects TEXT NOT NULL DEFAULT '[]';
ALTER TABLE poe_gems ADD COLUMN require_skill_types TEXT NOT NULL DEFAULT '[]';
ALTER TABLE poe_gems ADD COLUMN exclude_skill_types TEXT NOT NULL DEFAULT '[]';
