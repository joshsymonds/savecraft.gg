// Dumps a subset of production D1 data for the 9-commander spot-check
// matrix into a SQL fixture the local vitest harness replays.
//
// Output: worker/test/fixtures/spot-check.sql (gitignored).
//
// Tables dumped:
//   - magic_edh_commanders (9 rows)
//   - magic_edh_recommendations (per commander, ~300 rows × 9)
//   - magic_edh_card_prices (per unique card across recs)
//   - magic_cards (per unique card; default printing + non-placeholder)
//   - magic_card_roles (per unique card)
//   - magic_edh_average_decks_by_tier (per commander × all tiers)
//   - magic_game_changers (global, ~50 rows)
//
// Auth: requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in env.
// Database: production "savecraft" (id from wrangler.toml).
//
// Usage: npx tsx scripts/dump-spot-check-fixture.ts

import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_FILE = resolve(ROOT, "worker/test/fixtures/spot-check.sql");
const PROD_DB_ID = "df241bb0-9b7d-48e5-a4d4-f84ebf09e6e5";

const SPOT_CHECK_SLUGS = [
  "atraxa-praetors-voice",
  "edgar-markov",
  "krenko-mob-boss",
  "lathril-blade-of-the-elves",
  "kinnan-bonder-prodigy",
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    console.error(
      "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (typically loaded via direnv from .envrc.local).",
    );
    process.exit(1);
  }
  return value;
}

const ACCOUNT_ID = requireEnv("CLOUDFLARE_ACCOUNT_ID");
const API_TOKEN = requireEnv("CLOUDFLARE_API_TOKEN");

interface QueryResult<T> {
  results: T[];
}

interface CFResponse<T> {
  success: boolean;
  errors: { message: string }[];
  result: QueryResult<T>[];
}

async function d1Query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${PROD_DB_ID}/query`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({ sql, params }),
  });
  if (!resp.ok) {
    throw new Error(`D1 query HTTP ${String(resp.status)}: ${await resp.text()}`);
  }
  const json = (await resp.json()) as CFResponse<T>;
  if (!json.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(json.errors)}`);
  }
  return json.result[0]?.results ?? [];
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  // Strings — escape single quotes by doubling.
  const s = String(value);
  return `'${s.replace(/'/g, "''")}'`;
}

function insertRow(
  table: string,
  columns: string[],
  row: object,
): string {
  const r = row as Record<string, unknown>;
  const values = columns.map((col) => sqlLiteral(r[col])).join(", ");
  return `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${values});`;
}

// Chunk an array into N-element slices for IN-clause batching (D1 binds 90 max).
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchInChunks<T>(
  buildSql: (placeholders: string) => string,
  values: string[],
): Promise<T[]> {
  if (values.length === 0) return [];
  const out: T[] = [];
  for (const slice of chunk(values, 90)) {
    const placeholders = slice.map(() => "?").join(",");
    const rows = await d1Query<T>(buildSql(placeholders), slice);
    out.push(...rows);
  }
  return out;
}

interface CommanderRow {
  scryfall_id: string;
  name: string;
  slug: string;
  color_identity: string;
  deck_count: number;
  themes: string;
  similar: string;
  rank: number | null;
  salt: number | null;
  updated_at: string;
}

interface RecRow {
  commander_id: string;
  card_name: string;
  category: string;
  synergy: number;
  inclusion: number;
  potential_decks: number;
  trend_zscore: number;
}

interface PriceRow {
  card_name: string;
  tcgplayer_price: number | null;
}

interface CardRow {
  scryfall_id: string;
  arena_id: number | null;
  arena_id_back: number | null;
  oracle_id: string;
  name: string;
  front_face_name: string;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  colors: string;
  color_identity: string;
  legalities: string;
  rarity: string;
  set_code: string;
  keywords: string;
  produced_mana: string;
  power: string;
  toughness: string;
  is_default: number;
  price_usd: number | null;
  reserved: number;
  reprint: number;
}

interface RoleRow {
  oracle_id: string;
  front_face_name: string;
  role: string;
  set_code: string;
}

interface TierDeckRow {
  commander_id: string;
  tier: string;
  card_name: string;
  category: string;
  quantity: number;
}

interface CommanderTierRow {
  commander_id: string;
  tier: string;
  avg_price: number;
  num_decks_avg: number;
  deck_size: number;
}

interface GameChangerRow {
  card_name: string;
}

const CARD_COLUMNS = [
  "scryfall_id",
  "arena_id",
  "arena_id_back",
  "oracle_id",
  "name",
  "front_face_name",
  "mana_cost",
  "cmc",
  "type_line",
  "oracle_text",
  "colors",
  "color_identity",
  "legalities",
  "rarity",
  "set_code",
  "keywords",
  "produced_mana",
  "power",
  "toughness",
  "is_default",
  "price_usd",
  "reserved",
  "reprint",
];

async function main(): Promise<void> {
  const lines: string[] = [
    "-- Spot-check fixture: subset of production D1 for the 9-commander matrix.",
    "-- Regenerated via: npx tsx scripts/dump-spot-check-fixture.ts",
    `-- Generated: ${new Date().toISOString()}`,
    "-- DO NOT COMMIT (gitignored). Run \\`just spot-check-fetch\\` to refresh.",
    "",
  ];

  console.log("Resolving commander scryfall_ids...");
  const slugPlaceholders = SPOT_CHECK_SLUGS.map(() => "?").join(",");
  const commanders = await d1Query<CommanderRow>(
    `SELECT * FROM magic_edh_commanders WHERE slug IN (${slugPlaceholders})`,
    SPOT_CHECK_SLUGS,
  );
  if (commanders.length !== SPOT_CHECK_SLUGS.length) {
    const found = new Set(commanders.map((c) => c.slug));
    const missing = SPOT_CHECK_SLUGS.filter((s) => !found.has(s));
    throw new Error(`Missing commanders in production D1: ${missing.join(", ")}`);
  }
  const commanderIds = commanders.map((c) => c.scryfall_id);
  console.log(`  Found ${String(commanders.length)} commanders.`);

  lines.push("-- ── magic_edh_commanders ──");
  const commanderColumns = [
    "scryfall_id",
    "name",
    "slug",
    "color_identity",
    "deck_count",
    "themes",
    "similar",
    "rank",
    "salt",
    "updated_at",
  ];
  for (const c of commanders) {
    lines.push(insertRow("magic_edh_commanders", commanderColumns, c));
  }
  lines.push("");

  console.log("Fetching recommendations...");
  const recs = await fetchInChunks<RecRow>(
    (placeholders) =>
      `SELECT * FROM magic_edh_recommendations WHERE commander_id IN (${placeholders})`,
    commanderIds,
  );
  console.log(`  ${String(recs.length)} recommendation rows.`);

  lines.push("-- ── magic_edh_recommendations ──");
  const recColumns = [
    "commander_id",
    "card_name",
    "category",
    "synergy",
    "inclusion",
    "potential_decks",
    "trend_zscore",
  ];
  for (const r of recs) {
    lines.push(insertRow("magic_edh_recommendations", recColumns, r));
  }
  lines.push("");

  // Collect the universe of card names: commanders + every rec card_name +
  // every tier-deck card_name (need that too for the tier deck dump).
  const cardNameSet = new Set<string>();
  for (const c of commanders) cardNameSet.add(c.name);
  for (const r of recs) cardNameSet.add(r.card_name);

  console.log("Fetching tier averages + commander-tier metadata...");
  const tierDecks = await fetchInChunks<TierDeckRow>(
    (placeholders) =>
      `SELECT * FROM magic_edh_average_decks_by_tier WHERE commander_id IN (${placeholders})`,
    commanderIds,
  );
  console.log(`  ${String(tierDecks.length)} tier-deck rows.`);
  for (const td of tierDecks) cardNameSet.add(td.card_name);

  const commanderTiers = await fetchInChunks<CommanderTierRow>(
    (placeholders) =>
      `SELECT * FROM magic_edh_commander_tiers WHERE commander_id IN (${placeholders})`,
    commanderIds,
  );
  console.log(`  ${String(commanderTiers.length)} commander-tier metadata rows.`);

  lines.push("-- ── magic_edh_commander_tiers ──");
  const commanderTierColumns = [
    "commander_id",
    "tier",
    "avg_price",
    "num_decks_avg",
    "deck_size",
  ];
  for (const ct of commanderTiers) {
    lines.push(insertRow("magic_edh_commander_tiers", commanderTierColumns, ct));
  }
  lines.push("");

  lines.push("-- ── magic_edh_average_decks_by_tier ──");
  const tierDeckColumns = [
    "commander_id",
    "tier",
    "card_name",
    "category",
    "quantity",
  ];
  for (const td of tierDecks) {
    lines.push(insertRow("magic_edh_average_decks_by_tier", tierDeckColumns, td));
  }
  lines.push("");

  const cardNames = [...cardNameSet];
  console.log(`Universe: ${String(cardNames.length)} unique card names.`);

  console.log("Fetching prices...");
  const prices = await fetchInChunks<PriceRow>(
    (placeholders) =>
      `SELECT * FROM magic_edh_card_prices WHERE LOWER(card_name) IN (${placeholders})`,
    cardNames.map((n) => n.toLowerCase()),
  );
  console.log(`  ${String(prices.length)} price rows.`);

  lines.push("-- ── magic_edh_card_prices ──");
  for (const p of prices) {
    lines.push(
      insertRow("magic_edh_card_prices", ["card_name", "tcgplayer_price"], p),
    );
  }
  lines.push("");

  console.log("Fetching magic_cards (default printings)...");
  const cards = await fetchInChunks<CardRow>(
    (placeholders) =>
      `SELECT * FROM magic_cards
         WHERE front_face_name COLLATE NOCASE IN (${placeholders})
           AND is_default = 1
           AND type_line != 'Card // Card'`,
    cardNames,
  );
  console.log(`  ${String(cards.length)} magic_cards rows.`);

  lines.push("-- ── magic_cards ──");
  for (const c of cards) {
    lines.push(insertRow("magic_cards", CARD_COLUMNS, c));
  }
  lines.push("");

  console.log("Fetching card roles...");
  const roles = await fetchInChunks<RoleRow>(
    (placeholders) =>
      `SELECT * FROM magic_card_roles WHERE LOWER(front_face_name) IN (${placeholders})`,
    cardNames.map((n) => n.toLowerCase()),
  );
  console.log(`  ${String(roles.length)} role rows.`);

  lines.push("-- ── magic_card_roles ──");
  const roleColumns = ["oracle_id", "front_face_name", "role", "set_code"];
  for (const r of roles) {
    lines.push(insertRow("magic_card_roles", roleColumns, r));
  }
  lines.push("");

  console.log("Fetching game changers (global)...");
  const gameChangers = await d1Query<GameChangerRow>(
    `SELECT * FROM magic_game_changers`,
  );
  console.log(`  ${String(gameChangers.length)} game-changer rows.`);

  lines.push("-- ── magic_game_changers ──");
  for (const gc of gameChangers) {
    lines.push(insertRow("magic_game_changers", ["card_name"], gc));
  }
  lines.push("");

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, lines.join("\n"));
  const totalRows =
    commanders.length +
    recs.length +
    tierDecks.length +
    commanderTiers.length +
    prices.length +
    cards.length +
    roles.length +
    gameChangers.length;
  console.log(`\nWrote ${OUTPUT_FILE}`);
  console.log(`Total rows: ${String(totalRows)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
