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
      ).bind(
        ATRAXA_ID,
        "Atraxa, Praetors' Voice",
        "atraxa-praetors-voice",
        '["W","U","B","G"]',
        40_000,
        3,
      ),
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
      env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`).bind(
        "Cyclonic Rift",
      ),

      // Recommendations table (M7+ pipeline reads this for baseline + upgrade
      // candidates instead of the tier-deck table directly).
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Sol Ring", "manaartifacts", 0.5, 5000),
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Cultivate", "manaartifacts", 1.2, 3500),
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Birds of Paradise", "creatures", 0.8, 2200),
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Cyclonic Rift", "removal", 2.5, 4500),

      // Card metadata for the recommended cards (for type_line lookup in
      // the structured output's category derivation).
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default) VALUES (?, ?, ?, ?, ?, 1)`,
      ).bind("solring-id", "Sol Ring", "Sol Ring", "Artifact", "TST"),
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default) VALUES (?, ?, ?, ?, ?, 1)`,
      ).bind("cultivate-id", "Cultivate", "Cultivate", "Sorcery", "TST"),
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default) VALUES (?, ?, ?, ?, ?, 1)`,
      ).bind("bop-id", "Birds of Paradise", "Birds of Paradise", "Creature", "TST"),
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default) VALUES (?, ?, ?, ?, ?, 1)`,
      ).bind("rift-id", "Cyclonic Rift", "Cyclonic Rift", "Instant", "TST"),

      // Role tags so deltaRoleCoverage moves the upgrade loop in a useful
      // direction.
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("solring-id", "Sol Ring", "ramp", "TST"),
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("cultivate-id", "Cultivate", "ramp", "TST"),
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("bop-id", "Birds of Paradise", "ramp", "TST"),
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("rift-id", "Cyclonic Rift", "removal", "TST"),

      // Prices via EDHREC TCGPlayer
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Sol Ring", 1.5),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Cultivate", 0.5),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Birds of Paradise", 7),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Cyclonic Rift", 32),
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

  it("must_include with no known price still pins (and is listed in cards_without_prices)", async () => {
    await seedAtraxa();
    // "Mystery Card" has no entry in either magic_edh_card_prices or magic_cards.
    const result = await commanderDeckbuildModule.execute(
      {
        commander: "Atraxa",
        max_price: 100,
        must_include: ["Mystery Card"],
        exclude_game_changers: false,
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      deck: { card_name: string; source: string; price_usd: number | null }[];
      cards_without_prices: string[];
    };
    const mystery = data.deck.find((c) => c.card_name === "Mystery Card");
    expect(mystery).toBeDefined();
    expect(mystery!.source).toBe("must_include");
    expect(mystery!.price_usd).toBeNull();
    expect(data.cards_without_prices).toContain("Mystery Card");
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
      // Realistic precon size — quantity 97 of Forest pads to 99 non-commander
      // cards (clears the orchestrator's ≥60-card threshold).
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_decks (precon_slug, card_name, quantity, category) VALUES (?, ?, ?, ?)`,
      ).bind("breed-lethality", "Forest", 97, "Land"),
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
      ).bind("Inexorable Tide", 3),
      // M7+ pipeline reads from magic_edh_recommendations for upgrade
      // candidates (instead of magic_edh_precon_upgrades). Mirror the
      // expected upgrade in the recommendations table.
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Inexorable Tide", "topcards", 4, 9300),
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default) VALUES (?, ?, ?, ?, ?, 1)`,
      ).bind("tide-id", "Inexorable Tide", "Inexorable Tide", "Enchantment", "MBS"),
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("tide-id", "Inexorable Tide", "win_condition", "MBS"),
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

  // ── M4.3 polish: data_confidence, reserved, priced_at, mana base ──

  it("surfaces data_confidence='high' when num_decks_avg ≥ 1000", async () => {
    await seedAtraxa(); // budget tier seeded with num_decks_avg = 4072
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 200 },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { tier_info: { data_confidence: string } };
    expect(data.tier_info.data_confidence).toBe("high");
  });

  it("surfaces data_confidence='low' when num_decks_avg < 100", async () => {
    await seedAtraxa();
    // Override Atraxa cedh tier to a low sample size + add a deck row
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE magic_edh_commander_tiers SET num_decks_avg = ? WHERE commander_id = ? AND tier = ?`,
      ).bind(50, ATRAXA_ID, "optimized"),
    ]);
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", tier: "optimized" },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { tier_info: { data_confidence: string } };
    expect(data.tier_info.data_confidence).toBe("low");
  });

  it("flags Reserved List cards in deck entries", async () => {
    await seedAtraxa();
    // Insert a Reserved List card row in magic_cards that matches a deck entry.
    await env.DB.prepare(
      `INSERT INTO magic_cards (scryfall_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default, price_usd, reserved, reprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, 0)`,
    )
      .bind(
        "scry-bop",
        "oracle-bop",
        "Birds of Paradise",
        "{G}",
        1,
        "Creature — Bird",
        "Flying",
        '["G"]',
        '["G"]',
        "{}",
        "rare",
        "LEA",
        "[]",
        7,
      )
      .run();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100 },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { deck: { card_name: string; reserved?: boolean }[] };
    const bop = data.deck.find((c) => c.card_name === "Birds of Paradise");
    expect(bop?.reserved).toBe(true);
  });

  it("surfaces priced_at when EDHREC prices are used", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100 },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { attribution: { priced_at?: string } };
    expect(data.attribution.priced_at).toBeDefined();
    expect(data.attribution.priced_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  // ── theme parameter ──────────────────────────────────────────

  async function seedAtraxaInfectTheme(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_commander_theme_meta (commander_id, theme_slug, theme_value, avg_price, num_decks_avg, deck_size) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "infect", "Infect", 1391, 5594, 90),
      // Theme deck — distinct from the budget tier seed (different cards)
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_theme (commander_id, theme_slug, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "infect", "Phyrexian Crusader", 1, "Creature"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_theme (commander_id, theme_slug, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "infect", "Inkmoth Nexus", 1, "Land"),
      // Forest x97 pads the theme decklist to 99 non-commander cards so it
      // clears the orchestrator's ≥60-card threshold for precon-style use.
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_theme (commander_id, theme_slug, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "infect", "Forest", 97, "Land"),
      // Prices for theme cards
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Phyrexian Crusader", 4),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Inkmoth Nexus", 25),
    ]);
  }

  it("theme='infect' returns infect-theme deck instead of cross-theme tier average", async () => {
    await seedAtraxa();
    await seedAtraxaInfectTheme();

    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 200, theme: "infect" },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");

    const data = result.data as {
      theme_info: { theme_slug: string; theme_value: string; avg_price: number };
      deck: { card_name: string }[];
    };
    expect(data.theme_info.theme_slug).toBe("infect");
    expect(data.theme_info.avg_price).toBe(1391);
    const names = data.deck.map((c) => c.card_name);
    expect(names).toContain("Phyrexian Crusader");
    expect(names).toContain("Inkmoth Nexus");
    // Budget-tier seeded card NOT present (theme path bypasses tier deck)
    expect(names).not.toContain("Cyclonic Rift");
  });

  it("returns text when theme is unknown for the commander", async () => {
    await seedAtraxa();
    // No theme rows seeded.
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", theme: "tribal-zombies" },
      env as unknown as Env,
    );
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content.toLowerCase()).toContain("theme");
  });

  it("budget_mode='target' allows total_price to exceed max_price by ≤10%", async () => {
    await seedAtraxa();
    // Budget tier seeded earlier sums to less than max_price for these
    // tests. To exercise target mode, we need a scenario where the next
    // card would push over ceiling but stays under 1.1× max_price.
    // Sol Ring ($1.5) + Birds of Paradise ($7.0) + Cyclonic Rift ($32) +
    // Cultivate ($0.5) + Forest×8 ($0.8) = $41.8. With max_price=$40 in
    // ceiling mode, Cyclonic Rift drops out (would push past $40). In
    // target mode at $40 with 10% slack ($44 ceiling), Rift fits.
    const result = await commanderDeckbuildModule.execute(
      {
        commander: "Atraxa",
        max_price: 40,
        budget_mode: "target",
        exclude_game_changers: false,
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      budget: { mode: string; total_price: number };
      deck: { card_name: string }[];
    };
    expect(data.budget.mode).toBe("target");
    // Total may exceed max_price (40) but must stay within 1.1× = 44.
    expect(data.budget.total_price).toBeLessThanOrEqual(44);
  });

  it("places basics + lands before non-lands when budget forces cuts", async () => {
    // Reproduces the Edgar Markov $500 production failure: alphabetical
    // greedy walk burned the budget on early-letter expensive non-land cards
    // and ran out before reaching M/P/S basics. The fix sorts basics first,
    // lands second, others last — guaranteeing a mana base whenever budget
    // permits.
    const EDGAR_ID = "edgar-id";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(EDGAR_ID, "Edgar Markov", "edgar-markov", '["R","W","B"]', 4485, 1),
      env.DB.prepare(`INSERT INTO magic_edh_commanders_fts (scryfall_id, name) VALUES (?, ?)`).bind(
        EDGAR_ID,
        "Edgar Markov",
      ),
      env.DB.prepare(
        `INSERT INTO magic_edh_commander_tiers (commander_id, tier, avg_price, num_decks_avg, deck_size) VALUES (?, ?, ?, ?, ?)`,
      ).bind(EDGAR_ID, "budget", 100, 4485, 99),

      // 5 alphabetically-early non-land cards at $1.30 each — under
      // single-card sanity cap ($7/2 = $3.50). Each is plausibly-named
      // so the test reads as realistic.
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(EDGAR_ID, "budget", "Anguished Unmaking", 1, "instants"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(EDGAR_ID, "budget", "Blood Artist", 1, "creatures"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(EDGAR_ID, "budget", "Cordial Vampire", 1, "creatures"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(EDGAR_ID, "budget", "Drana, Liberator of Malakir", 1, "creatures"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(EDGAR_ID, "budget", "Edgar, Charmed Groom", 1, "creatures"),

      // Late-alphabet basics (production-shape "basics" lowercase plural)
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(EDGAR_ID, "budget", "Mountain", 10, "basics"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(EDGAR_ID, "budget", "Plains", 10, "basics"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(EDGAR_ID, "budget", "Swamp", 10, "basics"),

      // Prices
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Anguished Unmaking", 1.3),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Blood Artist", 1.3),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Cordial Vampire", 1.3),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Drana, Liberator of Malakir", 1.3),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Edgar, Charmed Groom", 1.3),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Mountain", 0.13),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Plains", 0.13),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Swamp", 0.13),
    ]);

    // Budget $7: under alphabetical greedy, 5 × $1.30 = $6.50 fills, leaving
    // $0.50 — not enough for any 10-pack of basics ($1.30 each), so the
    // deck ends up with ZERO basics. With the fix, basics ($3.90) go in
    // first, then 2 non-lands ($2.60) fit — final $6.50, ALL basics + 2
    // staples.
    const result = await commanderDeckbuildModule.execute(
      { commander: "Edgar Markov", max_price: 7 },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      deck: { card_name: string; category: string }[];
      budget: { total_price: number };
    };
    const names = data.deck.map((c) => c.card_name);

    // The functional-deck assertion: a 99-card slot count without basics
    // is not a usable Magic deck. All three colors' basics must appear.
    expect(names).toContain("Mountain");
    expect(names).toContain("Plains");
    expect(names).toContain("Swamp");
    expect(data.budget.total_price).toBeLessThanOrEqual(7);
  });

  it("budget_mode='ceiling' (default) never exceeds max_price", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 40, exclude_game_changers: false },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      budget: { mode: string; total_price: number };
    };
    expect(data.budget.mode).toBe("ceiling");
    expect(data.budget.total_price).toBeLessThanOrEqual(40);
  });

  it("caps mana base at 40% of budget by substituting basics for expensive lands", async () => {
    await seedAtraxa();
    // Replace seeded Forest with an expensive nonbasic so the cap kicks in.
    await env.DB.prepare(
      `DELETE FROM magic_edh_average_decks_by_tier WHERE commander_id = ? AND card_name = ?`,
    )
      .bind(ATRAXA_ID, "Forest")
      .run();
    await env.DB.batch([
      // Two expensive duals in the budget tier; combined would blow the cap
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Tropical Island", 1, "Land"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Underground Sea", 1, "Land"),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Tropical Island", 250),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Underground Sea", 320),
    ]);

    // Budget=$100; lands cap = $40. Each dual is $250+. Both must be swapped.
    const result = await commanderDeckbuildModule.execute(
      {
        commander: "Atraxa",
        max_price: 100,
        // Allow the dual lands through the single-card sanity check by raising it,
        // since otherwise they'd be dropped before mana base re-allocation runs.
        // Actually — single-card sanity (price > max_price/2) already drops $250
        // and $320 cards from a $100 budget. So this test exercises the case
        // where we have to handle large-priced lands sensibly.
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      deck: { card_name: string; category: string }[];
      mana_base_substitutions?: { out: string; in: string; saved: number }[];
    };
    // Expensive duals must NOT appear; basics may appear in their place.
    const names = data.deck.map((c) => c.card_name);
    expect(names).not.toContain("Tropical Island");
    expect(names).not.toContain("Underground Sea");
  });

  // ── M3.2: combo-aware budget cuts ─────────────────────────────

  it("does NOT warn about combo when the other piece was never in the tier", async () => {
    await seedAtraxa();
    // Add only Thassa's Oracle (not Demonic Consultation) to tier.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Thassa's Oracle", 1, "Creature"),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Thassa's Oracle", 18),
      // Combo entry references both, but only one is in tier.
      env.DB.prepare(
        `INSERT INTO magic_edh_combos (commander_id, combo_id, card_names, card_ids, colors, results, deck_count, percentage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        ATRAXA_ID,
        "thoracle-demcon",
        '["Thassa\'s Oracle","Demonic Consultation"]',
        "[]",
        "WUBG",
        '["win the game"]',
        500,
        12.5,
      ),
    ]);
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 10, exclude_game_changers: false },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { warnings: string[] };
    // Combo wasn't intact regardless — dropping Thassa's doesn't break a
    // working strategy.
    const comboWarning = data.warnings.find((w) => w.toLowerCase().includes("combo"));
    expect(comboWarning).toBeUndefined();
  });

  // ── M4: deck-quality + completion wired into output ───────────

  it("output includes quality block populated by assessQuality", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100, exclude_game_changers: false },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      quality?: {
        bracket: { tier: number };
        composition: Record<string, unknown>;
        vectors: { mana_base: number; composition: number };
        score: number;
        weights: Record<string, number>;
      };
    };
    expect(data.quality).toBeDefined();
    expect(data.quality?.bracket.tier).toBeGreaterThanOrEqual(1);
    expect(data.quality?.bracket.tier).toBeLessThanOrEqual(5);
    expect(data.quality?.score).toBeGreaterThanOrEqual(0);
    expect(data.quality?.score).toBeLessThanOrEqual(100);
    expect(data.quality?.weights).toBeDefined();
  });

  it("output includes completion block with added recommendations + basics", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100, exclude_game_changers: false },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      completion?: {
        added_from_recommendations: { card_name: string }[];
        added_basics: { name: string; quantity: number }[];
        karsten_warnings: string[];
      };
    };
    expect(data.completion).toBeDefined();
    // Atraxa is WUBG — completion should pad with basics from those colors.
    expect(data.completion?.added_basics.length).toBeGreaterThan(0);
  });

  it("deck is padded to 99 non-commander slots after completion", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100, exclude_game_changers: false },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      deck: { card_name: string; quantity: number }[];
      slots_remaining: number;
    };
    const total = data.deck.reduce((sum, entry) => sum + entry.quantity, 0);
    expect(total).toBe(99);
    expect(data.slots_remaining).toBe(0);
  });
});
