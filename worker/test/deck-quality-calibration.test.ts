import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { assessQuality } from "../../plugins/magic/reference/deck-quality";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

/**
 * Calibration test for the M2.3 aggregate quality score. Asserts that the
 * score discriminates correctly across reference decks of known quality.
 *
 * Per the epic's amended Requirement 11: this test passing is a hard gate.
 * If we cannot calibrate the score to satisfy these assertions, the
 * aggregate `score` field MUST be dropped from the QualityReport API and
 * consumers ship per-vector breakdown only — a miscalibrated number that
 * implies precision we don't have is worse than no number at all.
 *
 * Reference decks are seeded entirely from test data (no production deps).
 * Card lists are deliberately schematic (Ramp1, Ramp2, …) — the calibration
 * tests scoring math, not card identification.
 */

const TEST_COMMANDER_ID = "calib-commander-id";
const COMMANDER = { scryfall_id: TEST_COMMANDER_ID, name: "Calibration Commander" };

interface SeedCard {
  name: string;
  type: string;
  roles: string[];
  qty?: number;
}

/** Seed every card in a list with its type_line + role tags. */
async function seedCards(cards: SeedCard[]): Promise<void> {
  // De-duplicate seeds — calibration decks share many overlapping role
  // names (Ramp1 appears in B, C, and D). Without dedup the second
  // INSERT into magic_cards would PK-collide.
  const seen = new Set<string>();
  const stmts: D1PreparedStatement[] = [];
  for (const c of cards) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default)
           VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(`${c.name}-id`, c.name, c.name, c.type, "TST", 1),
    );
    for (const role of c.roles) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code)
             VALUES (?, ?, ?, ?)`,
        ).bind(`${c.name}-id`, c.name, role, "TST"),
      );
    }
  }
  if (stmts.length > 0) await env.DB.batch(stmts);
}

async function seedGameChangers(names: string[]): Promise<void> {
  const stmts = names.map((n) =>
    env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`).bind(n),
  );
  if (stmts.length > 0) await env.DB.batch(stmts);
}

async function seedCombo(comboCards: string[]): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO magic_edh_combos
       (commander_id, combo_id, card_names, card_ids, colors, results, deck_count, percentage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      TEST_COMMANDER_ID,
      `combo-${comboCards.join("-")}`,
      JSON.stringify(comboCards),
      "[]",
      "WUBRG",
      '["win the game"]',
      100,
      1,
    )
    .run();
}

/** Reference deck A — bad pile: 99 vanilla creatures, no roles, no lands. */
function deckA(): { cards: SeedCard[]; deck: { card_name: string }[] } {
  const cards: SeedCard[] = Array.from({ length: 99 }, (_, index) => ({
    name: `Vanilla${String(index)}`,
    type: "Creature — Goblin",
    roles: [],
  }));
  return { cards, deck: cards.map((c) => ({ card_name: c.name })) };
}

/** Build a precon-shape deck: 36 lands + 10 ramp + 9 draw + 9 removal + 7 win-cons = 71 cards. */
function preconShapeCards(): SeedCard[] {
  return [
    { name: "PreconForest", type: "Basic Land — Forest", roles: [], qty: 36 },
    ...Array.from({ length: 10 }, (_, index) => ({
      name: `Ramp${String(index)}`,
      type: "Sorcery",
      roles: ["ramp"],
    })),
    ...Array.from({ length: 9 }, (_, index) => ({
      name: `Draw${String(index)}`,
      type: "Sorcery",
      roles: ["card_draw"],
    })),
    ...Array.from({ length: 9 }, (_, index) => ({
      name: `Removal${String(index)}`,
      type: "Instant",
      roles: ["removal"],
    })),
    ...Array.from({ length: 7 }, (_, index) => ({
      name: `Wincon${String(index)}`,
      type: "Creature — Demon",
      roles: ["win_condition"],
    })),
  ];
}

function deckBuilderFromCards(cards: SeedCard[]): { card_name: string; quantity?: number }[] {
  return cards.map((c) => ({ card_name: c.name, quantity: c.qty ?? 1 }));
}

describe("deck-quality calibration (M2.3 hard gate)", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  it("ordering: bad pile < precon < precon+GCs < cEDH-shape", async () => {
    // Deck A — bad pile
    const a = deckA();

    // Deck B — precon shape (no GCs, no combos, no MLD)
    const bCards = preconShapeCards();
    const bDeck = deckBuilderFromCards(bCards);

    // Deck C — precon shell + 2 Game Changers
    const cExtraCards: SeedCard[] = [
      { name: "Cyclonic Rift", type: "Instant", roles: ["removal", "boardwipe"] },
      { name: "Smothering Tithe", type: "Enchantment", roles: ["ramp"] },
    ];
    const cCards = [...bCards, ...cExtraCards];
    const cDeck = deckBuilderFromCards(cCards);

    // Deck D — cEDH-shape: precon shell + 5 GCs + Mana Crypt + combo + Armageddon
    const dExtraCards: SeedCard[] = [
      { name: "Mana Crypt", type: "Artifact", roles: ["ramp"] },
      { name: "Demonic Tutor", type: "Sorcery", roles: ["tutor"] },
      { name: "Cyclonic Rift", type: "Instant", roles: ["removal", "boardwipe"] },
      { name: "Smothering Tithe", type: "Enchantment", roles: ["ramp"] },
      { name: "Thassa's Oracle", type: "Creature — Merfolk", roles: ["win_condition"] },
      { name: "Demonic Consultation", type: "Instant", roles: ["tutor"] },
      { name: "Armageddon", type: "Sorcery", roles: ["land_destruction"] },
      { name: "Time Warp", type: "Sorcery", roles: ["extra_turn"] },
      { name: "Temporal Manipulation", type: "Sorcery", roles: ["extra_turn"] },
    ];
    const dCards = [...bCards, ...dExtraCards];
    const dDeck = deckBuilderFromCards(dCards);

    // Seed everything once, dedup'd
    await seedCards([...a.cards, ...dCards]);
    await seedGameChangers([
      "Cyclonic Rift",
      "Smothering Tithe",
      "Mana Crypt",
      "Demonic Tutor",
      "Thassa's Oracle",
    ]);
    await seedCombo(["Thassa's Oracle", "Demonic Consultation"]);

    const [scoreA, scoreB, scoreC, scoreD] = await Promise.all([
      assessQuality(env as unknown as Env, a.deck, COMMANDER),
      assessQuality(env as unknown as Env, bDeck, COMMANDER),
      assessQuality(env as unknown as Env, cDeck, COMMANDER),
      assessQuality(env as unknown as Env, dDeck, COMMANDER),
    ]);

    // Ordering — strict.
    expect(scoreA.score).toBeLessThan(scoreB.score);
    expect(scoreB.score).toBeLessThan(scoreC.score);
    expect(scoreC.score).toBeLessThanOrEqual(scoreD.score);

    // Spread — score must discriminate (≥30 between worst and best).
    expect(scoreD.score - scoreA.score).toBeGreaterThanOrEqual(30);
  });

  it("invariant — Game Changer impact: B vs B+GC raises bracket-consistency by ≥10", async () => {
    const bCards = preconShapeCards();
    const bDeck = deckBuilderFromCards(bCards);
    const bPlusGCDeck = [...bDeck, { card_name: "Cyclonic Rift" }];
    const cyclonicRift: SeedCard = {
      name: "Cyclonic Rift",
      type: "Instant",
      roles: ["removal", "boardwipe"],
    };
    await seedCards([...bCards, cyclonicRift]);
    await seedGameChangers(["Cyclonic Rift"]);

    const [scoreB, scoreBGC] = await Promise.all([
      assessQuality(env as unknown as Env, bDeck, COMMANDER),
      assessQuality(env as unknown as Env, bPlusGCDeck, COMMANDER),
    ]);
    expect(scoreBGC.bracket.tier).toBeGreaterThan(scoreB.bracket.tier);
    expect(
      scoreBGC.vectors.bracket_consistency - scoreB.vectors.bracket_consistency,
    ).toBeGreaterThanOrEqual(10);
  });

  it("invariant — ramp impact: removing all ramp drops composition vector by ≥15", async () => {
    const bCards = preconShapeCards();
    const bDeck = deckBuilderFromCards(bCards);
    const noRamp = bDeck.filter((c) => !c.card_name.startsWith("Ramp"));
    await seedCards(bCards);

    const [scoreB, scoreNoRamp] = await Promise.all([
      assessQuality(env as unknown as Env, bDeck, COMMANDER),
      assessQuality(env as unknown as Env, noRamp, COMMANDER),
    ]);
    expect(scoreB.vectors.composition - scoreNoRamp.vectors.composition).toBeGreaterThanOrEqual(15);
  });

  it("invariant — basics-vs-shocks neutrality: same shape, scores within ≤3", async () => {
    // Replace 4 basic Forest with 4 generic non-basic lands. Both are typed
    // "Land", neither is role-tagged, so structural score should be unchanged.
    const bCards = preconShapeCards();
    const bDeck = deckBuilderFromCards(bCards);
    const shockSwap: SeedCard[] = [
      { name: "Shock1", type: "Land", roles: [] },
      { name: "Shock2", type: "Land", roles: [] },
      { name: "Shock3", type: "Land", roles: [] },
      { name: "Shock4", type: "Land", roles: [] },
    ];
    await seedCards([...bCards, ...shockSwap]);

    // PreconForest qty=36 → reduce to qty=32 + 4 shocks
    const swappedDeck = bDeck.map((c) =>
      c.card_name === "PreconForest" ? { ...c, quantity: 32 } : c,
    );
    swappedDeck.push(...shockSwap.map((s) => ({ card_name: s.name, quantity: 1 })));

    const [original, swapped] = await Promise.all([
      assessQuality(env as unknown as Env, bDeck, COMMANDER),
      assessQuality(env as unknown as Env, swappedDeck, COMMANDER),
    ]);
    expect(Math.abs(original.score - swapped.score)).toBeLessThanOrEqual(3);
  });

  it("invariant — determinism: identical deck → identical score and vectors", async () => {
    const bCards = preconShapeCards();
    const bDeck = deckBuilderFromCards(bCards);
    await seedCards(bCards);

    const r1 = await assessQuality(env as unknown as Env, bDeck, COMMANDER);
    const r2 = await assessQuality(env as unknown as Env, bDeck, COMMANDER);
    expect(r1.score).toBe(r2.score);
    expect(r1.vectors).toEqual(r2.vectors);
    expect(r1.bracket.tier).toBe(r2.bracket.tier);
  });
});
