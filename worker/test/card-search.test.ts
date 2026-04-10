import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cardSearchModule } from "../../plugins/mtga/reference/card-search";
import { registerNativeModule } from "../src/reference/registry";

import { cleanAll } from "./helpers";

describe("card_search native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("mtga", cardSearchModule);
  });

  async function seedCards(): Promise<void> {
    await env.DB.batch([
      // Structured table
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(
        `scry-1`,
        87_521,
        "abc-123",
        "Sheoldred, the Apocalypse",
        "{2}{B}{B}",
        4,
        "Legendary Creature — Phyrexian Praetor",
        "Deathtouch\nWhenever you draw a card, you gain 2 life.\nWhenever an opponent draws a card, they lose 2 life.",
        '["B"]',
        '["B"]',
        '{"standard":"banned","historic":"legal"}',
        "mythic",
        "DMU",
        '["deathtouch"]',
      ),
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(
        `scry-2`,
        1,
        "def-456",
        "Lightning Bolt",
        "{R}",
        1,
        "Instant",
        "Lightning Bolt deals 3 damage to any target.",
        '["R"]',
        '["R"]',
        '{"standard":"not_legal","historic":"legal"}',
        "common",
        "STA",
        "[]",
      ),
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(
        `scry-3`,
        2,
        "ghi-789",
        "Llanowar Elves",
        "{G}",
        1,
        "Creature — Elf Druid",
        "{T}: Add {G}.",
        '["G"]',
        '["G"]',
        '{"standard":"not_legal","historic":"legal"}',
        "common",
        "DAR",
        "[]",
      ),
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(
        `scry-4`,
        3,
        "jkl-012",
        "Thoughtseize",
        "{B}",
        1,
        "Sorcery",
        "Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.",
        '["B"]',
        '["B"]',
        '{"standard":"not_legal","historic":"legal"}',
        "rare",
        "AKR",
        "[]",
      ),
      // Multicolor card (Orzhov — W/B)
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(
        "scry-5",
        5,
        "mno-345",
        "Kambal, Consul of Allocation",
        "{1}{W}{B}",
        3,
        "Legendary Creature — Human Advisor",
        "Whenever an opponent casts a noncreature spell, that player loses 2 life and you gain 2 life.",
        '["W","B"]',
        '["W","B"]',
        '{"standard":"not_legal","historic":"legal"}',
        "rare",
        "KLD",
        "[]",
      ),
      // Colorless card
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(
        "scry-6",
        6,
        "pqr-678",
        "Sol Ring",
        "{1}",
        1,
        "Artifact",
        "{T}: Add {C}{C}.",
        "[]",
        "[]",
        '{"standard":"not_legal","historic":"not_legal"}',
        "uncommon",
        "C21",
        "[]",
      ),
      // FTS5 rows (scryfall_id must match magic_cards entries)
      env.DB.prepare(
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind(
        "scry-1",
        "Sheoldred, the Apocalypse",
        "Deathtouch\nWhenever you draw a card, you gain 2 life.\nWhenever an opponent draws a card, they lose 2 life.",
        "Legendary Creature — Phyrexian Praetor",
      ),
      env.DB.prepare(
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind("scry-2", "Lightning Bolt", "Lightning Bolt deals 3 damage to any target.", "Instant"),
      env.DB.prepare(
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind("scry-3", "Llanowar Elves", "{T}: Add {G}.", "Creature — Elf Druid"),
      env.DB.prepare(
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind(
        "scry-4",
        "Thoughtseize",
        "Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.",
        "Sorcery",
      ),
      env.DB.prepare(
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind(
        "scry-5",
        "Kambal, Consul of Allocation",
        "Whenever an opponent casts a noncreature spell, that player loses 2 life and you gain 2 life.",
        "Legendary Creature — Human Advisor",
      ),
      env.DB.prepare(
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind("scry-6", "Sol Ring", "{T}: Add {C}{C}.", "Artifact"),
    ]);
  }

  // Strip AI + Vectorize so FTS5 tests don't hit the network
  // (Vectorize calls are slow/flaky in Miniflare).
  const ftsEnv = { ...env, AI: undefined, MTGA_CARDS_INDEX: undefined } as unknown as typeof env;

  it("searches by card name via FTS5", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ name: "lightning" }, ftsEnv);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    expect(cards.length).toBe(1);
    expect(cards[0]!.name).toBe("Lightning Bolt");
    expect(cards[0]!.arenaId).toBe(1);
  });

  it("searches oracle text via FTS5", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ text: "discard" }, ftsEnv);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    expect(cards.length).toBe(1);
    expect(cards[0]!.name).toBe("Thoughtseize");
  });

  it("filters by rarity", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ rarity: "common" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    expect(cards.length).toBe(2);
    const names = cards.map((c) => c.name);
    expect(names).toContain("Lightning Bolt");
    expect(names).toContain("Llanowar Elves");
  });

  it("filters by set", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ set: "DMU" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    expect(cards.length).toBe(1);
    expect(cards[0]!.name).toBe("Sheoldred, the Apocalypse");
  });

  it("filters by color identity", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ colors: "B" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    expect(cards.length).toBe(3);
    const names = cards.map((c) => c.name);
    expect(names).toContain("Sheoldred, the Apocalypse");
    expect(names).toContain("Thoughtseize");
    expect(names).toContain("Kambal, Consul of Allocation");
  });

  it("filters by cmc with operator", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ cmc: 1, cmc_op: "<=" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    expect(cards.length).toBe(4); // Lightning Bolt, Llanowar Elves, Sol Ring, Thoughtseize
  });

  it("filters by format legality", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ format: "standard" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    // Only Sheoldred has a standard legality that isn't "not_legal"
    // (it's "banned" which is still a legality status, not "not_legal")
    const cards = result.data.cards as Record<string, unknown>[];
    expect(cards.length).toBe(1);
    expect(cards[0]!.name).toBe("Sheoldred, the Apocalypse");
  });

  it("filters by type line", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ type: "creature" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    expect(cards.length).toBe(3);
    const names = cards.map((c) => c.name);
    expect(names).toContain("Sheoldred, the Apocalypse");
    expect(names).toContain("Llanowar Elves");
    expect(names).toContain("Kambal, Consul of Allocation");
  });

  it("combines FTS5 search with structured filters", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ name: "sheoldred", rarity: "mythic" }, ftsEnv);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    expect(cards.length).toBe(1);
    expect(cards[0]!.name).toBe("Sheoldred, the Apocalypse");
  });

  it("respects limit parameter", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ rarity: "common", limit: 1 }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    expect(cards.length).toBe(1);
  });

  it("sorts by cmc", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ sort: "cmc" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    expect(cards.length).toBe(6);
    // CMC order: Lightning Bolt(1), Llanowar Elves(1), Sol Ring(1), Thoughtseize(1), Kambal(3), Sheoldred(4)
    expect(cards.at(-1)!.name).toBe("Sheoldred, the Apocalypse");
  });

  it("returns empty array for no matches", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ name: "nonexistent" }, ftsEnv);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    expect(cards.length).toBe(0);
  });

  it("excludes non-default printings from results", async () => {
    await seedCards();
    // Add a non-default printing of Lightning Bolt (different arena_id, is_default = 0)
    await env.DB.prepare(
      `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
      .bind(
        `scry-99`,
        99,
        "def-456",
        "Lightning Bolt",
        "{R}",
        1,
        "Instant",
        "Lightning Bolt deals 3 damage to any target.",
        '["R"]',
        '["R"]',
        '{"standard":"not_legal","historic":"legal"}',
        "common",
        "OldSet",
        "[]",
      )
      .run();

    // Search should return only the default printing
    const result = await cardSearchModule.execute({ rarity: "common" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    const bolts = cards.filter((c) => c.name === "Lightning Bolt");
    expect(bolts.length).toBe(1);
    expect(bolts[0]!.arenaId).toBe(1); // default printing, not arena_id 99
  });

  // ── Color operator tests ─────────────────────────────────────
  // Seed cards by color_identity:
  //   scry-1 Sheoldred ["B"], scry-2 Lightning Bolt ["R"], scry-3 Llanowar Elves ["G"],
  //   scry-4 Thoughtseize ["B"], scry-5 Kambal ["W","B"], scry-6 Sol Ring []

  it("colors_op >= (default): contains all specified colors", async () => {
    await seedCards();
    const result = await cardSearchModule.execute({ colors: "B" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const names = (result.data.cards as Record<string, unknown>[]).map((c) => c.name);
    // Mono-B and multicolor containing B
    expect(names).toContain("Sheoldred, the Apocalypse");
    expect(names).toContain("Thoughtseize");
    expect(names).toContain("Kambal, Consul of Allocation");
    expect(names).not.toContain("Sol Ring");
    expect(names).not.toContain("Lightning Bolt");
  });

  it("colors_op =: exactly these colors", async () => {
    await seedCards();
    const result = await cardSearchModule.execute({ colors: "B", colors_op: "=" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const names = (result.data.cards as Record<string, unknown>[]).map((c) => c.name);
    // Only mono-B, not Kambal (W/B)
    expect(names).toContain("Sheoldred, the Apocalypse");
    expect(names).toContain("Thoughtseize");
    expect(names).not.toContain("Kambal, Consul of Allocation");
  });

  it("colors_op = with two colors: exactly Orzhov", async () => {
    await seedCards();
    const result = await cardSearchModule.execute({ colors: "WB", colors_op: "=" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const names = (result.data.cards as Record<string, unknown>[]).map((c) => c.name);
    expect(names).toContain("Kambal, Consul of Allocation");
    expect(names).not.toContain("Sheoldred, the Apocalypse"); // mono-B
    expect(names).not.toContain("Thoughtseize"); // mono-B
  });

  it("colors_op <=: subset of specified colors (includes colorless)", async () => {
    await seedCards();
    const result = await cardSearchModule.execute({ colors: "WB", colors_op: "<=" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const names = (result.data.cards as Record<string, unknown>[]).map((c) => c.name);
    // mono-W (none in seed), mono-B, Orzhov, and colorless
    expect(names).toContain("Sheoldred, the Apocalypse"); // ["B"] ⊆ {W,B}
    expect(names).toContain("Thoughtseize"); // ["B"] ⊆ {W,B}
    expect(names).toContain("Kambal, Consul of Allocation"); // ["W","B"] ⊆ {W,B}
    expect(names).toContain("Sol Ring"); // [] ⊆ {W,B}
    expect(names).not.toContain("Lightning Bolt"); // ["R"] ⊄ {W,B}
    expect(names).not.toContain("Llanowar Elves"); // ["G"] ⊄ {W,B}
  });

  it("colors_op <: strict subset (includes colorless, excludes equal)", async () => {
    await seedCards();
    const result = await cardSearchModule.execute({ colors: "WB", colors_op: "<" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const names = (result.data.cards as Record<string, unknown>[]).map((c) => c.name);
    // Strict subset: mono-B, colorless — but NOT exactly WB (Kambal)
    expect(names).toContain("Sheoldred, the Apocalypse"); // 1 color < 2
    expect(names).toContain("Thoughtseize"); // 1 color < 2
    expect(names).toContain("Sol Ring"); // 0 colors < 2
    expect(names).not.toContain("Kambal, Consul of Allocation"); // 2 colors = 2, not strict
  });

  it("colors_op >: strict superset", async () => {
    await seedCards();
    const result = await cardSearchModule.execute({ colors: "B", colors_op: ">" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const names = (result.data.cards as Record<string, unknown>[]).map((c) => c.name);
    // Must contain B and have more colors
    expect(names).toContain("Kambal, Consul of Allocation"); // ["W","B"] ⊃ {B}
    expect(names).not.toContain("Sheoldred, the Apocalypse"); // ["B"] = {B}, not strict
    expect(names).not.toContain("Thoughtseize"); // ["B"] = {B}, not strict
  });

  it("colors_op >= with multiple colors: contains all specified", async () => {
    await seedCards();
    const result = await cardSearchModule.execute({ colors: "WB", colors_op: ">=" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const names = (result.data.cards as Record<string, unknown>[]).map((c) => c.name);
    // Must contain both W and B — only Kambal qualifies
    expect(names).toContain("Kambal, Consul of Allocation");
    expect(names).not.toContain("Sheoldred, the Apocalypse"); // mono-B, missing W
    expect(names).not.toContain("Thoughtseize"); // mono-B, missing W
  });

  it("colors_op > with no matching superset returns empty", async () => {
    await seedCards();
    const result = await cardSearchModule.execute({ colors: "WB", colors_op: ">" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    // No card in seed has 3+ colors including both W and B
    expect(cards.length).toBe(0);
  });

  it("colors_op < with single color returns only colorless", async () => {
    await seedCards();
    const result = await cardSearchModule.execute({ colors: "W", colors_op: "<" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const names = (result.data.cards as Record<string, unknown>[]).map((c) => c.name);
    // Strict subset of {W}: only colorless (0 < 1)
    expect(names).toContain("Sol Ring");
    expect(names.length).toBe(1);
  });

  it("colors_op <= with single color includes colorless", async () => {
    await seedCards();
    const result = await cardSearchModule.execute({ colors: "W", colors_op: "<=" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const names = (result.data.cards as Record<string, unknown>[]).map((c) => c.name);
    // Only mono-W (none in seed) and colorless
    expect(names).toContain("Sol Ring");
    expect(names).not.toContain("Kambal, Consul of Allocation"); // has B, not subset of {W}
    expect(names).not.toContain("Sheoldred, the Apocalypse"); // has B
  });

  it("does not exceed D1 bind param limit with high limit + filters", async () => {
    await seedCards();
    // limit=50 → FTS fetches 150 IDs, which without capping would generate
    // 150+ bind params and crash D1 (max 100). This test verifies the cap.
    const result = await cardSearchModule.execute(
      { text: "life", colors: "W", colors_op: "<=", cmc: 2, cmc_op: "<=", type: "creature", limit: 50 },
      ftsEnv,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    // Should not throw — the exact result count depends on seed data
    expect(result.data.cards).toBeDefined();
  });

  it("excludes tokens by default", async () => {
    await seedCards();
    // Add a token card
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(
        "scry-token-1",
        null,
        "tok-001",
        "Soldier",
        "",
        0,
        "Token Creature — Soldier",
        "",
        '["W"]',
        '["W"]',
        '{"standard":"not_legal"}',
        "common",
        "DMU",
        "[]",
      ),
      env.DB.prepare(
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind("scry-token-1", "Soldier", "", "Token Creature — Soldier"),
    ]);

    // Default search should exclude token
    const result = await cardSearchModule.execute({ type: "creature" }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    const names = cards.map((c) => c.name);
    expect(names).not.toContain("Soldier");
    expect(names).toContain("Sheoldred, the Apocalypse");
    expect(names).toContain("Llanowar Elves");
  });

  it("includes tokens when include_tokens is true", async () => {
    await seedCards();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(
        "scry-token-1",
        null,
        "tok-001",
        "Soldier",
        "",
        0,
        "Token Creature — Soldier",
        "",
        '["W"]',
        '["W"]',
        '{"standard":"not_legal"}',
        "common",
        "DMU",
        "[]",
      ),
      env.DB.prepare(
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind("scry-token-1", "Soldier", "", "Token Creature — Soldier"),
    ]);

    const result = await cardSearchModule.execute({ type: "creature", include_tokens: true }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cards = result.data.cards as Record<string, unknown>[];
    const names = cards.map((c) => c.name);
    expect(names).toContain("Soldier");
  });

  it("returns all card fields in result", async () => {
    await seedCards();

    const result = await cardSearchModule.execute({ name: "sheoldred" }, ftsEnv);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const card = (result.data.cards as Record<string, unknown>[])[0]!;
    expect(card.arenaId).toBe(87_521);
    expect(card.name).toBe("Sheoldred, the Apocalypse");
    expect(card.manaCost).toBe("{2}{B}{B}");
    expect(card.cmc).toBe(4);
    expect(card.typeLine).toBe("Legendary Creature — Phyrexian Praetor");
    expect(card.oracleText).toContain("Deathtouch");
    expect(card.colors).toEqual(["B"]);
    expect(card.colorIdentity).toEqual(["B"]);
    expect(card.rarity).toBe("mythic");
    expect(card.set).toBe("DMU");
    expect(card.keywords).toEqual(["deathtouch"]);
    expect(card.legalities).toEqual({ standard: "banned", historic: "legal" });
  });
});
