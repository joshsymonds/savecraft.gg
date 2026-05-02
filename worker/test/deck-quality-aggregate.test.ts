import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { assessQuality } from "../../plugins/magic/reference/deck-quality";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const TEST_COMMANDER_ID = "test-commander-id";
const COMMANDER = { scryfall_id: TEST_COMMANDER_ID, name: "Test Commander" };

describe("assessQuality (M2.3 aggregate)", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  /** Seed a card with type_line + roles in one call. */
  async function seedCard(name: string, typeLine: string, roles: string[]): Promise<void> {
    const stmts = [
      env.DB.prepare(
        `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(`${name}-id`, name, name, typeLine, "TST", 1),
      ...roles.map((role) =>
        env.DB.prepare(
          `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code)
           VALUES (?, ?, ?, ?)`,
        ).bind(`${name}-id`, name, role, "TST"),
      ),
    ];
    await env.DB.batch(stmts);
  }

  it("returns a fully-populated QualityReport", async () => {
    const result = await assessQuality(env as unknown as Env, [], COMMANDER);
    expect(result.bracket).toBeDefined();
    expect(result.composition).toBeDefined();
    expect(result.vectors).toBeDefined();
    expect(result.vectors.mana_base).toBeGreaterThanOrEqual(0);
    expect(result.vectors.mana_base).toBeLessThanOrEqual(100);
    expect(result.vectors.composition).toBeGreaterThanOrEqual(0);
    expect(result.vectors.composition).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.weights).toBeDefined();
  });

  it("composition vector is near-zero for an empty deck (only tutors auto-pass)", async () => {
    // Tutor benchmark is [0, 4] — 0 tutors is "ok" (a precon has no tutors).
    // Every other role is "low" on empty deck. So 1/7 ok ≈ 14.
    const result = await assessQuality(env as unknown as Env, [], COMMANDER);
    expect(result.vectors.composition).toBeLessThanOrEqual(20);
  });

  it("composition vector hits 100 when every role is 'ok'", async () => {
    // Seed enough role-tagged cards to land every role in the 'ok' band per
    // community benchmarks: lands [36-38], ramp [10-12], draw [8-10],
    // removal [8-10], win [7-10], boardwipes [1-3], tutors [0-4].
    const cards: { name: string; type: string; roles: string[]; qty?: number }[] = [
      // 36 basic lands (counts via type_line)
      { name: "Forest", type: "Basic Land — Forest", roles: [], qty: 36 },
      // 11 ramp
      ...Array.from({ length: 11 }, (_, index) => ({
        name: `Ramp${String(index)}`,
        type: "Sorcery",
        roles: ["ramp"],
      })),
      // 9 draw
      ...Array.from({ length: 9 }, (_, index) => ({
        name: `Draw${String(index)}`,
        type: "Sorcery",
        roles: ["card_draw"],
      })),
      // 7 removal (boardwipes below also tag 'removal' → 7 + 2 = 9 total, in band [8,10])
      ...Array.from({ length: 7 }, (_, index) => ({
        name: `Removal${String(index)}`,
        type: "Instant",
        roles: ["removal"],
      })),
      // 8 win-cons
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `Wincon${String(index)}`,
        type: "Creature — Eldrazi",
        roles: ["win_condition"],
      })),
      // 2 boardwipes
      ...Array.from({ length: 2 }, (_, index) => ({
        name: `Wipe${String(index)}`,
        type: "Sorcery",
        roles: ["removal", "boardwipe"],
      })),
      // 2 tutors
      ...Array.from({ length: 2 }, (_, index) => ({
        name: `Tutor${String(index)}`,
        type: "Sorcery",
        roles: ["tutor"],
      })),
    ];
    for (const c of cards) {
      await seedCard(c.name, c.type, c.roles);
    }
    const deck = cards.map((c) => ({ card_name: c.name, quantity: c.qty }));
    const result = await assessQuality(env as unknown as Env, deck, COMMANDER);
    expect(result.composition.lands.status).toBe("ok");
    expect(result.composition.ramp.status).toBe("ok");
    expect(result.composition.card_draw.status).toBe("ok");
    expect(result.composition.removal.status).toBe("ok"); // 7 removal + 2 wipes (dual-tagged) = 9 in [8,10]
    // 7/7 buckets ok → composition vector = 100.
    expect(result.vectors.composition).toBe(100);
  });

  it("score is deterministic across calls", async () => {
    await seedCard("Sol Ring", "Artifact", ["ramp"]);
    const a = await assessQuality(env as unknown as Env, [{ card_name: "Sol Ring" }], COMMANDER);
    const b = await assessQuality(env as unknown as Env, [{ card_name: "Sol Ring" }], COMMANDER);
    expect(a.score).toBe(b.score);
    expect(a.vectors).toEqual(b.vectors);
  });

  it("aggregate score follows the documented weights", async () => {
    // Result.score = round(sum of vector*weight). Verify by reconstructing.
    const result = await assessQuality(env as unknown as Env, [], COMMANDER);
    const w = result.weights;
    const expected = Math.round(
      result.vectors.mana_base * w.mana_base +
        result.vectors.curve * w.curve +
        result.vectors.composition * w.composition +
        result.vectors.bracket_consistency * w.bracket_consistency +
        result.vectors.edhrec_overlap * w.edhrec_overlap,
    );
    expect(result.score).toBe(expected);
    // Weights sum to 1.0 (allow tiny rounding tolerance).
    const total = w.mana_base + w.curve + w.composition + w.bracket_consistency + w.edhrec_overlap;
    expect(total).toBeCloseTo(1, 3);
  });
});
