// Verifies the SME's two empirical claims against our spot-check fixture.
//   Claim 1: EDHREC budget tier ~ bottom 10% of decks per commander
//   Claim 2: Format staples (SoP, Sol Ring, etc.) have strongly negative synergy
// Usage: npx tsx scripts/verify-sme-claims.ts

import { readFileSync, readdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import Database from "better-sqlite3";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = resolve(ROOT, "worker/test/fixtures/spot-check.sql");
const MIGRATIONS_DIR = resolve(ROOT, "worker/migrations");

const db = new Database(":memory:");
const migs = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .slice()
  .sort((a, b) => a.localeCompare(b));
for (const f of migs) {
  try {
    db.exec(readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"));
  } catch (error) {
    const msg = String(error);
    if (
      !msg.includes("duplicate column") &&
      !msg.includes("already exists") &&
      !msg.includes("no such table") &&
      !msg.includes("no such column")
    )
      throw error;
  }
}

const sql = readFileSync(FIXTURE_PATH, "utf8");
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
const tx = db.transaction((items: string[]) => {
  for (const s of items) db.prepare(s).run();
});
tx(stmts);

console.log("CLAIM 1: EDHREC tier == bottom 10% of decks per commander\n");
console.log("  num_decks_avg / commander.deck_count for each (commander, tier)\n");

const tierData = db
  .prepare(
    `SELECT c.name AS commander, t.tier, c.deck_count, t.num_decks_avg, t.avg_price, t.deck_size,
            (1.0 * t.num_decks_avg / c.deck_count) AS ratio
       FROM magic_edh_commander_tiers t
       JOIN magic_edh_commanders c ON c.scryfall_id = t.commander_id
       ORDER BY c.name, t.tier`,
  )
  .all() as Array<{
  commander: string;
  tier: string;
  deck_count: number;
  num_decks_avg: number;
  avg_price: number;
  deck_size: number;
  ratio: number;
}>;

console.log("  Commander                       | Tier       | Total | Tier  | Ratio | $avg");
console.log("  " + "-".repeat(95));
for (const r of tierData) {
  console.log(
    `  ${r.commander.padEnd(31)} | ${r.tier.padEnd(10)} | ${String(r.deck_count).padStart(5)} | ${String(r.num_decks_avg).padStart(5)} | ${(r.ratio * 100).toFixed(1).padStart(5)}% | $${r.avg_price.toFixed(0)}`,
  );
}

const budgetRows = tierData.filter((r) => r.tier === "budget");
const meanBudgetRatio = budgetRows.reduce((s, r) => s + r.ratio, 0) / budgetRows.length;
console.log(`\n  Mean budget-tier ratio: ${(meanBudgetRatio * 100).toFixed(1)}% (SME claim: ~10%)`);

console.log("\n\nCLAIM 2: Format staples have strongly-negative synergy\n");

const slugs = [
  "atraxa-praetors-voice",
  "edgar-markov",
  "krenko-mob-boss",
  "lathril-blade-of-the-elves",
  "kinnan-bonder-prodigy",
];

for (const slug of slugs) {
  const cmdr = db
    .prepare(`SELECT scryfall_id, name, deck_count FROM magic_edh_commanders WHERE slug = ?`)
    .get(slug) as { scryfall_id: string; name: string; deck_count: number };
  const top = db
    .prepare(
      `SELECT card_name, MAX(inclusion) AS inc, MAX(synergy) AS syn
         FROM magic_edh_recommendations
         WHERE commander_id = ?
         GROUP BY card_name
         ORDER BY inc DESC LIMIT 8`,
    )
    .all(cmdr.scryfall_id) as Array<{ card_name: string; inc: number; syn: number }>;
  console.log(`  ${cmdr.name} (deck_count ${cmdr.deck_count}):`);
  for (const r of top) {
    const incPct = (100 * r.inc) / cmdr.deck_count;
    const synSign = r.syn >= 0 ? "+" : "";
    console.log(
      `    ${incPct.toFixed(1).padStart(5)}% incl, syn ${synSign}${r.syn.toFixed(2)} | ${r.card_name}`,
    );
  }
  console.log();
}

console.log("\nCLAIM 2b: Specific staples cited by SME\n");

const checks = ["Swords to Plowshares", "Sol Ring", "Counterspell", "Path to Exile", "Cultivate"];
for (const card of checks) {
  console.log(`  ${card}:`);
  for (const slug of slugs) {
    const cmdr = db
      .prepare(`SELECT scryfall_id, name, deck_count FROM magic_edh_commanders WHERE slug = ?`)
      .get(slug) as { scryfall_id: string; name: string; deck_count: number };
    const row = db
      .prepare(
        `SELECT MAX(inclusion) AS inc, MAX(synergy) AS syn FROM magic_edh_recommendations
           WHERE commander_id = ? AND LOWER(card_name) = LOWER(?)`,
      )
      .get(cmdr.scryfall_id, card) as { inc: number | null; syn: number | null } | undefined;
    if (!row || row.inc === null) {
      console.log(`    ${cmdr.name.padEnd(31)}: not in rec pool`);
      continue;
    }
    const incPct = (100 * (row.inc ?? 0)) / cmdr.deck_count;
    const synSign = (row.syn ?? 0) >= 0 ? "+" : "";
    console.log(
      `    ${cmdr.name.padEnd(31)}: ${incPct.toFixed(1).padStart(5)}% incl, syn ${synSign}${(row.syn ?? 0).toFixed(2)}`,
    );
  }
  console.log();
}
