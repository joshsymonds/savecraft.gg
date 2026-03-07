/**
 * Blizzard and Raider.io API response types.
 * Derived from real fixture data in plugins/wow/testdata/.
 *
 * Only fields we consume for GameState sections are typed.
 * Blizzard responses contain many `_links` and `key.href` fields
 * that we don't use — those are omitted.
 */

// ---------------------------------------------------------------------------
// Blizzard common patterns
// ---------------------------------------------------------------------------

export interface KeyedRef {
  key: { href: string };
  name: string;
  id: number;
}

export interface TypedName {
  type: string;
  name: string;
}

export interface CharacterRef {
  key: { href: string };
  name: string;
  id: number;
  realm: RealmRef;
}

export interface RealmRef {
  key: { href: string };
  name: string;
  id: number;
  slug: string;
}

export interface RatingValue {
  rating_bonus: number;
  value?: number;
  rating_normalized: number;
}

// ---------------------------------------------------------------------------
// Blizzard Profile
// ---------------------------------------------------------------------------

export interface BlizzardProfile {
  id: number;
  name: string;
  gender: TypedName;
  faction: TypedName;
  race: KeyedRef;
  character_class: KeyedRef;
  active_spec: KeyedRef;
  realm: RealmRef;
  guild?: {
    key: { href: string };
    name: string;
    id: number;
    realm: RealmRef;
    faction: TypedName;
  };
  level: number;
  experience: number;
  achievement_points: number;
  last_login_timestamp: number;
  average_item_level: number;
  equipped_item_level: number;
  active_title?: {
    key: { href: string };
    name: string;
    id: number;
    display_string: string;
  };
  covenant_progress?: {
    chosen_covenant: KeyedRef;
    renown_level: number;
  };
}

// ---------------------------------------------------------------------------
// Blizzard Equipment
// ---------------------------------------------------------------------------

export interface BlizzardEquipment {
  character: CharacterRef;
  equipped_items: BlizzardEquipmentItem[];
}

export interface BlizzardEquipmentItem {
  item: { key: { href: string }; id: number };
  slot: TypedName;
  name: string;
  quality: TypedName;
  level: { value: number; display_string: string };
  item_class: KeyedRef;
  item_subclass: KeyedRef;
  inventory_type: TypedName;
  binding?: TypedName;
  armor?: { value: number };
  stats?: BlizzardItemStat[];
  enchantments?: BlizzardEnchantment[];
  sockets?: BlizzardSocket[];
  set?: { item_set: KeyedRef; display_string: string };
  requirements?: { level?: { value: number } };
  durability?: { value: number; display_string: string };
  transmog?: { item: KeyedRef; display_string: string };
  sell_price?: { value: number };
}

export interface BlizzardItemStat {
  type: TypedName;
  value: number;
  is_negated?: boolean;
  is_equip_bonus?: boolean;
  display: { display_string: string };
}

export interface BlizzardEnchantment {
  display_string: string;
  source_item?: KeyedRef;
  enchantment_id: number;
  enchantment_slot: { id: number; type: string };
}

export interface BlizzardSocket {
  socket_type: TypedName;
  item?: KeyedRef;
  display_string: string;
}

// ---------------------------------------------------------------------------
// Blizzard Statistics
// ---------------------------------------------------------------------------

export interface BlizzardStatistics {
  health: number;
  power: number;
  power_type: KeyedRef;
  speed: RatingValue;
  strength: { base: number; effective: number };
  agility: { base: number; effective: number };
  intellect: { base: number; effective: number };
  stamina: { base: number; effective: number };
  melee_crit: RatingValue;
  melee_haste: RatingValue;
  mastery: RatingValue;
  bonus_armor: number;
  lifesteal: RatingValue;
  versatility: number;
  versatility_damage_done_bonus: number;
  versatility_healing_done_bonus: number;
  versatility_damage_taken_bonus: number;
  avoidance: RatingValue;
  attack_power: number;
  main_hand_damage_min: number;
  main_hand_damage_max: number;
  main_hand_speed: number;
  main_hand_dps: number;
  off_hand_damage_min: number;
  off_hand_damage_max: number;
  off_hand_speed: number;
  off_hand_dps: number;
  spell_power: number;
  spell_penetration: number;
  spell_crit: RatingValue;
  mana_regen: number;
  mana_regen_combat: number;
  armor: { base: number; effective: number };
  dodge: RatingValue;
  parry: RatingValue;
  block: RatingValue;
  ranged_crit: RatingValue;
  ranged_haste: RatingValue;
  spell_haste: RatingValue;
  character: CharacterRef;
}

// ---------------------------------------------------------------------------
// Blizzard Specializations (Talents)
// ---------------------------------------------------------------------------

export interface BlizzardSpecializations {
  specializations: BlizzardSpecEntry[];
  active_specialization: KeyedRef;
  character: CharacterRef;
}

export interface BlizzardSpecEntry {
  specialization: KeyedRef;
  pvp_talent_slots?: BlizzardPvpTalentSlot[];
  loadouts: BlizzardTalentLoadout[];
}

export interface BlizzardPvpTalentSlot {
  selected: {
    talent: KeyedRef;
    spell_tooltip: BlizzardSpellTooltip;
  };
  slot_number: number;
}

export interface BlizzardTalentLoadout {
  is_active: boolean;
  talent_loadout_code: string;
  selected_class_talents: BlizzardSelectedTalent[];
  selected_spec_talents: BlizzardSelectedTalent[];
  selected_hero_talents?: BlizzardSelectedTalent[];
}

export interface BlizzardSelectedTalent {
  id: number;
  rank: number;
  default_points?: number;
  tooltip?: {
    talent: KeyedRef;
    spell_tooltip: BlizzardSpellTooltip;
  };
}

export interface BlizzardSpellTooltip {
  spell: KeyedRef;
  description: string;
  cast_time: string;
  power_cost?: string;
  range?: string;
  cooldown?: string;
}

// ---------------------------------------------------------------------------
// Blizzard Mythic Keystone Profile
// ---------------------------------------------------------------------------

export interface BlizzardMythicKeystoneProfile {
  current_period: { period: { key: { href: string }; id: number } };
  seasons: { key: { href: string }; id: number }[];
  character: CharacterRef;
}

export interface BlizzardMythicKeystoneSeason {
  season: { key: { href: string }; id: number };
  best_runs: BlizzardMythicRun[];
  character: CharacterRef;
}

export interface BlizzardMythicRun {
  completed_timestamp: number;
  duration: number;
  keystone_level: number;
  keystone_affixes: KeyedRef[];
  members: BlizzardMythicMember[];
  dungeon: KeyedRef;
  is_completed_within_time: boolean;
  mythic_rating: {
    color: { r: number; g: number; b: number; a: number };
    rating: number;
  };
}

export interface BlizzardMythicMember {
  character: {
    name: string;
    id: number;
    realm: { key: { href: string }; id: number; slug: string };
  };
  specialization: KeyedRef;
  race: KeyedRef;
  equipped_item_level: number;
}

// ---------------------------------------------------------------------------
// Blizzard Raids
// ---------------------------------------------------------------------------

export interface BlizzardRaids {
  character: CharacterRef;
  expansions: BlizzardRaidExpansion[];
}

export interface BlizzardRaidExpansion {
  expansion: KeyedRef;
  instances: BlizzardRaidInstance[];
}

export interface BlizzardRaidInstance {
  instance: KeyedRef;
  modes: BlizzardRaidMode[];
}

export interface BlizzardRaidMode {
  difficulty: TypedName;
  status: TypedName;
  progress: {
    completed_count: number;
    total_count: number;
    encounters: BlizzardRaidEncounter[];
  };
}

export interface BlizzardRaidEncounter {
  encounter: KeyedRef;
  completed_count: number;
  last_kill_timestamp: number;
}

// ---------------------------------------------------------------------------
// Blizzard Professions
// ---------------------------------------------------------------------------

export interface BlizzardProfessions {
  character: CharacterRef;
  primaries?: BlizzardProfession[];
  secondaries?: BlizzardProfession[];
}

export interface BlizzardProfession {
  profession: KeyedRef;
  tiers?: BlizzardProfessionTier[];
}

export interface BlizzardProfessionTier {
  skill_points: number;
  max_skill_points: number;
  tier: { name: string; id: number };
  known_recipes?: KeyedRef[];
}

// ---------------------------------------------------------------------------
// Raider.io Profile
// ---------------------------------------------------------------------------

export interface RaiderioProfile {
  name: string;
  race: string;
  class: string;
  active_spec_name: string;
  active_spec_role: string;
  gender: string;
  faction: string;
  achievement_points: number;
  thumbnail_url: string;
  region: string;
  realm: string;
  last_crawled_at: string;
  profile_url: string;
  mythic_plus_scores_by_season: RaiderioSeasonScore[];
  mythic_plus_recent_runs: RaiderioRun[];
  mythic_plus_best_runs: RaiderioRun[];
  raid_progression: Record<string, RaiderioRaidProgress>;
  gear: RaiderioGear;
}

export interface RaiderioSeasonScore {
  season: string;
  scores: {
    all: number;
    dps: number;
    healer: number;
    tank: number;
    spec_0: number;
    spec_1: number;
    spec_2: number;
    spec_3: number;
  };
  segments: Record<
    string,
    {
      score: number;
      color: string;
    }
  >;
}

export interface RaiderioRun {
  dungeon: string;
  short_name: string;
  mythic_level: number;
  completed_at: string;
  clear_time_ms: number;
  par_time_ms: number;
  num_keystone_upgrades: number;
  score: number;
  affixes: { id: number; name: string; description: string; icon: string }[];
  url: string;
}

export interface RaiderioRaidProgress {
  summary: string;
  total_bosses: number;
  normal_bosses_killed: number;
  heroic_bosses_killed: number;
  mythic_bosses_killed: number;
}

export interface RaiderioGear {
  item_level_equipped: number;
  item_level_total: number;
  items: Record<string, RaiderioGearItem>;
}

export interface RaiderioGearItem {
  item_id: number;
  item_level: number;
  icon: string;
  name: string;
  item_quality: number;
  is_legendary: boolean;
  enchant?: number;
  gems?: number[];
  bonuses?: number[];
  tier?: string;
}
