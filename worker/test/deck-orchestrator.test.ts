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
