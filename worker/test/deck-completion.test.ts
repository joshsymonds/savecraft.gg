import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { completeDeck } from "../../plugins/magic/reference/deck-completion";
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

describe("completeDeck", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCommander();
  });

  it("pads a small shell to 99 cards", async () => {
    // Start with a tiny shell (10 ramp cards). Completion should add basics
    // + recommendations to reach 99.
    const shellCards = Array.from({ length: 10 }, (_, index) => ({
      name: `Ramp${String(index)}`,
      type: "Sorcery",
      roles: ["ramp"],
      cmc: 3,
      mana_cost: "{2}{G}",
    }));
    await seedCards(shellCards);
    const shell = shellCards.map((c) => ({ card_name: c.name }));

    const result = await completeDeck(env as unknown as Env, shell, COMMANDER);
    const total = result.filled.reduce((sum, entry) => sum + (entry.quantity ?? 1), 0);
    expect(total).toBe(99);
    expect(result.added_basics.length).toBeGreaterThan(0); // had to pad with basics
  });

  it("fills role gaps from recommendations before generic top-up", async () => {
    // Shell has 0 ramp (composition will say ramp=low). Seed 5 ramp
    // recommendations with high inclusion. Completion should add at least
    // some of them BEFORE pulling unrelated cards.
    const shellCards = Array.from({ length: 30 }, (_, index) => ({
      name: `Filler${String(index)}`,
      type: "Creature — Beast",
      roles: ["win_condition"],
      cmc: 4,
      mana_cost: "{3}{G}",
    }));
    const rampCards = Array.from({ length: 5 }, (_, index) => ({
      name: `RampRec${String(index)}`,
      type: "Sorcery",
      roles: ["ramp"],
      cmc: 3,
      mana_cost: "{2}{G}",
    }));
    await seedCards([...shellCards, ...rampCards]);
    await seedRecommendations(
      rampCards.map((c, index) => ({
        card_name: c.name,
        category: "manaartifacts",
        inclusion: 1000 - index, // descending inclusion
      })),
    );

    const shell = shellCards.map((c) => ({ card_name: c.name }));
    const result = await completeDeck(env as unknown as Env, shell, COMMANDER);
    const rampAdded = result.added_from_recommendations.filter(
      (a) => a.reason === "fill_role_gap" && a.role === "ramp",
    );
    expect(rampAdded.length).toBeGreaterThan(0);
    // All 5 ramp recommendations should be added since ramp is at 0.
    const addedNames = new Set(result.added_from_recommendations.map((a) => a.card_name));
    for (const c of rampCards) {
      expect(addedNames.has(c.name)).toBe(true);
    }
  });

  it("respects max_price ceiling — skips expensive recommendations", async () => {
    // Shell of 30 cards; recommendation of an expensive card should NOT be
    // added when budget is tight.
    const shellCards = Array.from({ length: 30 }, (_, index) => ({
      name: `Filler${String(index)}`,
      type: "Creature — Beast",
      roles: ["win_condition"],
      cmc: 4,
      mana_cost: "{3}{G}",
    }));
    const expensiveRec: SeedCard = {
      name: "ExpensiveRamp",
      type: "Artifact",
      roles: ["ramp"],
      cmc: 1,
      mana_cost: "{1}",
    };
    await seedCards([...shellCards, expensiveRec]);
    await env.DB.prepare(
      `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
    )
      .bind("ExpensiveRamp", 500)
      .run();
    await seedRecommendations([
      { card_name: "ExpensiveRamp", category: "manaartifacts", inclusion: 5000 },
    ]);

    const shell = shellCards.map((c) => ({ card_name: c.name }));
    const result = await completeDeck(env as unknown as Env, shell, COMMANDER, {
      maxPrice: 50,
    });
    const addedNames = new Set(result.added_from_recommendations.map((a) => a.card_name));
    expect(addedNames.has("ExpensiveRamp")).toBe(false);
  });

  it("respects excludes filter — never adds named card", async () => {
    const rampCards = Array.from({ length: 3 }, (_, index) => ({
      name: `Ramp${String(index)}`,
      type: "Sorcery",
      roles: ["ramp"],
      cmc: 3,
    }));
    await seedCards(rampCards);
    await seedRecommendations(
      rampCards.map((c) => ({ card_name: c.name, category: "manaartifacts", inclusion: 1000 })),
    );

    const result = await completeDeck(env as unknown as Env, [], COMMANDER, {
      excludes: ["Ramp1"],
    });
    const addedNames = new Set(result.added_from_recommendations.map((a) => a.card_name));
    expect(addedNames.has("Ramp1")).toBe(false);
    // Other ramps still added.
    expect(addedNames.has("Ramp0") || addedNames.has("Ramp2")).toBe(true);
  });

  it("respects excludeGameChangers — never adds GC card", async () => {
    const rampCards = [
      { name: "Sol Ring", type: "Artifact", roles: ["ramp"], cmc: 1 },
      { name: "Mana Vault", type: "Artifact", roles: ["ramp"], cmc: 1 },
    ];
    await seedCards(rampCards);
    await env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`)
      .bind("Mana Vault")
      .run();
    await seedRecommendations(
      rampCards.map((c) => ({ card_name: c.name, category: "manaartifacts", inclusion: 1000 })),
    );

    const result = await completeDeck(env as unknown as Env, [], COMMANDER, {
      excludeGameChangers: true,
    });
    const addedNames = new Set(result.added_from_recommendations.map((a) => a.card_name));
    expect(addedNames.has("Mana Vault")).toBe(false);
    expect(addedNames.has("Sol Ring")).toBe(true);
  });

  it("pads with basics in commander's color identity when no more recommendations", async () => {
    // Shell of 90 cards, no recommendations available. Should pad 9 basics
    // matching Atraxa's WUBG identity.
    const shellCards = Array.from({ length: 90 }, (_, index) => ({
      name: `Filler${String(index)}`,
      type: "Creature — Beast",
      roles: [],
      cmc: 3,
    }));
    await seedCards(shellCards);
    const shell = shellCards.map((c) => ({ card_name: c.name }));

    const result = await completeDeck(env as unknown as Env, shell, COMMANDER);
    const total = result.filled.reduce((sum, entry) => sum + (entry.quantity ?? 1), 0);
    expect(total).toBe(99);
    expect(result.added_basics.length).toBeGreaterThan(0);
    const basicNames = new Set(result.added_basics.map((b) => b.name));
    // At least one of Atraxa's 4 basic colors should appear.
    const validBasics = ["Forest", "Island", "Swamp", "Plains"];
    const hasMatch = validBasics.some((b) => basicNames.has(b));
    expect(hasMatch).toBe(true);
  });

  it("never returns more than 99 cards", async () => {
    // Shell already at 99 cards — completion should be a no-op.
    const shellCards = Array.from({ length: 99 }, (_, index) => ({
      name: `Filler${String(index)}`,
      type: "Creature — Beast",
      roles: ["win_condition"],
      cmc: 3,
    }));
    await seedCards(shellCards);
    const shell = shellCards.map((c) => ({ card_name: c.name }));

    const result = await completeDeck(env as unknown as Env, shell, COMMANDER);
    const total = result.filled.reduce((sum, entry) => sum + (entry.quantity ?? 1), 0);
    expect(total).toBe(99);
    expect(result.added_from_recommendations).toEqual([]);
    expect(result.added_basics).toEqual([]);
  });

  it("warns when target unachievable (no candidates available)", async () => {
    // Shell is very small AND the commander has no recommendations seeded.
    // We can fall back to basics, but a mono-colorless commander can't pad
    // sensibly. Use atraxa here so basics work — instead test the warnings
    // surface when budget+excludes leave NO valid candidate.
    const shellCards = Array.from({ length: 5 }, (_, index) => ({
      name: `Tiny${String(index)}`,
      type: "Creature — Goblin",
      roles: [],
      cmc: 1,
    }));
    await seedCards(shellCards);
    const shell = shellCards.map((c) => ({ card_name: c.name }));

    const result = await completeDeck(env as unknown as Env, shell, COMMANDER);
    // We should still hit 99 via basics — but warnings might surface that
    // we couldn't fill role gaps.
    const total = result.filled.reduce((sum, entry) => sum + (entry.quantity ?? 1), 0);
    expect(total).toBe(99);
    // No role-gap recommendations were available, so we should see warning
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("M6.2: role-fill stops at target upper bound, not when budget/total exhausts", async () => {
    // Seed 30 ramp recommendations (more than the community benchmark
    // upper bound of 12). Empty shell. Without the fix, completion adds
    // all 30 ramp cards. With the fix, it stops at 12.
    const rampCards = Array.from({ length: 30 }, (_, index) => ({
      name: `RampOverflow${String(index)}`,
      type: "Sorcery",
      roles: ["ramp"],
      cmc: 3,
      mana_cost: "{2}{G}",
    }));
    await seedCards(rampCards);
    await seedRecommendations(
      rampCards.map((c, index) => ({
        card_name: c.name,
        category: "manaartifacts",
        inclusion: 10_000 - index,
      })),
    );

    const result = await completeDeck(env as unknown as Env, [], COMMANDER);

    // Community benchmark upper bound for ramp is 12 (target [10, 12]).
    const rampAdded = result.added_from_recommendations.filter(
      (a) => a.reason === "fill_role_gap" && a.role === "ramp",
    );
    expect(rampAdded.length).toBeLessThanOrEqual(12);
    expect(rampAdded.length).toBeGreaterThanOrEqual(10);
  });
});
