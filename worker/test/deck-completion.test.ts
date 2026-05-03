import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { buildMinimalShell } from "../../plugins/magic/reference/deck-completion";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const ATRAXA_ID = "atraxa-id";
const COMMANDER = { scryfall_id: ATRAXA_ID, name: "Atraxa, Praetors' Voice" };

interface SeedCard {
  name: string;
  type: string;
  roles: string[];
  produced_mana?: string[]; // for lands
  mana_cost?: string; // for spells (e.g. "{1}{W}{W}")
  cmc?: number;
}

async function seedCards(cards: SeedCard[]): Promise<void> {
  const seen = new Set<string>();
  const stmts: D1PreparedStatement[] = [];
  for (const c of cards) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default, mana_cost, cmc, produced_mana)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `${c.name}-id`,
        c.name,
        c.name,
        c.type,
        "TST",
        1,
        c.mana_cost ?? "",
        c.cmc ?? 0,
        c.produced_mana ? JSON.stringify(c.produced_mana) : "[]",
      ),
    );
    for (const role of c.roles) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
        ).bind(`${c.name}-id`, c.name, role, "TST"),
      );
    }
  }
  if (stmts.length > 0) await env.DB.batch(stmts);
}

async function seedRecommendations(
  recs: { card_name: string; category: string; inclusion: number; synergy?: number }[],
): Promise<void> {
  const stmts = recs.map((r) =>
    env.DB.prepare(
      `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion)
         VALUES (?, ?, ?, ?, ?)`,
    ).bind(ATRAXA_ID, r.card_name, r.category, r.synergy ?? 0, r.inclusion),
  );
  if (stmts.length > 0) await env.DB.batch(stmts);
}

async function seedCommander(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank)
       VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      ATRAXA_ID,
      "Atraxa, Praetors' Voice",
      "atraxa-praetors-voice",
      '["W","U","B","G"]',
      40_000,
      3,
    )
    .run();
}

// ── M7.1: buildMinimalShell ─────────────────────────────────────────
//
// buildMinimalShell produces a 100-card legal deck (1 commander + 99 others)
// from scratch using the cheapest qualifying recommendations for role floors,
// then padding with high-inclusion recs, then basics. It is the universal
// baseline for the marginal-utility upgrade loop (M7.2+).

interface ShellSeed {
  ramp?: number; // count of ramp cards to seed
  draw?: number;
  removal?: number;
  win_condition?: number;
  generic?: number; // additional generic recs (no role tag)
  pricePerCard?: number; // applied to all seeded recs (default 0.5)
}

async function seedShellFixture(seed: ShellSeed): Promise<{
  rampNames: string[];
  drawNames: string[];
  removalNames: string[];
  winNames: string[];
  genericNames: string[];
}> {
  const ramp = seed.ramp ?? 0;
  const draw = seed.draw ?? 0;
  const removal = seed.removal ?? 0;
  const win = seed.win_condition ?? 0;
  const generic = seed.generic ?? 0;
  const price = seed.pricePerCard ?? 0.5;

  const rampNames = Array.from({ length: ramp }, (_, index) => `Ramp${String(index)}`);
  const drawNames = Array.from({ length: draw }, (_, index) => `Draw${String(index)}`);
  const removalNames = Array.from({ length: removal }, (_, index) => `Removal${String(index)}`);
  const winNames = Array.from({ length: win }, (_, index) => `WinCon${String(index)}`);
  const genericNames = Array.from({ length: generic }, (_, index) => `Generic${String(index)}`);

  const cards: SeedCard[] = [
    ...rampNames.map((n) => ({ name: n, type: "Sorcery", roles: ["ramp"], cmc: 3 })),
    ...drawNames.map((n) => ({ name: n, type: "Sorcery", roles: ["card_draw"], cmc: 3 })),
    ...removalNames.map((n) => ({ name: n, type: "Instant", roles: ["removal"], cmc: 2 })),
    ...winNames.map((n) => ({
      name: n,
      type: "Creature — Beast",
      roles: ["win_condition"],
      cmc: 5,
    })),
    ...genericNames.map((n) => ({ name: n, type: "Creature — Beast", roles: [], cmc: 4 })),
  ];
  await seedCards(cards);

  const allRecs = [
    ...rampNames.map((n, index) => ({
      card_name: n,
      category: "manaartifacts",
      inclusion: 9000 - index,
    })),
    ...drawNames.map((n, index) => ({
      card_name: n,
      category: "card_advantage",
      inclusion: 8000 - index,
    })),
    ...removalNames.map((n, index) => ({
      card_name: n,
      category: "removal",
      inclusion: 7000 - index,
    })),
    ...winNames.map((n, index) => ({
      card_name: n,
      category: "topcards",
      inclusion: 6000 - index,
    })),
    ...genericNames.map((n, index) => ({
      card_name: n,
      category: "topcards",
      inclusion: 5000 - index,
    })),
  ];
  await seedRecommendations(allRecs);

  // Seed prices for all non-basic cards.
  const priceStmts = allRecs.map((r) =>
    env.DB.prepare(
      `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
    ).bind(r.card_name, price),
  );
  if (priceStmts.length > 0) await env.DB.batch(priceStmts);

  return { rampNames, drawNames, removalNames, winNames, genericNames };
}

function countTotal(deck: { card_name: string; quantity?: number }[]): number {
  return deck.reduce((sum, entry) => sum + (entry.quantity ?? 1), 0);
}

const BASICS = new Set(["Forest", "Island", "Swamp", "Plains", "Mountain", "Wastes"]);

function countBasics(deck: { card_name: string; quantity?: number }[]): number {
  return deck
    .filter((entry) => BASICS.has(entry.card_name))
    .reduce((sum, entry) => sum + (entry.quantity ?? 1), 0);
}

function nonBasicNames(deck: { card_name: string; quantity?: number }[]): string[] {
  return deck.filter((entry) => !BASICS.has(entry.card_name)).map((entry) => entry.card_name);
}

describe("buildMinimalShell", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCommander();
  });

  it("produces exactly 100 cards (commander + 99 others) at $50 budget", async () => {
    await seedShellFixture({
      ramp: 12,
      draw: 10,
      removal: 10,
      win_condition: 10,
      generic: 35,
      pricePerCard: 0.5,
    });

    const result = await buildMinimalShell(env as unknown as Env, COMMANDER, 50, [], false);

    expect(countTotal(result.deck)).toBe(100);
    // Commander is the first card.
    expect(result.deck[0]?.card_name).toBe(COMMANDER.name);
  });

  it("respects budget ceiling at $10 — total non-basic cost ≤ budget", async () => {
    // Seed cards at $1 each. At $10 budget, only 10 non-basic cards can fit.
    await seedShellFixture({
      ramp: 12,
      draw: 10,
      removal: 10,
      win_condition: 10,
      generic: 35,
      pricePerCard: 1,
    });

    const result = await buildMinimalShell(env as unknown as Env, COMMANDER, 10, [], false);

    expect(countTotal(result.deck)).toBe(100);
    expect(result.totalCost).toBeLessThanOrEqual(10);
    // With only 10 non-basic slots filled, the rest must be basics.
    expect(countBasics(result.deck)).toBeGreaterThanOrEqual(89); // 99 - 10
    // At least one warning surfaces about role lower bounds not met.
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("only adds cards present in the recommendation set (color-legal by construction)", async () => {
    const { rampNames, drawNames, removalNames, winNames, genericNames } = await seedShellFixture({
      ramp: 12,
      draw: 10,
      removal: 10,
      win_condition: 10,
      generic: 35,
      pricePerCard: 0.5,
    });
    const validNames = new Set([
      ...rampNames,
      ...drawNames,
      ...removalNames,
      ...winNames,
      ...genericNames,
    ]);

    const result = await buildMinimalShell(env as unknown as Env, COMMANDER, 100, [], false);

    for (const name of nonBasicNames(result.deck)) {
      if (name === COMMANDER.name) continue;
      expect(validNames.has(name)).toBe(true);
    }
  });

  it("caps nonbasic lands at the configured land target so Phase 3 doesn't overpad with basics", async () => {
    // Seed 50 cheap dual lands (high inclusion → sort before spells in
    // Phase 2's price-ASC, inclusion-DESC ordering) and 80 cheap spells.
    // Without the cap, Phase 2 grabs all 50 lands + 13 spells (filling
    // NON_BASIC_TARGET=63) and Phase 3 pads with 36 basics → 86 total
    // lands. The cap holds nonbasic land count to ~13 so total lands ≈ 36.
    const landCards: SeedCard[] = Array.from({ length: 50 }, (_, index) => ({
      name: `DualLand${String(index)}`,
      type: "Land — Tap Land",
      roles: [],
    }));
    const spellCards: SeedCard[] = Array.from({ length: 80 }, (_, index) => ({
      name: `Spell${String(index)}`,
      type: "Sorcery",
      roles: [],
    }));
    await seedCards([...landCards, ...spellCards]);

    const recs = [
      ...landCards.map((c, index) => ({
        card_name: c.name,
        category: "lands",
        inclusion: 200 - (index % 5), // higher than spells
      })),
      ...spellCards.map((c, index) => ({
        card_name: c.name,
        category: "topcards",
        inclusion: 100 - (index % 5),
      })),
    ];
    await seedRecommendations(recs);

    const priceStmts = [...landCards, ...spellCards].map((c) =>
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind(c.name, 0.2),
    );
    await env.DB.batch(priceStmts);

    const result = await buildMinimalShell(env as unknown as Env, COMMANDER, 100, [], false);

    expect(countTotal(result.deck)).toBe(100);
    const nonbasicLands = result.deck.filter((entry) => entry.card_name.startsWith("DualLand"));
    const nonbasicLandCount = nonbasicLands.reduce((sum, entry) => sum + (entry.quantity ?? 1), 0);
    const totalLands = nonbasicLandCount + countBasics(result.deck);
    expect(nonbasicLandCount).toBeLessThanOrEqual(13);
    expect(totalLands).toBeLessThanOrEqual(42);
  });

  it("uses caller-supplied landTarget over the default constant", async () => {
    // Same fixture as the cap test, but pass a tighter landTarget
    // (total=30, nonbasicCap=5). Phase 2 should fill 69 spells + 5
    // nonbasic lands; Phase 3 pads 25 basics → total lands = 30.
    const landCards: SeedCard[] = Array.from({ length: 50 }, (_, index) => ({
      name: `Custom${String(index)}`,
      type: "Land — Tap Land",
      roles: [],
    }));
    const spellCards: SeedCard[] = Array.from({ length: 80 }, (_, index) => ({
      name: `Spl${String(index)}`,
      type: "Sorcery",
      roles: [],
    }));
    await seedCards([...landCards, ...spellCards]);
    await seedRecommendations([
      ...landCards.map((c, index) => ({
        card_name: c.name,
        category: "lands",
        inclusion: 200 - (index % 5),
      })),
      ...spellCards.map((c, index) => ({
        card_name: c.name,
        category: "topcards",
        inclusion: 100 - (index % 5),
      })),
    ]);
    const priceStmts = [...landCards, ...spellCards].map((c) =>
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind(c.name, 0.2),
    );
    await env.DB.batch(priceStmts);

    const result = await buildMinimalShell(env as unknown as Env, COMMANDER, 100, [], false, {
      totalLandsTarget: 30,
      nonbasicLandCap: 5,
    });

    expect(countTotal(result.deck)).toBe(100);
    const nonbasicLandCount = result.deck
      .filter((entry) => entry.card_name.startsWith("Custom"))
      .reduce((sum, entry) => sum + (entry.quantity ?? 1), 0);
    const totalLands = nonbasicLandCount + countBasics(result.deck);
    expect(nonbasicLandCount).toBeLessThanOrEqual(5);
    expect(totalLands).toBeLessThanOrEqual(32);
  });

  it("Karsten land count: at least 36 basics in the result", async () => {
    await seedShellFixture({
      ramp: 12,
      draw: 10,
      removal: 10,
      win_condition: 10,
      generic: 35,
      pricePerCard: 0.5,
    });

    const result = await buildMinimalShell(env as unknown as Env, COMMANDER, 100, [], false);

    expect(countBasics(result.deck)).toBeGreaterThanOrEqual(36);
  });

  it("role lower bounds met at adequate budget ($100)", async () => {
    const { rampNames, drawNames, removalNames, winNames } = await seedShellFixture({
      ramp: 12,
      draw: 10,
      removal: 10,
      win_condition: 10,
      generic: 35,
      pricePerCard: 0.5,
    });

    const result = await buildMinimalShell(env as unknown as Env, COMMANDER, 100, [], false);

    const deckNames = new Set(result.deck.map((entry) => entry.card_name));
    const rampInDeck = rampNames.filter((n) => deckNames.has(n)).length;
    const drawInDeck = drawNames.filter((n) => deckNames.has(n)).length;
    const removalInDeck = removalNames.filter((n) => deckNames.has(n)).length;
    const winInDeck = winNames.filter((n) => deckNames.has(n)).length;

    expect(rampInDeck).toBeGreaterThanOrEqual(10);
    expect(drawInDeck).toBeGreaterThanOrEqual(8);
    expect(removalInDeck).toBeGreaterThanOrEqual(8);
    expect(winInDeck).toBeGreaterThanOrEqual(7);
  });

  it("excludes filter — named card never appears in result", async () => {
    await seedShellFixture({
      ramp: 12,
      draw: 10,
      removal: 10,
      win_condition: 10,
      generic: 35,
      pricePerCard: 0.5,
    });

    const result = await buildMinimalShell(env as unknown as Env, COMMANDER, 100, ["Ramp0"], false);

    const deckNames = new Set(result.deck.map((entry) => entry.card_name));
    expect(deckNames.has("Ramp0")).toBe(false);
    // Other ramps still added.
    expect(deckNames.has("Ramp1")).toBe(true);
  });

  it("excludeGameChangers — Game Changer cards never appear", async () => {
    await seedShellFixture({
      ramp: 12,
      draw: 10,
      removal: 10,
      win_condition: 10,
      generic: 35,
      pricePerCard: 0.5,
    });
    await env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`)
      .bind("Ramp0")
      .run();

    const result = await buildMinimalShell(env as unknown as Env, COMMANDER, 100, [], true);

    const deckNames = new Set(result.deck.map((entry) => entry.card_name));
    expect(deckNames.has("Ramp0")).toBe(false);
  });

  it("determinism — same inputs produce same output", async () => {
    await seedShellFixture({
      ramp: 12,
      draw: 10,
      removal: 10,
      win_condition: 10,
      generic: 35,
      pricePerCard: 0.5,
    });

    const r1 = await buildMinimalShell(env as unknown as Env, COMMANDER, 100, [], false);
    const r2 = await buildMinimalShell(env as unknown as Env, COMMANDER, 100, [], false);

    const names1 = r1.deck
      .map((entry) => `${entry.card_name}x${String(entry.quantity ?? 1)}`)
      .toSorted((a, b) => a.localeCompare(b));
    const names2 = r2.deck
      .map((entry) => `${entry.card_name}x${String(entry.quantity ?? 1)}`)
      .toSorted((a, b) => a.localeCompare(b));
    expect(names1).toEqual(names2);
    expect(r1.totalCost).toBe(r2.totalCost);
  });

  it("extreme low budget — $0 budget produces 100-card all-basic deck", async () => {
    // All recs cost $0.5 each, so at $0 nothing fits.
    await seedShellFixture({
      ramp: 12,
      draw: 10,
      removal: 10,
      win_condition: 10,
      generic: 35,
      pricePerCard: 0.5,
    });

    const result = await buildMinimalShell(env as unknown as Env, COMMANDER, 0, [], false);

    expect(countTotal(result.deck)).toBe(100);
    // Only basics + commander. Non-basic count = 1 (commander).
    const nonBasic = nonBasicNames(result.deck);
    expect(nonBasic).toEqual([COMMANDER.name]);
    expect(result.totalCost).toBe(0);
    // Warnings fire for every unmet role.
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("totalCost reflects sum of non-basic prices in the result", async () => {
    await seedShellFixture({
      ramp: 12,
      draw: 10,
      removal: 10,
      win_condition: 10,
      generic: 35,
      pricePerCard: 0.5,
    });

    const result = await buildMinimalShell(env as unknown as Env, COMMANDER, 100, [], false);

    // Compute expected: every non-basic card except commander × $0.5.
    const nonBasicCount = nonBasicNames(result.deck).filter((n) => n !== COMMANDER.name).length;
    const expectedCost = nonBasicCount * 0.5;
    // Floating-point tolerance.
    expect(Math.abs(result.totalCost - expectedCost)).toBeLessThan(0.01);
  });

  it("M7.7: respects Scryfall price fallback for cards missing from magic_edh_card_prices", async () => {
    // Seed an "expensive ramp" card with NO row in magic_edh_card_prices —
    // only in magic_cards.price_usd. Without the fallback, the role-fill
    // SQL treats the card as $0 and pulls it into the baseline at zero
    // cost, blowing past the budget. With the fallback, the card costs
    // $50 and skips at a $10 budget.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default, price_usd)
           VALUES (?, ?, ?, ?, ?, 1, ?)`,
      ).bind("expensive-id", "Expensive Ramp", "Expensive Ramp", "Sorcery", "TST", 50),
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("expensive-id", "Expensive Ramp", "ramp", "TST"),
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion)
           VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Expensive Ramp", "manaartifacts", 1, 5000),
      // Note: no INSERT into magic_edh_card_prices for "Expensive Ramp".
    ]);

    const result = await buildMinimalShell(env as unknown as Env, COMMANDER, 10, [], false);

    // The card must NOT appear in the result: $50 > $10 budget.
    const deckNames = new Set(result.deck.map((entry) => entry.card_name));
    expect(deckNames.has("Expensive Ramp")).toBe(false);
    expect(result.totalCost).toBeLessThanOrEqual(10);
  });
});
