// Dump the full commander_deckbuild module response (the JSON the
// worker would send through the MCP layer) for a given commander+budget.
// Usage: npx tsx scripts/dump-build-response.ts <slug> [max_price]

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import Database from "better-sqlite3";

import { commanderDeckbuildModule } from "../plugins/magic/reference/commander-deckbuild";
import type { Env } from "../worker/src/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = resolve(ROOT, "worker/test/fixtures/spot-check.sql");
const MIGRATIONS_DIR = resolve(ROOT, "worker/migrations");
const OUT_DIR = "/tmp";

class D1Stmt {
  private params: unknown[] = [];
  constructor(private db: Database.Database, private sql: string) {}
  bind(...params: unknown[]): this {
    this.params = params;
    return this;
  }
  async all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[] };
  }
  async first<T = unknown>(): Promise<T | null> {
    return (
      (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null
    );
  }
  async run(): Promise<unknown> {
    this.runSync();
    return {};
  }
  runSync(): void {
    this.db.prepare(this.sql).run(...this.params);
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

function loadDb(): Database.Database {
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
      ) {
        throw error;
      }
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
  return db;
}

async function main(): Promise<void> {
  const slug = process.argv[2];
  const maxPrice = process.argv[3] ? Number(process.argv[3]) : undefined;
  if (!slug) {
    console.error(
      "Usage: npx tsx scripts/dump-build-response.ts <slug> [max_price]",
    );
    process.exit(1);
  }
  const db = loadDb();
  const env = { DB: new D1Shim(db) } as unknown as Env;

  const cmdrName = (
    db
      .prepare(`SELECT name FROM magic_edh_commanders WHERE slug = ?`)
      .get(slug) as { name: string } | undefined
  )?.name;
  if (!cmdrName) {
    console.error(`Slug not in fixture: ${slug}`);
    process.exit(1);
  }

  const query: Record<string, unknown> = { commander: cmdrName };
  if (maxPrice !== undefined) query.max_price = maxPrice;

  console.log(`Calling module.execute(${JSON.stringify(query)})...`);
  const result = await commanderDeckbuildModule.execute(query, env);
  const json = JSON.stringify(result);
  const outFile = resolve(
    OUT_DIR,
    `build-${slug}-${maxPrice !== undefined ? String(maxPrice) : "default"}.json`,
  );
  writeFileSync(outFile, json);

  console.log(`\nWrote ${outFile}`);
  console.log(`  type: ${result.type ?? "<none>"}`);
  console.log(`  total bytes: ${String(json.length)}`);

  if (result.type === "structured") {
    const content = result.data;
    const deck = content.deck;
    if (Array.isArray(deck)) {
      console.log(`  deck length: ${String(deck.length)} entries`);
      const deckJson = JSON.stringify(deck);
      console.log(`  deck bytes: ${String(deckJson.length)}`);
      console.log(`  sample entry: ${JSON.stringify(deck[0])}`);
    }
    const warnings = content.warnings;
    if (Array.isArray(warnings)) {
      const wJson = JSON.stringify(warnings);
      console.log(
        `  warnings: ${String(warnings.length)} entries, ${String(wJson.length)} bytes`,
      );
    }
    const completion = content.completion;
    if (completion) {
      console.log(`  completion: ${String(JSON.stringify(completion).length)} bytes`);
    }
    const quality = content.quality;
    if (quality) {
      console.log(`  quality: ${String(JSON.stringify(quality).length)} bytes`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
