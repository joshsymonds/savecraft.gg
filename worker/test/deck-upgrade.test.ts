import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { upgradeDeck } from "../../plugins/magic/reference/deck-completion";
import type { DeckEntry } from "../../plugins/magic/reference/deck-quality";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const ATRAXA_ID = "atraxa-id";
const COMMANDER = {
  scryfall_id: ATRAXA_ID,
  name: "Atraxa, Praetors' Voice",
};

interface RecSeed {
  name: string;
  synergy: number;
  inclusion?: number;
  price: number;
  roles: string[];
  type?: string;
}

async function seedCommander(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank)
       VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(ATRAXA_ID, COMMANDER.name, "atraxa-praetors-voice", '["W","U","B","G"]', 40_000, 3)
    .run();
}

async function seedRecs(recs: RecSeed[]): Promise<void> {
  if (recs.length === 0) return;
  const stmts = recs.flatMap((r) => {
    const ops = [
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default)
           VALUES (?, ?, ?, ?, ?, 1)`,
      ).bind(`${r.name}-id`, r.name, r.name, r.type ?? "Sorcery", "TST"),
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion)
           VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, r.name, "topcards", r.synergy, r.inclusion ?? 1000),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind(r.name, r.price),
    ];
    for (const role of r.roles) {
      ops.push(
        env.DB.prepare(
          `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
        ).bind(`${r.name}-id`, r.name, role, "TST"),
      );
    }
    return ops;
  });
  await env.DB.batch(stmts);
}

/**
 * Build a 100-card baseline: commander + 99 Plains. Spent = 0.
 */
function basicsBaseline(): DeckEntry[] {
  return [
    { card_name: COMMANDER.name, quantity: 1 },
    { card_name: "Plains", quantity: 99 },
  ];
}

const BASE_OPTIONS = {
  budget: 100,
  spent: 0,
  candidatePoolSize: 10,
  epsilon: 0.5,
  maxIterations: 50,
};

describe("upgradeDeck", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCommander();
  });

  it("returns deck unchanged when no candidates are available", async () => {
    const baseline = basicsBaseline();
    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, BASE_OPTIONS);

    expect(result.steps).toEqual([]);
    expect(result.deck).toEqual(baseline);
  });

  it("applies at least one swap when high-synergy candidates are available", async () => {
    await seedRecs([
      { name: "BigRamp", synergy: 5, price: 1, roles: ["ramp"] },
      { name: "BigDraw", synergy: 4, price: 1, roles: ["card_draw"] },
    ]);
    const baseline = basicsBaseline();

    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, BASE_OPTIONS);
    expect(result.steps.length).toBeGreaterThan(0);
    const introducedNames = new Set(result.steps.flatMap((step) => step.in_));
    expect(introducedNames.has("BigRamp") || introducedNames.has("BigDraw")).toBe(true);
  });

  it("stops by quality plateau even when budget remains", async () => {
    // One mediocre rec, large budget. Algorithm makes at most one swap then
    // plateaus (or makes none if Δ ≤ ε).
    await seedRecs([{ name: "MehCard", synergy: 0.01, price: 0.5, roles: [] }]);
    const baseline = basicsBaseline();

    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, {
      ...BASE_OPTIONS,
      budget: 1000,
    });
    expect(result.totalCost).toBeLessThan(1000); // didn't burn budget
    expect(result.steps.length).toBeLessThan(50);
  });

  it("never exceeds budget ceiling", async () => {
    // Two recs of $5 each, budget $3 — neither fits.
    await seedRecs([
      { name: "ExpensiveA", synergy: 5, price: 5, roles: ["ramp"] },
      { name: "ExpensiveB", synergy: 5, price: 5, roles: ["ramp"] },
    ]);
    const baseline = basicsBaseline();

    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, {
      ...BASE_OPTIONS,
      budget: 3,
    });
    expect(result.totalCost).toBeLessThanOrEqual(3);
    const introducedNames = new Set(result.steps.flatMap((step) => step.in_));
    expect(introducedNames.has("ExpensiveA")).toBe(false);
    expect(introducedNames.has("ExpensiveB")).toBe(false);
  });

  it("respects maxIterations cap", async () => {
    // Many candidates → many possible swaps. Cap at 2 iterations.
    const recs: RecSeed[] = Array.from({ length: 20 }, (_, index) => ({
      name: `Rec${String(index)}`,
      synergy: 5 - index * 0.01,
      price: 0.5,
      roles: ["ramp"],
    }));
    await seedRecs(recs);
    const baseline = basicsBaseline();

    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, {
      ...BASE_OPTIONS,
      maxIterations: 2,
    });
    expect(result.steps.length).toBeLessThanOrEqual(2);
  });

  it("is deterministic — two runs produce identical step sequences", async () => {
    await seedRecs([
      { name: "RecA", synergy: 5, price: 1, roles: ["ramp"] },
      { name: "RecB", synergy: 4, price: 1, roles: ["card_draw"] },
      { name: "RecC", synergy: 3, price: 1, roles: ["removal"] },
    ]);
    const baseline = basicsBaseline();

    const r1 = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, BASE_OPTIONS);
    const r2 = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, BASE_OPTIONS);

    const norm = (steps: typeof r1.steps): string[] =>
      steps.map(
        (s) => `${s.operator}:[${s.out.join(",")}]→[${s.in_.join(",")}]:Δ${s.delta.toFixed(4)}`,
      );
    expect(norm(r1.steps)).toEqual(norm(r2.steps));
  });

  it("respects excludes filter — excluded card never appears in steps", async () => {
    await seedRecs([
      { name: "Excluded", synergy: 5, price: 1, roles: ["ramp"] },
      { name: "Allowed", synergy: 4, price: 1, roles: ["ramp"] },
    ]);
    const baseline = basicsBaseline();

    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, {
      ...BASE_OPTIONS,
      excludes: ["Excluded"],
    });
    const introducedNames = new Set(result.steps.flatMap((step) => step.in_));
    expect(introducedNames.has("Excluded")).toBe(false);
  });

  it("respects excludeGameChangers — GC card never enters via upgrade", async () => {
    await seedRecs([
      { name: "RegularRamp", synergy: 4, price: 1, roles: ["ramp"] },
      { name: "GameChanger", synergy: 5, price: 1, roles: ["ramp"] },
    ]);
    await env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`)
      .bind("GameChanger")
      .run();
    const baseline = basicsBaseline();

    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, {
      ...BASE_OPTIONS,
      excludeGameChangers: true,
    });
    const introducedNames = new Set(result.steps.flatMap((step) => step.in_));
    expect(introducedNames.has("GameChanger")).toBe(false);
  });

  it("fires 1-for-1 swap when one premium card improves the deck", async () => {
    await seedRecs([{ name: "Premium", synergy: 5, price: 5, roles: ["ramp"] }]);
    const baseline = basicsBaseline();

    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, BASE_OPTIONS);
    const oneForOne = result.steps.find((step) => step.operator === "1for1");
    expect(oneForOne).toBeDefined();
  });

  it("fires 2-for-1 swap when budget gates 1-for-1 but allows consolidation", async () => {
    // Baseline contains two cheap rampers + commander + 97 Plains.
    // Premium ramp costs $10. Budget is $9.5 (already at $1 spent for cheap
    // rampers). 1-for-1: swap one cheap ($0.5) → premium ($10) = $9.5 cost
    // change, exactly at budget. 2-for-1: swap both cheap → premium = $9.0
    // change, fits with $0.5 to spare. The synergy boost from a 5-synergy
    // premium dominates the role-coverage loss from going 2 ramp → 1 ramp.
    await seedRecs([
      { name: "Premium", synergy: 5, price: 10, roles: ["ramp"] },
      { name: "Cheap1", synergy: 0.1, price: 0.5, roles: ["ramp"] },
      { name: "Cheap2", synergy: 0.1, price: 0.5, roles: ["ramp"] },
    ]);
    const baseline: DeckEntry[] = [
      { card_name: COMMANDER.name, quantity: 1 },
      { card_name: "Cheap1", quantity: 1 },
      { card_name: "Cheap2", quantity: 1 },
      { card_name: "Plains", quantity: 97 },
    ];

    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, {
      ...BASE_OPTIONS,
      budget: 10,
      spent: 1, // already paid for Cheap1 + Cheap2
    });
    const twoForOne = result.steps.find((step) => step.operator === "2for1");
    expect(twoForOne).toBeDefined();
    expect(twoForOne?.in_).toEqual(["Premium"]);
    const sortAlpha = (a: string, b: string): number => a.localeCompare(b);
    expect(twoForOne?.out.toSorted(sortAlpha)).toEqual(["Cheap1", "Cheap2"].toSorted(sortAlpha));
  });

  it("fires 1-for-2 swap when two cheaper cards beat one premium baseline card", async () => {
    // Baseline contains one premium ramper + commander + 98 Plains.
    // Two cheap recs available. Splitting the premium for two cheap cards
    // covers more role count (1 → 2), and the cheap cards have positive
    // synergy. 1-for-2 fires when the role-count gain plus synergy diff
    // beats keeping the premium.
    await seedRecs([
      { name: "Cheap1", synergy: 4, price: 1, roles: ["ramp"] },
      { name: "Cheap2", synergy: 4, price: 1, roles: ["ramp"] },
    ]);
    // Seed Premium as a card so the role-bucketing finds same-role pairs.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default)
           VALUES (?, ?, ?, ?, ?, 1)`,
      ).bind("PremiumBase-id", "PremiumBase", "PremiumBase", "Sorcery", "TST"),
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("PremiumBase-id", "PremiumBase", "ramp", "TST"),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("PremiumBase", 10),
    ]);
    const baseline: DeckEntry[] = [
      { card_name: COMMANDER.name, quantity: 1 },
      { card_name: "PremiumBase", quantity: 1 },
      { card_name: "Plains", quantity: 98 },
    ];

    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, {
      ...BASE_OPTIONS,
      budget: 12,
      spent: 10, // already paid for PremiumBase
    });
    const oneForTwo = result.steps.find((step) => step.operator === "1for2");
    expect(oneForTwo).toBeDefined();
    expect(oneForTwo?.out).toEqual(["PremiumBase"]);
    const sortAlpha = (a: string, b: string): number => a.localeCompare(b);
    expect(oneForTwo?.in_.toSorted(sortAlpha)).toEqual(["Cheap1", "Cheap2"].toSorted(sortAlpha));
  });

  it("populates step metadata correctly (iteration, delta, cost_change, operator)", async () => {
    await seedRecs([{ name: "Premium", synergy: 5, price: 1, roles: ["ramp"] }]);
    const baseline = basicsBaseline();

    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, BASE_OPTIONS);
    expect(result.steps.length).toBeGreaterThan(0);
    const first = result.steps[0];
    expect(first).toBeDefined();
    expect(first?.iteration).toBe(1);
    expect(first?.delta).toBeGreaterThan(0.5);
    expect(typeof first?.cost_change).toBe("number");
    expect(["1for1", "2for1", "1for2"]).toContain(first?.operator);
  });
});

// ── Swap-out warnings ─────────────────────────────────────────────
//
// Per Epic Anti-pattern: "Swaps that remove flagged cards must surface a
// warning." When upgradeDeck swaps out a card that's part of an otherwise-
// intact combo line, OR a card tagged as win_condition, the loop emits a
// warning naming the casualty.

async function seedCombo(comboId: string, cardNames: string[]): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO magic_edh_combos (commander_id, combo_id, card_names) VALUES (?, ?, ?)`,
  )
    .bind(ATRAXA_ID, comboId, JSON.stringify(cardNames))
    .run();
}

async function seedRoleTag(cardName: string, role: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
  )
    .bind(`${cardName}-id`, cardName, role, "TST")
    .run();
}

describe("upgradeDeck swap-out warnings", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCommander();
  });

  it("warns when an upgrade swap removes a card on an otherwise-intact combo line", async () => {
    // The algorithm naturally protects combos against 1-for-1 swaps (combo
    // penalty -12.87 dominates synergy gains). To force a combo casualty,
    // construct a 1-for-2 setup: the synergy gain from a TWO-card swap-in
    // overwhelms the combo penalty.
    //
    // ComboCard1 has role=ramp + extreme negative synergy. Two high-synergy
    // ramp candidates exist. The 1-for-2 of ComboCard1 → Cand1 + Cand2 has
    // Δ ≈ 30 (synergy) − 13 (combo) = 17, beating Plains-based 1-for-1 swaps.
    await seedRecs([
      { name: "ComboCard1", synergy: -1_000_000, price: 0.5, roles: ["ramp"] },
      { name: "ComboCard2", synergy: 0, price: 0.5, roles: [] },
      { name: "Cand1", synergy: 1_000_000, price: 0.5, roles: ["ramp"] },
      { name: "Cand2", synergy: 1_000_000, price: 0.5, roles: ["ramp"] },
    ]);
    await seedCombo("test-combo", ["ComboCard1", "ComboCard2"]);

    const baseline: DeckEntry[] = [
      { card_name: COMMANDER.name, quantity: 1 },
      { card_name: "ComboCard1", quantity: 1 },
      { card_name: "ComboCard2", quantity: 1 },
      { card_name: "Plains", quantity: 97 },
    ];
    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, {
      ...BASE_OPTIONS,
      candidatePoolSize: 10,
      maxIterations: 1,
    });

    const swappedOutCombo = result.steps.some((s) => s.out.includes("ComboCard1"));
    expect(swappedOutCombo).toBe(true);
    const warning = result.warnings.find(
      (w) => w.includes("combo piece") && w.includes("ComboCard1"),
    );
    expect(warning).toBeDefined();
  });

  it("warns when an upgrade swap removes a win_condition-tagged card", async () => {
    // OldWinCon has negative synergy → the synergy delta from swapping it
    // out beats swapping a basic (basics have synergy=0).
    await seedRecs([
      { name: "OldWinCon", synergy: -5, price: 0.5, roles: [] },
      { name: "Replacement", synergy: 10, price: 0.5, roles: [] },
    ]);
    await seedRoleTag("OldWinCon", "win_condition");

    const baseline: DeckEntry[] = [
      { card_name: COMMANDER.name, quantity: 1 },
      { card_name: "OldWinCon", quantity: 1 },
      { card_name: "Plains", quantity: 98 },
    ];
    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, {
      ...BASE_OPTIONS,
      candidatePoolSize: 5,
      maxIterations: 1,
    });

    const swappedOutWinCon = result.steps.some((s) => s.out.includes("OldWinCon"));
    expect(swappedOutWinCon).toBe(true);
    const warning = result.warnings.find(
      (w) => w.toLowerCase().includes("win condition") && w.includes("OldWinCon"),
    );
    expect(warning).toBeDefined();
  });

  it("does NOT warn when a complete combo line stays intact through the upgrade", async () => {
    // Combo present + intact in baseline. The recommendation has a role tag
    // (ramp) so the upgrade prefers Plains→Replacement (role+1) over
    // ComboCard1→Replacement (role unchanged) — combo cards are not touched.
    await seedRecs([{ name: "BetterRamp", synergy: 10, price: 0.5, roles: ["ramp"] }]);
    await seedCombo("intact-combo", ["ComboCard1", "ComboCard2"]);

    const baseline: DeckEntry[] = [
      { card_name: COMMANDER.name, quantity: 1 },
      { card_name: "ComboCard1", quantity: 1 },
      { card_name: "ComboCard2", quantity: 1 },
      { card_name: "Plains", quantity: 97 },
    ];
    const result = await upgradeDeck(env as unknown as Env, baseline, COMMANDER, {
      ...BASE_OPTIONS,
      candidatePoolSize: 5,
      maxIterations: 5,
    });

    // Combo cards still present.
    const deckNames = new Set(result.deck.map((entry) => entry.card_name));
    expect(deckNames.has("ComboCard1")).toBe(true);
    expect(deckNames.has("ComboCard2")).toBe(true);
    // No combo casualty warning.
    const comboWarning = result.warnings.find((w) => w.toLowerCase().includes("combo piece"));
    expect(comboWarning).toBeUndefined();
  });
});
