import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  comboValue,
  DEFAULT_DELTA_WEIGHTS,
  deltaComboValue,
  deltaQuality,
  deltaRoleCoverage,
  logCommanderSynergy,
  roleCoverage,
} from "../../plugins/magic/reference/deck-delta";
import type { DeckEntry } from "../../plugins/magic/reference/deck-quality";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const ATRAXA_ID = "atraxa-id";
const COMMANDER = {
  scryfall_id: ATRAXA_ID,
  name: "Atraxa, Praetors' Voice",
};

interface SeedCard {
  name: string;
  type: string;
  roles: string[];
}

async function seedCommander(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank)
       VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(ATRAXA_ID, COMMANDER.name, "atraxa-praetors-voice", '["W","U","B","G"]', 40_000, 3)
    .run();
}

async function seedCards(cards: SeedCard[]): Promise<void> {
  if (cards.length === 0) return;
  const stmts = cards.flatMap((card) => {
    const cardStmt = env.DB.prepare(
      `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default)
         VALUES (?, ?, ?, ?, ?, 1)`,
    ).bind(`${card.name}-id`, card.name, card.name, card.type, "TST");
    const roleStmts = card.roles.map((role) =>
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind(`${card.name}-id`, card.name, role, "TST"),
    );
    return [cardStmt, ...roleStmts];
  });
  await env.DB.batch(stmts);
}

async function seedRecommendation(
  cardName: string,
  synergy: number,
  inclusion = 1000,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion)
       VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(ATRAXA_ID, cardName, "topcards", synergy, inclusion)
    .run();
}

function makeDeck(cards: { name: string; quantity?: number }[]): DeckEntry[] {
  return cards.map((card) => ({ card_name: card.name, quantity: card.quantity ?? 1 }));
}

describe("logCommanderSynergy", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCommander();
  });

  it("returns 0 when card has no recommendation row for this commander", async () => {
    const result = await logCommanderSynergy(env as unknown as Env, COMMANDER, "Unknown Card");
    expect(result).toBe(0);
  });

  it("returns positive value when card has high synergy", async () => {
    await seedCards([{ name: "Synergy Card", type: "Sorcery", roles: [] }]);
    await seedRecommendation("Synergy Card", 2.5);

    const result = await logCommanderSynergy(env as unknown as Env, COMMANDER, "Synergy Card");
    expect(result).toBeGreaterThan(0);
  });

  it("returns negative value when card has negative synergy", async () => {
    await seedCards([{ name: "Anti Card", type: "Sorcery", roles: [] }]);
    await seedRecommendation("Anti Card", -2);

    const result = await logCommanderSynergy(env as unknown as Env, COMMANDER, "Anti Card");
    expect(result).toBeLessThan(0);
  });

  it("bounds output to [-5, 5] for extreme synergy values", async () => {
    await seedCards([
      { name: "Huge Synergy", type: "Sorcery", roles: [] },
      { name: "Huge Anti", type: "Sorcery", roles: [] },
    ]);
    await seedRecommendation("Huge Synergy", 1_000_000);
    await seedRecommendation("Huge Anti", -1_000_000);

    const high = await logCommanderSynergy(env as unknown as Env, COMMANDER, "Huge Synergy");
    const low = await logCommanderSynergy(env as unknown as Env, COMMANDER, "Huge Anti");
    expect(high).toBeLessThanOrEqual(5);
    expect(high).toBeGreaterThan(0);
    expect(low).toBeGreaterThanOrEqual(-5);
    expect(low).toBeLessThan(0);
  });

  it("is deterministic — same call returns identical value", async () => {
    await seedCards([{ name: "Determ Card", type: "Sorcery", roles: [] }]);
    await seedRecommendation("Determ Card", 1.5);

    const a = await logCommanderSynergy(env as unknown as Env, COMMANDER, "Determ Card");
    const b = await logCommanderSynergy(env as unknown as Env, COMMANDER, "Determ Card");
    expect(a).toBe(b);
  });
});

describe("roleCoverage", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCommander();
  });

  it("returns near-zero per role for an empty deck", async () => {
    const result = await roleCoverage(env as unknown as Env, [], COMMANDER);
    expect(result.ramp).toBeLessThan(0.05);
    expect(result.card_draw).toBeLessThan(0.05);
    expect(result.removal).toBeLessThan(0.05);
    expect(result.win_conditions).toBeLessThan(0.05);
  });

  it("returns near-1 per role at COMMUNITY_BENCHMARKS upper bounds", async () => {
    // Upper bounds: ramp=12, card_draw=10, removal=10, win_conditions=10.
    const cards: SeedCard[] = [
      ...Array.from({ length: 12 }, (_, index) => ({
        name: `Ramp${String(index)}`,
        type: "Sorcery",
        roles: ["ramp"],
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        name: `Draw${String(index)}`,
        type: "Sorcery",
        roles: ["card_draw"],
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        name: `Removal${String(index)}`,
        type: "Instant",
        roles: ["removal"],
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        name: `Win${String(index)}`,
        type: "Creature",
        roles: ["win_condition"],
      })),
    ];
    await seedCards(cards);
    const deck = makeDeck(cards);

    const result = await roleCoverage(env as unknown as Env, deck, COMMANDER);
    expect(result.ramp).toBeGreaterThan(0.95);
    expect(result.card_draw).toBeGreaterThan(0.95);
    expect(result.removal).toBeGreaterThan(0.95);
    expect(result.win_conditions).toBeGreaterThan(0.95);
  });

  it("returns near-zero per role at COMMUNITY_BENCHMARKS lower bounds", async () => {
    // Lower bounds: ramp=10, card_draw=8, removal=8, win_conditions=7.
    const cards: SeedCard[] = [
      ...Array.from({ length: 10 }, (_, index) => ({
        name: `Ramp${String(index)}`,
        type: "Sorcery",
        roles: ["ramp"],
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `Draw${String(index)}`,
        type: "Sorcery",
        roles: ["card_draw"],
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `Removal${String(index)}`,
        type: "Instant",
        roles: ["removal"],
      })),
      ...Array.from({ length: 7 }, (_, index) => ({
        name: `Win${String(index)}`,
        type: "Creature",
        roles: ["win_condition"],
      })),
    ];
    await seedCards(cards);
    const deck = makeDeck(cards);

    const result = await roleCoverage(env as unknown as Env, deck, COMMANDER);
    expect(result.ramp).toBeLessThan(0.05);
    expect(result.card_draw).toBeLessThan(0.05);
    expect(result.removal).toBeLessThan(0.05);
    expect(result.win_conditions).toBeLessThan(0.05);
  });
});

describe("deltaRoleCoverage", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCommander();
  });

  it("returns positive Δ when adding a ramp card to an empty-of-ramp deck", async () => {
    // Deck: 8 ramp (below midpoint of 11). Adding a ninth ramp moves count
    // closer to the midpoint, increasing coverage.
    const cards: SeedCard[] = [
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `Ramp${String(index)}`,
        type: "Sorcery",
        roles: ["ramp"],
      })),
      { name: "NewRamp", type: "Sorcery", roles: ["ramp"] },
    ];
    await seedCards(cards);
    const deck = makeDeck(cards.slice(0, 8));

    const delta = await deltaRoleCoverage(env as unknown as Env, deck, [], ["NewRamp"], COMMANDER);
    expect(delta).toBeGreaterThan(0);
  });

  it("returns near-zero Δ when adding ramp to a deck already at upper bound (plateau)", async () => {
    // Deck: 12 ramp (upper bound). Adding a 13th has near-zero coverage
    // gain because sigmoid plateaus.
    const cards: SeedCard[] = [
      ...Array.from({ length: 12 }, (_, index) => ({
        name: `Ramp${String(index)}`,
        type: "Sorcery",
        roles: ["ramp"],
      })),
      { name: "ExtraRamp", type: "Sorcery", roles: ["ramp"] },
    ];
    await seedCards(cards);
    const deck = makeDeck(cards.slice(0, 12));

    const delta = await deltaRoleCoverage(
      env as unknown as Env,
      deck,
      [],
      ["ExtraRamp"],
      COMMANDER,
    );
    expect(Math.abs(delta)).toBeLessThan(0.05);
  });

  it("returns negative Δ when swapping a role-tagged card OUT for a non-role-tagged IN", async () => {
    // Deck has 11 ramp (midpoint, coverage ~0.5). Swap one ramp out for a
    // generic card → 10 ramp (coverage near 0). Δ is strongly negative.
    const cards: SeedCard[] = [
      ...Array.from({ length: 11 }, (_, index) => ({
        name: `Ramp${String(index)}`,
        type: "Sorcery",
        roles: ["ramp"],
      })),
      { name: "Generic", type: "Creature", roles: [] },
    ];
    await seedCards(cards);
    const deck = makeDeck(cards.slice(0, 11));

    const delta = await deltaRoleCoverage(
      env as unknown as Env,
      deck,
      ["Ramp0"],
      ["Generic"],
      COMMANDER,
    );
    expect(delta).toBeLessThan(-0.1);
  });

  it("is deterministic — same swap returns identical Δ", async () => {
    const cards: SeedCard[] = [
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `Ramp${String(index)}`,
        type: "Sorcery",
        roles: ["ramp"],
      })),
      { name: "NewRamp", type: "Sorcery", roles: ["ramp"] },
    ];
    await seedCards(cards);
    const deck = makeDeck(cards.slice(0, 8));

    const a = await deltaRoleCoverage(env as unknown as Env, deck, [], ["NewRamp"], COMMANDER);
    const b = await deltaRoleCoverage(env as unknown as Env, deck, [], ["NewRamp"], COMMANDER);
    expect(a).toBe(b);
  });
});

async function seedCombo(comboId: string, cardNames: string[]): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO magic_edh_combos (commander_id, combo_id, card_names) VALUES (?, ?, ?)`,
  )
    .bind(ATRAXA_ID, comboId, JSON.stringify(cardNames))
    .run();
}

const PARTIAL_2_OF_2 = Math.sqrt(0.5); // ≈ 0.7071: (k/n)^0.5 with k=1, n=2
const COMPLETE_BONUS = 5;

describe("comboValue", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCommander();
  });

  it("returns 0 for an empty deck", async () => {
    await seedCombo("c1", ["CardA", "CardB"]);
    const result = await comboValue(env as unknown as Env, [], COMMANDER);
    expect(result).toBe(0);
  });

  it("returns (k/n)^0.5 ≈ 0.7071 for a 2-card combo with 1 card present", async () => {
    await seedCombo("c1", ["CardA", "CardB"]);
    await seedCards([{ name: "CardA", type: "Artifact", roles: [] }]);
    const deck = makeDeck([{ name: "CardA" }]);

    const result = await comboValue(env as unknown as Env, deck, COMMANDER);
    expect(Math.abs(result - PARTIAL_2_OF_2)).toBeLessThan(0.001);
  });

  it("returns COMPLETE_BONUS for a 2-card combo with both cards present", async () => {
    await seedCombo("c1", ["CardA", "CardB"]);
    await seedCards([
      { name: "CardA", type: "Artifact", roles: [] },
      { name: "CardB", type: "Artifact", roles: [] },
    ]);
    const deck = makeDeck([{ name: "CardA" }, { name: "CardB" }]);

    const result = await comboValue(env as unknown as Env, deck, COMMANDER);
    expect(result).toBe(COMPLETE_BONUS);
  });

  it("sums across multiple combos", async () => {
    await seedCombo("c1", ["CardA", "CardB"]);
    await seedCombo("c2", ["CardC", "CardD"]);
    await seedCards([
      { name: "CardA", type: "Artifact", roles: [] },
      { name: "CardB", type: "Artifact", roles: [] },
      { name: "CardC", type: "Artifact", roles: [] },
    ]);
    // c1 complete (5), c2 partial 1/2 (≈0.7071) → total ≈ 5.7071
    const deck = makeDeck([{ name: "CardA" }, { name: "CardB" }, { name: "CardC" }]);

    const result = await comboValue(env as unknown as Env, deck, COMMANDER);
    expect(Math.abs(result - (COMPLETE_BONUS + PARTIAL_2_OF_2))).toBeLessThan(0.001);
  });
});

describe("deltaComboValue", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCommander();
  });

  it("returns positive Δ when adding the missing card of a 2-card combo", async () => {
    await seedCombo("c1", ["CardA", "CardB"]);
    await seedCards([
      { name: "CardA", type: "Artifact", roles: [] },
      { name: "CardB", type: "Artifact", roles: [] },
    ]);
    const deck = makeDeck([{ name: "CardA" }]);

    const delta = await deltaComboValue(env as unknown as Env, deck, [], ["CardB"], COMMANDER);
    expect(Math.abs(delta - (COMPLETE_BONUS - PARTIAL_2_OF_2))).toBeLessThan(0.001);
  });

  it("returns negative Δ when removing one card from a complete combo", async () => {
    await seedCombo("c1", ["CardA", "CardB"]);
    await seedCards([
      { name: "CardA", type: "Artifact", roles: [] },
      { name: "CardB", type: "Artifact", roles: [] },
    ]);
    const deck = makeDeck([{ name: "CardA" }, { name: "CardB" }]);

    const delta = await deltaComboValue(env as unknown as Env, deck, ["CardB"], [], COMMANDER);
    expect(Math.abs(delta - (PARTIAL_2_OF_2 - COMPLETE_BONUS))).toBeLessThan(0.001);
  });

  it("is deterministic — same swap returns identical Δ", async () => {
    await seedCombo("c1", ["CardA", "CardB"]);
    await seedCards([
      { name: "CardA", type: "Artifact", roles: [] },
      { name: "CardB", type: "Artifact", roles: [] },
    ]);
    const deck = makeDeck([{ name: "CardA" }]);

    const a = await deltaComboValue(env as unknown as Env, deck, [], ["CardB"], COMMANDER);
    const b = await deltaComboValue(env as unknown as Env, deck, [], ["CardB"], COMMANDER);
    expect(a).toBe(b);
  });
});

describe("deltaQuality", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCommander();
  });

  it("returns positive Δ when adding a high-synergy ramp card to an empty deck", async () => {
    // Deck of 8 ramp cards (well below midpoint), add a 9th. Card has high
    // commander synergy. ΔRoleCoverage is small but positive; ΔlogSynergy is
    // positive; ΔComboValue is 0 (no combos seeded).
    const cards = Array.from({ length: 8 }, (_, index) => ({
      name: `BaseRamp${String(index)}`,
      type: "Sorcery",
      roles: ["ramp"],
    }));
    await seedCards([...cards, { name: "BigRamp", type: "Sorcery", roles: ["ramp"] }]);
    await seedRecommendation("BigRamp", 5);
    const deck = makeDeck(cards);

    const delta = await deltaQuality(env as unknown as Env, deck, [], ["BigRamp"], COMMANDER);
    expect(delta).toBeGreaterThan(0);
  });

  it("returns 0 for a no-op swap (empty cardsOut and cardsIn)", async () => {
    const delta = await deltaQuality(env as unknown as Env, [], [], [], COMMANDER);
    expect(delta).toBe(0);
  });

  it("respects custom weights — zeroing all but combo isolates combo contribution", async () => {
    // Setup: 2-card combo, deck has 1 card, swap in the second to complete.
    // Weights: only combo_value=1, all others 0. Δ = combo_value × ΔComboValue.
    await seedCombo("c1", ["CardA", "CardB"]);
    await seedCards([
      { name: "CardA", type: "Artifact", roles: [] },
      { name: "CardB", type: "Artifact", roles: [] },
    ]);
    const deck = makeDeck([{ name: "CardA" }]);

    const delta = await deltaQuality(env as unknown as Env, deck, [], ["CardB"], COMMANDER, {
      commander_synergy: 0,
      deck_synergy: 0,
      role_coverage: 0,
      combo_value: 1,
    });
    // Expected: 1 × (5 - 0.7071) ≈ 4.2929
    const expected = COMPLETE_BONUS - PARTIAL_2_OF_2;
    expect(Math.abs(delta - expected)).toBeLessThan(0.001);
  });

  it("DEFAULT_DELTA_WEIGHTS is exported with documented values", () => {
    expect(DEFAULT_DELTA_WEIGHTS).toEqual({
      commander_synergy: 1,
      deck_synergy: 1,
      role_coverage: 2,
      combo_value: 3,
    });
  });
});
