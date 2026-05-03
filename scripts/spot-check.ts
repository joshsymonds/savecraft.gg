// Standalone spot-check harness. Loads worker/test/fixtures/spot-check.sql
// into an in-memory better-sqlite3 DB, applies all worker migrations, then
// runs the 9-build matrix through buildAndUpgradeDeck and asserts the
// quality bar (overlap >= 65%, 0 missing staples, lands in target_range).
//
// Replaces the original vitest+miniflare plan after workerd's hash-table
// inconsistency bug made bulk magic_cards inserts unworkable. better-
// sqlite3 IS real SQLite — only the JS-facing API differs from D1.
//
// Usage: npx tsx scripts/spot-check.ts (or `just spot-check`)

import { existsSync, readFileSync, readdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import Database from "better-sqlite3";

import {
  buildAndUpgradeDeck,
  loadGameChangers,
} from "../plugins/magic/reference/deck-completion";
import {
  assessQuality,
  deriveTierLandComposition,
} from "../plugins/magic/reference/deck-quality";
import type { Env } from "../worker/src/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = resolve(ROOT, "worker/test/fixtures/spot-check.sql");
const MIGRATIONS_DIR = resolve(ROOT, "worker/migrations");

interface MatrixEntry {
  commander: string;
  slug: string;
  budgets: number[];
}

const MATRIX: MatrixEntry[] = [
  {
    commander: "Atraxa, Praetors' Voice",
    slug: "atraxa-praetors-voice",
    budgets: [25, 500],
  },
  {
    commander: "Edgar Markov",
    slug: "edgar-markov",
    budgets: [25, 500],
  },
  {
    commander: "Krenko, Mob Boss",
    slug: "krenko-mob-boss",
    budgets: [100, 500],
  },
  {
    commander: "Lathril, Blade of the Elves",
    slug: "lathril-blade-of-the-elves",
    budgets: [25, 500],
  },
  {
    commander: "Kinnan, Bonder Prodigy",
    slug: "kinnan-bonder-prodigy",
    budgets: [1000],
  },
];

type Tier = "budget" | "upgraded" | "optimized" | "cedh";

function autoTier(budget: number): Tier {
  if (budget < 300) return "budget";
  if (budget < 1000) return "upgraded";
  if (budget < 3000) return "optimized";
  return "cedh";
}

// ── D1Database shim ───────────────────────────────────────────────────

class D1Stmt {
  private params: unknown[] = [];
  constructor(
    private db: Database.Database,
    private sql: string,
  ) {}

  bind(...params: unknown[]): this {
    this.params = params;
    return this;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    const stmt = this.db.prepare(this.sql);
    const results = stmt.all(...this.params) as T[];
    return { results };
  }

  async first<T = unknown>(): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.params);
    return (row as T | undefined) ?? null;
  }

  async run(): Promise<unknown> {
    this.runSync();
    return {};
  }

  runSync(): void {
    const stmt = this.db.prepare(this.sql);
    stmt.run(...this.params);
  }
}

class D1Shim {
  constructor(private db: Database.Database) {}

  prepare(sql: string): D1Stmt {
    return new D1Stmt(this.db, sql);
  }

  async batch(stmts: D1Stmt[]): Promise<unknown[]> {
    const tx = this.db.transaction((items: D1Stmt[]) => {
      for (const s of items) s.runSync();
    });
    tx(stmts);
    return stmts.map(() => ({}));
  }
}

// ── Migration + fixture loading ───────────────────────────────────────

function loadMigrations(db: Database.Database): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .slice()
    .sort((a, b) => a.localeCompare(b));
  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
    try {
      db.exec(sql);
    } catch (error) {
      // Tolerate "already exists" errors from migrations that have been
      // retroactively folded into earlier schema files. Other errors
      // are fatal.
      const msg = String(error);
      const benign =
        msg.includes("duplicate column") ||
        msg.includes("already exists") ||
        msg.includes("no such table") ||
        msg.includes("no such column");
      if (!benign) {
        console.error(`Migration ${file} failed: ${msg}`);
        throw error;
      }
    }
  }
}

function loadFixture(db: Database.Database): void {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(
      `Fixture missing: ${FIXTURE_PATH}\n` +
        "Run `just spot-check-fetch` to generate it " +
        "(requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in env).",
    );
  }
  const sql = readFileSync(FIXTURE_PATH, "utf8");
  // Split on `;\n` (statement boundary). Card oracle_text contains
  // embedded newlines, so a plain `\n` split would fragment them.
  const stmts = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) =>
      s
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);
  if (stmts.length === 0) {
    throw new Error(
      `Fixture is empty: ${FIXTURE_PATH}\nRun \`just spot-check-fetch\` to populate.`,
    );
  }
  const tx = db.transaction((items: string[]) => {
    for (const s of items) db.prepare(s).run();
  });
  tx(stmts);
}

// ── Matrix runner ─────────────────────────────────────────────────────

interface BuildOutcome {
  commander: string;
  budget: number;
  tier: Tier;
  overlapPct: number;
  matchingCards: number;
  totalAvgCards: number;
  missingStaples: string[];
  landsCount: number;
  landsRange: [number, number];
  score: number;
}

interface CommanderRow {
  scryfall_id: string;
  name: string;
  deck_count: number;
}

interface AvgRow {
  card_name: string;
}

interface StapleRow {
  card_name: string;
  inclusion: number;
}

function passed(o: BuildOutcome): boolean {
  return (
    o.overlapPct >= 0.65 &&
    o.missingStaples.length === 0 &&
    o.landsCount >= o.landsRange[0] &&
    o.landsCount <= o.landsRange[1]
  );
}

async function runBuild(
  env: Env,
  entry: MatrixEntry,
  budget: number,
): Promise<BuildOutcome> {
  const cmdrResult = await env.DB.prepare(
    `SELECT scryfall_id, name, deck_count
       FROM magic_edh_commanders WHERE slug = ?`,
  )
    .bind(entry.slug)
    .all<CommanderRow>();
  const row = cmdrResult.results?.[0];
  if (!row) {
    throw new Error(`Commander ${entry.slug} not in fixture`);
  }

  const tier = autoTier(budget);
  const commanderRef = { scryfall_id: row.scryfall_id, name: row.name };

  const [landTarget, gameChangers] = await Promise.all([
    deriveTierLandComposition(env, row.scryfall_id, tier),
    loadGameChangers(env),
  ]);

  const buildResult = await buildAndUpgradeDeck(env, commanderRef, {
    budget,
    excludeGameChangers: tier === "budget",
    gameChangers,
    landTarget: landTarget ?? undefined,
  });

  const avgResult = await env.DB.prepare(
    `SELECT card_name FROM magic_edh_average_decks_by_tier
       WHERE commander_id = ? AND tier = ?`,
  )
    .bind(row.scryfall_id, tier)
    .all<AvgRow>();
  const avgNames = (avgResult.results ?? []).map((r) =>
    r.card_name.toLowerCase(),
  );
  const deckNames = new Set(
    buildResult.deck.map((dEntry) => dEntry.card_name.toLowerCase()),
  );
  let matching = 0;
  for (const name of avgNames) {
    if (deckNames.has(name)) matching++;
  }
  const overlapPct = avgNames.length > 0 ? matching / avgNames.length : 0;

  const stapleResult = await env.DB.prepare(
    `SELECT card_name, inclusion FROM magic_edh_recommendations
       WHERE commander_id = ? AND category = 'topcards'
         AND inclusion >= ?
       ORDER BY inclusion DESC LIMIT 200`,
  )
    .bind(row.scryfall_id, Math.floor(row.deck_count * 0.25))
    .all<StapleRow>();
  const missingStaples = (stapleResult.results ?? [])
    .filter((s) => !deckNames.has(s.card_name.toLowerCase()))
    .map((s) => s.card_name);

  const quality = await assessQuality(env, buildResult.deck, commanderRef, tier);
  const lands = quality.composition.lands;

  return {
    commander: entry.commander,
    budget,
    tier,
    overlapPct,
    matchingCards: matching,
    totalAvgCards: avgNames.length,
    missingStaples,
    landsCount: lands.count,
    landsRange: lands.target_range,
    score: quality.score,
  };
}

function printTable(outcomes: BuildOutcome[]): void {
  const lines: string[] = [
    "",
    "─── Spot-check matrix results ───",
    "Commander                       | Budget  | Overlap | Missing | Lands           | Score | Status",
    "─".repeat(110),
  ];
  for (const o of outcomes) {
    const cmdr = o.commander.padEnd(31).slice(0, 31);
    const budget = `$${String(o.budget)}`.padStart(7);
    const overlap = `${String(Math.round(o.overlapPct * 100))}%`.padStart(7);
    const missing = String(o.missingStaples.length).padStart(7);
    const lands =
      `${String(o.landsCount)} / [${String(o.landsRange[0])}-${String(o.landsRange[1])}]`.padEnd(15);
    const score = String(o.score).padStart(5);
    const status = passed(o) ? "✓" : "✗";
    lines.push(
      `${cmdr} | ${budget} | ${overlap} | ${missing} | ${lands} | ${score} | ${status}`,
    );
  }
  const passing = outcomes.filter((o) => passed(o)).length;
  lines.push("─".repeat(110));
  lines.push(
    `${String(passing)} / ${String(outcomes.length)} builds pass (overlap >= 65%, 0 missing staples, lands in target_range)`,
  );
  console.log(lines.join("\n"));
  for (const o of outcomes) {
    if (passed(o)) continue;
    const reasons: string[] = [];
    if (o.overlapPct < 0.65)
      reasons.push(`overlap ${(o.overlapPct * 100).toFixed(1)}% < 65%`);
    if (o.missingStaples.length > 0) {
      const head = o.missingStaples.slice(0, 5).join(", ");
      const more =
        o.missingStaples.length > 5
          ? `, +${String(o.missingStaples.length - 5)} more`
          : "";
      reasons.push(`missing: ${head}${more}`);
    }
    if (o.landsCount < o.landsRange[0] || o.landsCount > o.landsRange[1])
      reasons.push(
        `lands ${String(o.landsCount)} outside [${String(o.landsRange[0])}-${String(o.landsRange[1])}]`,
      );
    console.log(`  ${o.commander} $${String(o.budget)}: ${reasons.join("; ")}`);
  }
  console.log("");
}

async function main(): Promise<void> {
  console.log("Initializing in-memory SQLite + applying migrations...");
  const db = new Database(":memory:");
  loadMigrations(db);
  console.log("Loading fixture...");
  loadFixture(db);
  const env = { DB: new D1Shim(db) } as unknown as Env;

  console.log("Running matrix...\n");
  const outcomes: BuildOutcome[] = [];
  for (const entry of MATRIX) {
    for (const budget of entry.budgets) {
      try {
        const outcome = await runBuild(env, entry, budget);
        outcomes.push(outcome);
        const status = passed(outcome) ? "✓" : "✗";
        console.log(`  ${status} ${entry.commander} $${String(budget)}`);
      } catch (error) {
        console.error(
          `  ✗ ${entry.commander} $${String(budget)}: ${String(error)}`,
        );
      }
    }
  }

  printTable(outcomes);

  const allPass =
    outcomes.length === 9 && outcomes.every((o) => passed(o));
  process.exit(allPass ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
