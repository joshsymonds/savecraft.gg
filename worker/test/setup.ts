import { env } from "cloudflare:test";

import { CLEANUP_TABLES } from "./helpers";

// Apply D1 migrations before tests run.
// Using individual prepare().run() calls because D1.exec() has metadata
// aggregation bugs in certain workerd versions.
const statements = [
  `CREATE TABLE IF NOT EXISTS sources (
    source_uuid TEXT PRIMARY KEY,
    user_uuid TEXT,
    user_email TEXT,
    user_display_name TEXT,
    token_hash TEXT NOT NULL UNIQUE,
    link_code TEXT,
    link_code_expires_at TEXT,
    hostname TEXT,
    device TEXT,
    os TEXT,
    arch TEXT,
    source_kind TEXT NOT NULL DEFAULT 'daemon',
    can_rescan INTEGER NOT NULL DEFAULT 1,
    can_receive_config INTEGER NOT NULL DEFAULT 1,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_push_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_uuid)`,
  `CREATE INDEX IF NOT EXISTS idx_sources_link_code ON sources(link_code) WHERE link_code IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_sources_token ON sources(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_sources_ip ON sources(ip)`,
  `CREATE INDEX IF NOT EXISTS idx_sources_source_kind ON sources(source_kind)`,
  `CREATE TABLE IF NOT EXISTS saves (
    uuid TEXT PRIMARY KEY,
    user_uuid TEXT,
    game_id TEXT NOT NULL,
    game_name TEXT NOT NULL DEFAULT '',
    save_name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    last_updated TEXT NOT NULL DEFAULT (datetime('now')),
    last_source_uuid TEXT,
    refresh_status TEXT,
    refresh_error TEXT,
    removed_at TEXT,
    UNIQUE (user_uuid, game_id, save_name)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_saves_user ON saves(user_uuid)`,
  `CREATE INDEX IF NOT EXISTS idx_saves_last_updated ON saves(last_updated)`,
  `CREATE TABLE IF NOT EXISTS source_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_uuid TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_source_events_source
    ON source_events(source_uuid, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS source_configs (
    source_uuid TEXT NOT NULL,
    game_id TEXT NOT NULL,
    save_path TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    file_extensions TEXT NOT NULL DEFAULT '[]',
    file_patterns TEXT NOT NULL DEFAULT '[]',
    exclude_dirs TEXT NOT NULL DEFAULT '[]',
    exclude_saves TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    config_status TEXT NOT NULL DEFAULT 'pending',
    resolved_path TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '',
    result_at TEXT,
    PRIMARY KEY (source_uuid, game_id)
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    note_id TEXT PRIMARY KEY,
    save_id TEXT NOT NULL REFERENCES saves(uuid),
    user_uuid TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notes_save
    ON notes(save_id, user_uuid)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    save_id UNINDEXED,
    save_name UNINDEXED,
    type UNINDEXED,
    ref_id UNINDEXED,
    ref_title UNINDEXED,
    content,
    tokenize='porter unicode61'
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    user_uuid TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT 'default',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_uuid)`,
  `CREATE TABLE IF NOT EXISTS mcp_activity (user_uuid TEXT PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS sections (
    save_uuid TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (save_uuid, name),
    FOREIGN KEY (save_uuid) REFERENCES saves(uuid) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS linked_characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_uuid TEXT NOT NULL,
    game_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    character_name TEXT NOT NULL,
    metadata TEXT,
    source_uuid TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_uuid, game_id, character_id)
  )`,
  `CREATE TABLE IF NOT EXISTS game_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_uuid TEXT NOT NULL,
    game_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_uuid, game_id)
  )`,
  // MTG Arena rules + card rulings (migration 0014)
  `CREATE TABLE IF NOT EXISTS mtga_rules (
    number TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    example TEXT,
    see_also TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS mtga_card_rulings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    oracle_id TEXT NOT NULL,
    card_name TEXT NOT NULL,
    published_at TEXT,
    comment TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_card_rulings_oracle ON mtga_card_rulings(oracle_id)`,
  `CREATE INDEX IF NOT EXISTS idx_card_rulings_name ON mtga_card_rulings(card_name)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS mtga_rules_fts USING fts5(
    number UNINDEXED,
    text,
    example,
    tokenize='porter unicode61'
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS mtga_card_rulings_fts USING fts5(
    oracle_id UNINDEXED,
    card_name,
    comment,
    tokenize='porter unicode61'
  )`,
  // MTG Arena cards + draft ratings (migration 0015)
  `CREATE TABLE IF NOT EXISTS mtga_cards (
    arena_id INTEGER PRIMARY KEY,
    oracle_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mana_cost TEXT NOT NULL DEFAULT '',
    cmc REAL NOT NULL DEFAULT 0,
    type_line TEXT NOT NULL DEFAULT '',
    oracle_text TEXT NOT NULL DEFAULT '',
    colors TEXT NOT NULL DEFAULT '[]',
    color_identity TEXT NOT NULL DEFAULT '[]',
    legalities TEXT NOT NULL DEFAULT '{}',
    rarity TEXT NOT NULL DEFAULT '',
    set_code TEXT NOT NULL DEFAULT '',
    keywords TEXT NOT NULL DEFAULT '[]',
    is_default INTEGER NOT NULL DEFAULT 0,
    front_face_name TEXT NOT NULL DEFAULT '',
    produced_mana TEXT NOT NULL DEFAULT '[]'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mtga_cards_name ON mtga_cards(name)`,
  `CREATE INDEX IF NOT EXISTS idx_mtga_cards_set ON mtga_cards(set_code)`,
  `CREATE INDEX IF NOT EXISTS idx_mtga_cards_rarity ON mtga_cards(rarity)`,
  `CREATE INDEX IF NOT EXISTS idx_mtga_cards_is_default ON mtga_cards(is_default)`,
  `CREATE INDEX IF NOT EXISTS idx_mtga_cards_name_default ON mtga_cards(name, is_default)`,
  `CREATE INDEX IF NOT EXISTS idx_mtga_cards_front_face ON mtga_cards(front_face_name)`,
  `CREATE INDEX IF NOT EXISTS idx_mtga_cards_front_face_default ON mtga_cards(front_face_name, is_default)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS mtga_cards_fts USING fts5(
    arena_id UNINDEXED,
    name,
    oracle_text,
    type_line,
    tokenize='porter unicode61'
  )`,
  `CREATE TABLE IF NOT EXISTS mtga_draft_ratings (
    set_code TEXT NOT NULL,
    card_name TEXT NOT NULL,
    games_in_hand INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    games_not_seen INTEGER NOT NULL DEFAULT 0,
    gihwr REAL NOT NULL DEFAULT 0,
    ohwr REAL NOT NULL DEFAULT 0,
    gdwr REAL NOT NULL DEFAULT 0,
    gnswr REAL NOT NULL DEFAULT 0,
    iwd REAL NOT NULL DEFAULT 0,
    alsa REAL NOT NULL DEFAULT 0,
    ata REAL NOT NULL DEFAULT 0,
    ata_stddev REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (set_code, card_name)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_draft_ratings_set ON mtga_draft_ratings(set_code)`,
  `CREATE INDEX IF NOT EXISTS idx_draft_ratings_gihwr ON mtga_draft_ratings(set_code, gihwr DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_draft_ratings_iwd ON mtga_draft_ratings(set_code, iwd DESC)`,
  `CREATE TABLE IF NOT EXISTS mtga_draft_archetype_stats (
    set_code TEXT NOT NULL,
    card_name TEXT NOT NULL,
    archetype TEXT NOT NULL,
    games_in_hand INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    games_not_seen INTEGER NOT NULL DEFAULT 0,
    gihwr REAL NOT NULL DEFAULT 0,
    ohwr REAL NOT NULL DEFAULT 0,
    gdwr REAL NOT NULL DEFAULT 0,
    gnswr REAL NOT NULL DEFAULT 0,
    iwd REAL NOT NULL DEFAULT 0,
    alsa REAL NOT NULL DEFAULT 0,
    ata REAL NOT NULL DEFAULT 0,
    ata_stddev REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (set_code, card_name, archetype)
  )`,
  `CREATE TABLE IF NOT EXISTS mtga_draft_set_stats (
    set_code TEXT PRIMARY KEY,
    format TEXT NOT NULL DEFAULT '',
    total_games INTEGER NOT NULL DEFAULT 0,
    card_count INTEGER NOT NULL DEFAULT 0,
    avg_gihwr REAL NOT NULL DEFAULT 0
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS mtga_draft_ratings_fts USING fts5(
    set_code UNINDEXED,
    card_name,
    tokenize='porter unicode61'
  )`,
  // Draft synergies + archetype curves (migration 0017)
  `CREATE TABLE IF NOT EXISTS mtga_draft_synergies (
    set_code TEXT NOT NULL,
    card_a TEXT NOT NULL,
    card_b TEXT NOT NULL,
    synergy_delta REAL NOT NULL DEFAULT 0,
    games_together INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (set_code, card_a, card_b)
  )`,
  `CREATE TABLE IF NOT EXISTS mtga_draft_archetype_curves (
    set_code TEXT NOT NULL,
    archetype TEXT NOT NULL,
    cmc INTEGER NOT NULL,
    avg_count REAL NOT NULL DEFAULT 0,
    total_decks INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (set_code, archetype, cmc)
  )`,
  // Card role tags from Scryfall Tagger (migration 0019)
  `CREATE TABLE IF NOT EXISTS mtga_card_roles (
    oracle_id TEXT NOT NULL,
    front_face_name TEXT NOT NULL,
    role TEXT NOT NULL,
    set_code TEXT NOT NULL,
    PRIMARY KEY (oracle_id, role, set_code)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_card_roles_name ON mtga_card_roles(front_face_name, set_code)`,
  `CREATE INDEX IF NOT EXISTS idx_card_roles_set ON mtga_card_roles(set_code)`,
  // Role targets (migration 0022)
  `CREATE TABLE IF NOT EXISTS mtga_draft_role_targets (
    set_code TEXT NOT NULL,
    archetype TEXT NOT NULL,
    role TEXT NOT NULL,
    avg_count REAL NOT NULL,
    total_decks INTEGER NOT NULL,
    PRIMARY KEY (set_code, archetype, role)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_role_targets_set ON mtga_draft_role_targets(set_code)`,
  // Sigmoid calibration (migration 0023)
  `CREATE TABLE IF NOT EXISTS mtga_draft_calibration (
    set_code TEXT NOT NULL,
    axis TEXT NOT NULL,
    center REAL NOT NULL,
    steepness REAL NOT NULL,
    PRIMARY KEY (set_code, axis)
  )`,
  // Set metadata (migration 0025)
  `CREATE TABLE IF NOT EXISTS mtga_set_metadata (
    set_code TEXT PRIMARY KEY,
    asfan REAL NOT NULL DEFAULT 0.4,
    pack_size INTEGER NOT NULL DEFAULT 14
  )`,
  // Deck stats (migration 0026)
  `CREATE TABLE IF NOT EXISTS mtga_draft_deck_stats (
    set_code TEXT NOT NULL,
    archetype TEXT NOT NULL,
    avg_lands REAL NOT NULL,
    avg_creatures REAL NOT NULL,
    avg_noncreatures REAL NOT NULL,
    avg_fixing REAL NOT NULL,
    splash_rate REAL NOT NULL,
    splash_avg_sources REAL NOT NULL,
    splash_winrate REAL NOT NULL,
    nonsplash_winrate REAL NOT NULL,
    total_decks INTEGER NOT NULL,
    PRIMARY KEY (set_code, archetype)
  )`,
  // Pipeline state (migration 0027)
  `CREATE TABLE IF NOT EXISTS mtga_pipeline_state (
    tool TEXT NOT NULL,
    set_code TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    PRIMARY KEY (tool, set_code)
  )`,
  // Constructed: match history (migration 0029)
  `CREATE TABLE IF NOT EXISTS mtga_match_history (
    match_id TEXT NOT NULL,
    user_uuid TEXT NOT NULL,
    event_id TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT '',
    deck_name TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL,
    game_results TEXT NOT NULL DEFAULT '[]',
    opponent_name TEXT NOT NULL DEFAULT '',
    opponent_rank TEXT NOT NULL DEFAULT '',
    opponent_cards TEXT NOT NULL DEFAULT '[]',
    played_at TEXT NOT NULL,
    PRIMARY KEY (match_id, user_uuid)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_match_history_user_format ON mtga_match_history(user_uuid, format)`,
  `CREATE INDEX IF NOT EXISTS idx_match_history_user_deck ON mtga_match_history(user_uuid, deck_name)`,
  `CREATE INDEX IF NOT EXISTS idx_match_history_user_time ON mtga_match_history(user_uuid, played_at DESC)`,
  // Constructed: metagame archetypes (migration 0029)
  `CREATE TABLE IF NOT EXISTS mtga_meta_archetypes (
    format TEXT NOT NULL,
    archetype_name TEXT NOT NULL,
    metagame_share REAL NOT NULL DEFAULT 0,
    win_rate REAL NOT NULL DEFAULT 0,
    sample_size INTEGER NOT NULL DEFAULT 0,
    last_updated TEXT NOT NULL,
    PRIMARY KEY (format, archetype_name)
  )`,
  // Constructed: tournament decklists (migration 0029)
  `CREATE TABLE IF NOT EXISTS mtga_meta_decklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    format TEXT NOT NULL,
    archetype_name TEXT NOT NULL,
    tournament_id TEXT NOT NULL,
    tournament_name TEXT NOT NULL DEFAULT '',
    player_name TEXT NOT NULL DEFAULT '',
    placement INTEGER,
    decklist TEXT NOT NULL DEFAULT '{}',
    date TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_meta_decklists_format_archetype ON mtga_meta_decklists(format, archetype_name)`,
  `CREATE INDEX IF NOT EXISTS idx_meta_decklists_format_date ON mtga_meta_decklists(format, date DESC)`,
  // Constructed: archetype matchups (migration 0029)
  `CREATE TABLE IF NOT EXISTS mtga_meta_matchups (
    format TEXT NOT NULL,
    archetype_a TEXT NOT NULL,
    archetype_b TEXT NOT NULL,
    win_rate_a REAL NOT NULL DEFAULT 0,
    sample_size INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (format, archetype_a, archetype_b)
  )`,
  // Play advisor tables (migration 0030)
  `CREATE TABLE IF NOT EXISTS mtga_play_card_timing (
    set_code TEXT NOT NULL,
    card_name TEXT NOT NULL,
    archetype TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    times_deployed INTEGER NOT NULL DEFAULT 0,
    games_won INTEGER NOT NULL DEFAULT 0,
    total_games INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (set_code, card_name, archetype, turn_number)
  )`,
  `CREATE TABLE IF NOT EXISTS mtga_play_tempo (
    set_code TEXT NOT NULL,
    archetype TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    on_play INTEGER NOT NULL,
    mana_spent_bucket INTEGER NOT NULL,
    games_won INTEGER NOT NULL DEFAULT 0,
    total_games INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (set_code, archetype, turn_number, on_play, mana_spent_bucket)
  )`,
  `CREATE TABLE IF NOT EXISTS mtga_play_combat (
    set_code TEXT NOT NULL,
    attacker_name TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    user_creatures_count INTEGER NOT NULL,
    oppo_creatures_count INTEGER NOT NULL,
    attacked INTEGER NOT NULL,
    games_won INTEGER NOT NULL DEFAULT 0,
    total_games INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (set_code, attacker_name, turn_number, user_creatures_count, oppo_creatures_count, attacked)
  )`,
  `CREATE TABLE IF NOT EXISTS mtga_play_mulligan (
    set_code TEXT NOT NULL,
    archetype TEXT NOT NULL,
    on_play INTEGER NOT NULL,
    land_count INTEGER NOT NULL,
    nonland_cmc_bucket TEXT NOT NULL,
    num_mulligans INTEGER NOT NULL,
    games_won INTEGER NOT NULL DEFAULT 0,
    total_games INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (set_code, archetype, on_play, land_count, nonland_cmc_bucket, num_mulligans)
  )`,
  `CREATE TABLE IF NOT EXISTS mtga_play_turn_baselines (
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
  )`,
];

for (const sql of statements) {
  await env.DB.prepare(sql).run();
}

// Clean all data at startup. Each test's describe block uses beforeEach(cleanAll)
// for per-test cleanup; this module-level pass provides a clean baseline when
// the suite begins.
for (const table of CLEANUP_TABLES) {
  await env.DB.prepare(`DELETE FROM ${table}`).run();
}

// Clean R2 between test files
for (const bucket of [env.PLUGINS]) {
  const listed = await bucket.list();
  for (const object of listed.objects) {
    await bucket.delete(object.key);
  }
}
