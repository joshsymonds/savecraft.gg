import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { commanderDeckbuildModule } from "../../plugins/magic/reference/commander-deckbuild";
import { registerNativeModule } from "../src/reference/registry";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const ATRAXA_ID = "atraxa-id";

describe("commander_deckbuild native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("magic", commanderDeckbuildModule);
  });

  async function seedAtraxa(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Atraxa, Praetors' Voice", "atraxa-praetors-voice", '["W","U","B","G"]', 40000, 3),
      env.DB.prepare(`INSERT INTO magic_edh_commanders_fts (scryfall_id, name) VALUES (?, ?)`).bind(
        ATRAXA_ID,
        "Atraxa, Praetors' Voice",
      ),

      // Budget tier metadata
      env.DB.prepare(
        `INSERT INTO magic_edh_commander_tiers (commander_id, tier, avg_price, num_decks_avg, deck_size) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", 174, 4072, 84),
      env.DB.prepare(
        `INSERT INTO magic_edh_commander_tiers (commander_id, tier, avg_price, num_decks_avg, deck_size) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "optimized", 2456, 1948, 93),

      // Optimized tier deck — small set so tests targeting tier='optimized'
      // have at least one card to confirm tier_used in the response.
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "optimized", "Mana Crypt", 1, "Artifact"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "optimized", "Forest", 5, "Land"),

      // Budget tier deck — includes a game changer (Cyclonic Rift) for filter test
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Sol Ring", 1, "Artifact"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Cultivate", 1, "Sorcery"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Birds of Paradise", 1, "Creature"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Cyclonic Rift", 1, "Instant"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Forest", 8, "Land"),

      // Game-changers table (Cyclonic Rift is on the WotC list)
      env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`).bind("Cyclonic Rift"),

      // Prices via EDHREC TCGPlayer
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Sol Ring", 1.5),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Cultivate", 0.5),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Birds of Paradise", 7.0),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Cyclonic Rift", 32.0),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Forest", 0.1),
    ]);
  }

  it("happy path: returns a deck under max_price", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100 },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;

    const data = result.data as {
      commander: { tier_used: string };
      budget: { max_price: number; total_price: number };
      deck: { card_name: string }[];
      slots_remaining: number;
    };
    expect(data.commander.tier_used).toBe("budget");
    expect(data.budget.max_price).toBe(100);
    expect(data.budget.total_price).toBeLessThanOrEqual(100);
    expect(data.deck.length).toBeGreaterThan(0);
  });

  it("excludes named cards", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100, excludes: ["Sol Ring"] },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { deck: { card_name: string }[] };
    expect(data.deck.map((c) => c.card_name)).not.toContain("Sol Ring");
  });

  it("must_include pins cards even when over budget", async () => {
    await seedAtraxa();
    // Budget too low to include Cyclonic Rift naturally ($32 > $20),
    // but must_include forces it in.
    const result = await commanderDeckbuildModule.execute(
      {
        commander: "Atraxa",
        max_price: 20,
        must_include: ["Cyclonic Rift"],
        exclude_game_changers: false,
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      deck: { card_name: string; source: string }[];
      budget: { total_price: number };
    };
    const rift = data.deck.find((c) => c.card_name === "Cyclonic Rift");
    expect(rift).toBeDefined();
    expect(rift!.source).toBe("must_include");
  });

  it("exclude_game_changers (default at budget tier) drops Cyclonic Rift", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100 }, // tier auto-picks budget; default exclude_game_changers=true
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { deck: { card_name: string }[] };
    expect(data.deck.map((c) => c.card_name)).not.toContain("Cyclonic Rift");
  });

  it("exclude_game_changers=false keeps game changers", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100, exclude_game_changers: false },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { deck: { card_name: string; game_changer?: boolean }[] };
    const rift = data.deck.find((c) => c.card_name === "Cyclonic Rift");
    expect(rift).toBeDefined();
    expect(rift!.game_changer).toBe(true);
  });

  it("tier auto-pick: max_price=200 → 'budget'", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 200 },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { commander: { tier_used: string } };
    expect(data.commander.tier_used).toBe("budget");
  });

  it("tier auto-pick: max_price=2500 → 'optimized'", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 2500 },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { commander: { tier_used: string } };
    expect(data.commander.tier_used).toBe("optimized");
  });

  it("explicit tier overrides auto-pick", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100, tier: "optimized" },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { commander: { tier_used: string } };
    expect(data.commander.tier_used).toBe("optimized");
  });

  it("warns when max_price < tier.avg_price (below empirical floor)", async () => {
    await seedAtraxa();
    // Budget tier avg is $174; $50 is well below floor.
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 50 },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { warnings: string[] };
    const hasFloor = data.warnings.some((w) => w.toLowerCase().includes("floor"));
    expect(hasFloor).toBe(true);
  });

  it("returns text response when commander has no data for the chosen tier", async () => {
    await seedAtraxa();
    // 'cedh' tier wasn't seeded for Atraxa — should fall back to text.
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", tier: "cedh" },
      env as unknown as Env,
    );
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content.toLowerCase()).toContain("cedh");
  });

  // ── precon starting_point tests ─────────────────────────────

  async function seedAtraxaPrecon(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_precons (slug, name, msrp_usd, set_code, release_year)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind("breed-lethality", "Breed Lethality", 30, "C16", 2016),
      // Precon decklist
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_decks (precon_slug, card_name, quantity, category) VALUES (?, ?, ?, ?)`,
      ).bind("breed-lethality", "Sol Ring", 1, "Artifact"),
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_decks (precon_slug, card_name, quantity, category) VALUES (?, ?, ?, ?)`,
      ).bind("breed-lethality", "Cultivate", 1, "Sorcery"),
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_decks (precon_slug, card_name, quantity, category) VALUES (?, ?, ?, ?)`,
      ).bind("breed-lethality", "Forest", 7, "Land"),
      // Upgrade pool — Inexorable Tide (~$3) is recommended add; Frumious is cut
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_upgrades (precon_slug, card_name, action, category, inclusion) VALUES (?, ?, ?, ?, ?)`,
      ).bind("breed-lethality", "Inexorable Tide", "add", "cardstoadd", 93),
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_upgrades (precon_slug, card_name, action, category, inclusion) VALUES (?, ?, ?, ?, ?)`,
      ).bind("breed-lethality", "Frumious Filler", "cut", "cardstocut", 5),
      // Commander mapping (Atraxa is face)
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_commanders (precon_slug, commander_name, deck_count, is_face) VALUES (?, ?, ?, ?)`,
      ).bind("breed-lethality", "Atraxa, Praetors' Voice", 270, 1),
      // Upgrade card prices
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Inexorable Tide", 3.0),
    ]);
  }

  it("starting_point='precon:auto' seeds deck with precon contents + upgrades", async () => {
    await seedAtraxa();
    await seedAtraxaPrecon();

    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100, starting_point: "precon:auto" },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;

    const data = result.data as {
      precon: { slug: string; msrp_usd: number };
      deck: { card_name: string; source: string }[];
      budget: { total_price: number };
    };
    expect(data.precon.slug).toBe("breed-lethality");
    expect(data.precon.msrp_usd).toBe(30);
    // Deck contains precon staples
    const sources = new Map(data.deck.map((c) => [c.card_name, c.source]));
    expect(sources.get("Sol Ring")).toBe("precon");
    expect(sources.get("Cultivate")).toBe("precon");
    // Upgrade pool kicked in within remaining budget
    expect(sources.get("Inexorable Tide")).toBe("upgrade");
    // Total starts at MSRP plus upgrade prices
    expect(data.budget.total_price).toBeGreaterThanOrEqual(30);
    expect(data.budget.total_price).toBeLessThanOrEqual(100);
  });

  it("starting_point='precon:breed-lethality' exact lookup works", async () => {
    await seedAtraxa();
    await seedAtraxaPrecon();

    const result = await commanderDeckbuildModule.execute(
      {
        commander: "Atraxa",
        max_price: 100,
        starting_point: "precon:breed-lethality",
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { precon: { slug: string } };
    expect(data.precon.slug).toBe("breed-lethality");
  });

  it("returns text when budget below precon MSRP", async () => {
    await seedAtraxa();
    await seedAtraxaPrecon();

    const result = await commanderDeckbuildModule.execute(
      {
        commander: "Atraxa",
        max_price: 25, // below the $30 MSRP
        starting_point: "precon:auto",
      },
      env as unknown as Env,
    );
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content.toLowerCase()).toMatch(/msrp|budget/);
  });

  it("starting_point='precon:auto' returns text when commander has no MSRP'd precon", async () => {
    await seedAtraxa();
    // No precon seeded — auto-resolution must fail with a clear message.
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100, starting_point: "precon:auto" },
      env as unknown as Env,
    );
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content.toLowerCase()).toContain("precon");
  });

  it("upgrade cards already in precon decklist are not duplicated", async () => {
    await seedAtraxa();
    await seedAtraxaPrecon();
    // Add a duplicate-style upgrade where Sol Ring is also in cardstoadd
    // (synthetic edge case; EDHREC wouldn't normally do this but the
    // module must dedupe defensively).
    await env.DB.prepare(
      `INSERT INTO magic_edh_precon_upgrades (precon_slug, card_name, action, category, inclusion) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind("breed-lethality", "Sol Ring", "add", "cardstoadd", 90)
      .run();

    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100, starting_point: "precon:auto" },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { deck: { card_name: string }[] };
    const solRingCount = data.deck.filter((c) => c.card_name === "Sol Ring").length;
    expect(solRingCount).toBe(1);
  });
});
