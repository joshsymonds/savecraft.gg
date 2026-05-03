import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  buildAndUpgradeDeck,
  karstenValidateMana,
} from "../../plugins/magic/reference/deck-completion";
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

function totalCards(deck: DeckEntry[]): number {
  return deck.reduce((sum, entry) => sum + (entry.quantity ?? 1), 0);
}

describe("buildAndUpgradeDeck", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCommander();
  });

  it("builds from minimal shell when no precon supplied — 100 cards, baseline_source minimal_shell", async () => {
    await seedRecs([
      { name: "BigRamp", synergy: 5, price: 1, roles: ["ramp"] },
      { name: "BigDraw", synergy: 4, price: 1, roles: ["card_draw"] },
      { name: "BigRemoval", synergy: 3, price: 1, roles: ["removal"] },
    ]);

    const result = await buildAndUpgradeDeck(env as unknown as Env, COMMANDER, {
      budget: 50,
    });

    expect(totalCards(result.deck)).toBe(100);
    expect(result.totalCost).toBeLessThanOrEqual(50);
    expect(result.baseline_source).toBe("minimal_shell");
  });

  it("uses precon as baseline when ≥60 cards supplied", async () => {
    await seedRecs([{ name: "UpgradeRamp", synergy: 5, price: 1, roles: ["ramp"] }]);
    // Build a 65-card "precon" — commander + 64 fillers.
    const precon: DeckEntry[] = [
      { card_name: COMMANDER.name, quantity: 1 },
      ...Array.from({ length: 64 }, (_, index) => ({
        card_name: `PreconCard${String(index)}`,
        quantity: 1,
      })),
    ];

    const result = await buildAndUpgradeDeck(env as unknown as Env, COMMANDER, {
      budget: 50,
      precon,
    });

    expect(totalCards(result.deck)).toBe(100);
    expect(result.baseline_source).toBe("precon");
    // Most precon cards survive; only one upgrade candidate available so at
    // most one card is swapped out.
    const deckNames = new Set(result.deck.map((entry) => entry.card_name));
    let preconSurvivors = 0;
    for (let index = 0; index < 64; index++) {
      if (deckNames.has(`PreconCard${String(index)}`)) preconSurvivors += 1;
    }
    expect(preconSurvivors).toBeGreaterThanOrEqual(63);
  });

  it("falls back to minimal shell when precon has <60 cards", async () => {
    const precon: DeckEntry[] = [
      { card_name: COMMANDER.name, quantity: 1 },
      ...Array.from({ length: 30 }, (_, index) => ({
        card_name: `Tiny${String(index)}`,
        quantity: 1,
      })),
    ];

    const result = await buildAndUpgradeDeck(env as unknown as Env, COMMANDER, {
      budget: 50,
      precon,
    });

    expect(result.baseline_source).toBe("minimal_shell");
    expect(totalCards(result.deck)).toBe(100);
  });

  it("aggregates warnings from baseline, upgrade, and karsten phases", async () => {
    // Tiny budget triggers a baseline-warning (role floors not met).
    await seedRecs([{ name: "ExpensiveRamp", synergy: 5, price: 100, roles: ["ramp"] }]);

    const result = await buildAndUpgradeDeck(env as unknown as Env, COMMANDER, {
      budget: 5,
    });

    // Baseline phase: minimal-shell role-floor warnings surface for ramp,
    // card_draw, removal, and win_condition (no role-tagged recs fit the
    // $5 budget). Each warning includes "lower bound … not met".
    const baselineWarning = result.warnings.find((w) => w.includes("lower bound"));
    expect(baselineWarning).toBeDefined();
  });

  it("upgrade pool includes high-inclusion staples even when their synergy is negative", async () => {
    // Test the two-pool union behavior. With candidatePoolSize=1, a synergy-
    // only top-1 pool would surface ThemeCard (synergy +10) and miss
    // FormatStaple (synergy −5) forever. The union pulls top-1 from BOTH
    // axes, so FormatStaple enters via the inclusion side.
    //
    // 53 priceless non-role fillers crowd out ThemeCard/FormatStaple from
    // minimal-shell Phase 2 (which fills 63 nonbasic slots cheapest-first).
    // BaseRamps fill Phase 1's ramp floor; their negative synergy + near-
    // zero inclusion makes them the worst possible swap-out targets so
    // both upgrade swaps clear epsilon.
    await seedRecs([
      ...Array.from({ length: 10 }, (_, index) => ({
        name: `BaseRamp${String(index)}`,
        synergy: -15,
        inclusion: 1,
        price: 0.1,
        roles: ["ramp"],
      })),
      ...Array.from({ length: 60 }, (_, index) => ({
        name: `Filler${String(index)}`,
        synergy: 0,
        inclusion: 50,
        price: 0.1,
        roles: [],
      })),
      { name: "ThemeCard", synergy: 10, inclusion: 500, price: 5, roles: ["ramp"] },
      { name: "FormatStaple", synergy: -5, inclusion: 20_000, price: 5, roles: ["ramp"] },
    ]);

    const result = await buildAndUpgradeDeck(env as unknown as Env, COMMANDER, {
      budget: 50,
      candidatePoolSize: 1,
    });

    const deckNames = new Set(result.deck.map((entry) => entry.card_name));
    expect(deckNames.has("ThemeCard")).toBe(true);
    expect(deckNames.has("FormatStaple")).toBe(true);
  });

  it("ε default below 0.1 captures small-Δ inclusion-driven swaps", async () => {
    // 100 cheap ramp fillers (inclusion=10, $0.05) + 1 high-inclusion ramp
    // staple ($0.50, inclusion=200). All same role + synergy=0; the only
    // signal differentiating them is inclusion. The swap delta is
    // log(1+0.5) − log(1+0.025) ≈ 0.38 — below the old ε=0.5 (rejected)
    // but well above the new ε=0.01 (accepted).
    await seedRecs([
      ...Array.from({ length: 100 }, (_, index) => ({
        name: `RampFiller${String(index)}`,
        synergy: 0,
        inclusion: 10,
        price: 0.05,
        roles: ["ramp"],
      })),
      {
        name: "HighIncStaple",
        synergy: 0,
        inclusion: 200,
        price: 0.5,
        roles: ["ramp"],
      },
    ]);

    const result = await buildAndUpgradeDeck(env as unknown as Env, COMMANDER, {
      budget: 7,
      candidatePoolSize: 1,
    });

    const deckNames = new Set(result.deck.map((entry) => entry.card_name));
    expect(deckNames.has("HighIncStaple")).toBe(true);
  });

  it("preserves the configured land floor across 1-for-2 swaps", async () => {
    // Baseline: 100-card precon at the exact land floor (13 nonbasic +
    // 23 basics = 36 total). Many high-Δ ramp candidates exist as
    // upgrade targets — 1-for-2 swaps would fire and remove basics.
    // With landTarget present, the floor must hold.
    // Many high-Δ ramp candidates so 1-for-2 swaps have ample fuel.
    await seedRecs(
      Array.from({ length: 20 }, (_, index) => ({
        name: `UpgradeRamp${String(index)}`,
        synergy: 10,
        inclusion: 1000,
        price: 0.1,
        roles: ["ramp"],
      })),
    );
    // 23 basics + 13 nonbasic-land placeholders + 63 cheap spells +
    // commander = 100. The basic-land names are real ("Forest"); the
    // nonbasics use a "DualLand" prefix so the test can identify them.
    const precon: DeckEntry[] = [
      { card_name: COMMANDER.name, quantity: 1 },
      { card_name: "Forest", quantity: 23 },
      ...Array.from({ length: 13 }, (_, index) => ({
        card_name: `DualLand${String(index)}`,
        quantity: 1,
      })),
      ...Array.from({ length: 63 }, (_, index) => ({
        card_name: `Filler${String(index)}`,
        quantity: 1,
      })),
    ];

    const result = await buildAndUpgradeDeck(env as unknown as Env, COMMANDER, {
      budget: 100,
      precon,
      landTarget: { totalLandsTarget: 36, nonbasicLandCap: 13 },
    });

    // Count basic lands in the result. With the floor, basics stays >= 23.
    const basics = result.deck
      .filter((entry) => entry.card_name === "Forest")
      .reduce((sum, entry) => sum + (entry.quantity ?? 1), 0);
    expect(basics).toBeGreaterThanOrEqual(23);
  });

  it("populates baseline_cost separately from totalCost", async () => {
    await seedRecs([{ name: "BigRamp", synergy: 5, price: 1, roles: ["ramp"] }]);

    const result = await buildAndUpgradeDeck(env as unknown as Env, COMMANDER, {
      budget: 30,
    });

    expect(typeof result.baseline_cost).toBe("number");
    expect(result.baseline_cost).toBeLessThanOrEqual(result.totalCost);
    // totalCost includes baseline_cost plus any upgrade cost_changes.
    const upgradeDelta = result.steps.reduce((sum, s) => sum + s.cost_change, 0);
    expect(Math.abs(result.totalCost - (result.baseline_cost + upgradeDelta))).toBeLessThan(0.01);
  });
});

describe("karstenValidateMana", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCommander();
  });

  it("emits warnings when colored sources are below the 13-source threshold", async () => {
    // Deck has 4 colored pips of {W} but only 2 Plains as a source.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default, mana_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind("WhiteCard-id", "WhiteCard", "WhiteCard", "Sorcery", "TST", 1, "{W}{W}"),
    ]);
    const deck: DeckEntry[] = [
      { card_name: COMMANDER.name, quantity: 1 },
      { card_name: "WhiteCard", quantity: 2 },
      { card_name: "Plains", quantity: 2 },
      { card_name: "Forest", quantity: 95 }, // filler
    ];

    const result = await karstenValidateMana(env as unknown as Env, deck, COMMANDER);
    expect(result.warnings.some((w) => w.includes("{W}"))).toBe(true);
  });

  it("returns empty warnings when all colors are well-supplied", async () => {
    const deck: DeckEntry[] = [
      { card_name: COMMANDER.name, quantity: 1 },
      { card_name: "Plains", quantity: 99 }, // no spells → no required colors
    ];
    const result = await karstenValidateMana(env as unknown as Env, deck, COMMANDER);
    expect(result.warnings).toEqual([]);
  });
});
