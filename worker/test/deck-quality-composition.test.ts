import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { assessComposition } from "../../plugins/magic/reference/deck-quality";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const ATRAXA_ID = "atraxa-id";
const KRENKO_ID = "krenko-id";

describe("assessComposition", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  /**
   * Seed magic_cards with type_line so lands counting works. We use type_line
   * because magic_card_roles doesn't tag lands as a "role" — the 9 functional
   * roles cover spells, but lands are detected via type_line containing "Land".
   */
  async function seedCardTypes(cards: { name: string; type: string }[]): Promise<void> {
    const stmts = cards.map((c, index) =>
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(`${c.name}-id-${String(index)}`, c.name, c.name, c.type, "TST", 1),
    );
    if (stmts.length > 0) await env.DB.batch(stmts);
  }

  async function seedRoles(entries: { name: string; role: string }[]): Promise<void> {
    const stmts = entries.map((entry) =>
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind(`${entry.name}-rid`, entry.name, entry.role, "TST"),
    );
    if (stmts.length > 0) await env.DB.batch(stmts);
  }

  async function seedAtraxaCommander(): Promise<void> {
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

  async function seedAtraxaBudgetTier(): Promise<void> {
    // Tier average for Atraxa-budget: 36 lands (mix of basics + non-basics),
    // 10 ramp, 9 draw, 9 removal, 8 win-cons (representative tier shape).
    // We seed only role-distinctive entries; the assessment derives counts
    // by joining tier-average → role tags in the prod path.
    await env.DB.prepare(
      `INSERT INTO magic_edh_commander_tiers (commander_id, tier, avg_price, num_decks_avg, deck_size) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(ATRAXA_ID, "budget", 174, 4072, 84)
      .run();
    const tierRows = [
      // 10 ramp cards in the tier
      ...Array.from({ length: 10 }, (_, index) => `tier-ramp-${String(index)}`),
      // 9 draw cards
      ...Array.from({ length: 9 }, (_, index) => `tier-draw-${String(index)}`),
    ];
    const stmts = tierRows.map((name) =>
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", name, 1, "tier"),
    );
    await env.DB.batch(stmts);
    // Tag the tier cards so the deriver picks them up.
    const roleStmts = [
      ...Array.from({ length: 10 }, (_, index) =>
        env.DB.prepare(
          `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
        ).bind(`tier-ramp-${String(index)}-rid`, `tier-ramp-${String(index)}`, "ramp", "TST"),
      ),
      ...Array.from({ length: 9 }, (_, index) =>
        env.DB.prepare(
          `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
        ).bind(`tier-draw-${String(index)}-rid`, `tier-draw-${String(index)}`, "card_draw", "TST"),
      ),
    ];
    await env.DB.batch(roleStmts);
  }

  it("empty deck returns all roles 'low' with community benchmarks", async () => {
    const result = await assessComposition(env as unknown as Env, [], {
      scryfall_id: KRENKO_ID,
      name: "Krenko, Mob Boss",
    });
    expect(result.lands.count).toBe(0);
    expect(result.lands.status).toBe("low");
    expect(result.lands.target_source).toBe("community_benchmark");
    expect(result.ramp.status).toBe("low");
    expect(result.card_draw.status).toBe("low");
    expect(result.removal.status).toBe("low");
    expect(result.win_conditions.status).toBe("low");
  });

  it("deck with 11 ramp cards is 'ok' against community benchmark of 10-12", async () => {
    const ramps = Array.from({ length: 11 }, (_, index) => `Ramp ${String(index)}`);
    await seedRoles(ramps.map((name) => ({ name, role: "ramp" })));
    const result = await assessComposition(
      env as unknown as Env,
      ramps.map((card_name) => ({ card_name })),
      { scryfall_id: KRENKO_ID, name: "Krenko, Mob Boss" },
    );
    expect(result.ramp.count).toBe(11);
    expect(result.ramp.status).toBe("ok");
    expect(result.ramp.target_range).toEqual([10, 12]);
  });

  it("deck with 5 ramp cards is 'low' against community benchmark", async () => {
    const ramps = Array.from({ length: 5 }, (_, index) => `Ramp ${String(index)}`);
    await seedRoles(ramps.map((name) => ({ name, role: "ramp" })));
    const result = await assessComposition(
      env as unknown as Env,
      ramps.map((card_name) => ({ card_name })),
      { scryfall_id: KRENKO_ID, name: "Krenko, Mob Boss" },
    );
    expect(result.ramp.count).toBe(5);
    expect(result.ramp.status).toBe("low");
  });

  it("deck with 15 ramp cards is 'high' against community benchmark", async () => {
    const ramps = Array.from({ length: 15 }, (_, index) => `Ramp ${String(index)}`);
    await seedRoles(ramps.map((name) => ({ name, role: "ramp" })));
    const result = await assessComposition(
      env as unknown as Env,
      ramps.map((card_name) => ({ card_name })),
      { scryfall_id: KRENKO_ID, name: "Krenko, Mob Boss" },
    );
    expect(result.ramp.count).toBe(15);
    expect(result.ramp.status).toBe("high");
  });

  it("counts basic and non-basic lands together as 'lands'", async () => {
    await seedCardTypes([
      { name: "Forest", type: "Basic Land — Forest" },
      { name: "Island", type: "Basic Land — Island" },
      { name: "Plains", type: "Basic Land — Plains" },
      { name: "Swamp", type: "Basic Land — Swamp" },
      { name: "Command Tower", type: "Land" },
      { name: "Sol Ring", type: "Artifact" }, // not a land — must NOT be counted
    ]);
    const result = await assessComposition(
      env as unknown as Env,
      [
        { card_name: "Forest" },
        { card_name: "Island" },
        { card_name: "Plains" },
        { card_name: "Swamp" },
        { card_name: "Command Tower" },
        { card_name: "Sol Ring" },
      ],
      { scryfall_id: ATRAXA_ID, name: "Atraxa, Praetors' Voice" },
    );
    expect(result.lands.count).toBe(5);
    expect(result.lands.cards).toContain("Forest");
    expect(result.lands.cards).toContain("Command Tower");
    expect(result.lands.cards).not.toContain("Sol Ring");
  });

  it("multi-role card counts in EVERY role bucket it has", async () => {
    // Cultivate: tagged BOTH ramp AND tutor (verified in production: Phase 1
    // function:ramp + function:tutor both match it).
    await seedRoles([
      { name: "Cultivate", role: "ramp" },
      { name: "Cultivate", role: "tutor" },
    ]);
    const result = await assessComposition(env as unknown as Env, [{ card_name: "Cultivate" }], {
      scryfall_id: KRENKO_ID,
      name: "Krenko, Mob Boss",
    });
    expect(result.ramp.count).toBe(1);
    expect(result.ramp.cards).toEqual(["Cultivate"]);
    expect(result.tutors.count).toBe(1);
    expect(result.tutors.cards).toEqual(["Cultivate"]);
  });

  it("uses tier-derived target_range when tier average is provided", async () => {
    await seedAtraxaCommander();
    await seedAtraxaBudgetTier();
    // Atraxa-budget tier seeded: 10 ramp, 9 draw. With ±20% (or ±2 min)
    // tolerance, the ramp target is roughly [8, 12] and draw is [7, 11].
    const result = await assessComposition(
      env as unknown as Env,
      [],
      { scryfall_id: ATRAXA_ID, name: "Atraxa, Praetors' Voice" },
      "budget",
    );
    expect(result.ramp.target_source).toBe("tier_derived");
    // Target range should bracket the tier count (10 ramp ± tolerance).
    expect(result.ramp.target_range[0]).toBeLessThanOrEqual(10);
    expect(result.ramp.target_range[1]).toBeGreaterThanOrEqual(10);
    expect(result.card_draw.target_source).toBe("tier_derived");
  });

  it("falls back to community_benchmark when no tier average exists", async () => {
    // No magic_edh_commander_tiers row + no average_decks_by_tier rows.
    const result = await assessComposition(
      env as unknown as Env,
      [],
      { scryfall_id: KRENKO_ID, name: "Krenko, Mob Boss" },
      "budget",
    );
    expect(result.ramp.target_source).toBe("community_benchmark");
    expect(result.ramp.target_range).toEqual([10, 12]);
    expect(result.lands.target_range).toEqual([36, 38]);
    expect(result.card_draw.target_range).toEqual([8, 10]);
    expect(result.removal.target_range).toEqual([8, 10]);
    expect(result.win_conditions.target_range).toEqual([7, 10]);
  });

  it("matches case-insensitively on card names", async () => {
    await seedRoles([{ name: "Sol Ring", role: "ramp" }]);
    const result = await assessComposition(env as unknown as Env, [{ card_name: "sol ring" }], {
      scryfall_id: KRENKO_ID,
      name: "Krenko, Mob Boss",
    });
    expect(result.ramp.count).toBe(1);
  });

  it("returns boardwipe and tutor counts as bonus signals", async () => {
    await seedRoles([
      { name: "Wrath of God", role: "boardwipe" },
      { name: "Wrath of God", role: "removal" },
      { name: "Demonic Tutor", role: "tutor" },
    ]);
    const result = await assessComposition(
      env as unknown as Env,
      [{ card_name: "Wrath of God" }, { card_name: "Demonic Tutor" }],
      { scryfall_id: KRENKO_ID, name: "Krenko, Mob Boss" },
    );
    expect(result.boardwipes.count).toBe(1);
    expect(result.boardwipes.cards).toEqual(["Wrath of God"]);
    expect(result.tutors.count).toBe(1);
    expect(result.removal.count).toBe(1);
    expect(result.removal.cards).toEqual(["Wrath of God"]);
  });
});
