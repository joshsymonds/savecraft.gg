import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { deckbuildingModule } from "../../plugins/mtga/reference/deckbuilding";
import { registerNativeModule } from "../src/reference/registry";

import { cleanAll } from "./helpers";

// ── Seed data ────────────────────────────────────────────────

async function seedDeckbuildingData(): Promise<void> {
  await env.DB.batch([
    // Cards: a mix of creatures, spells, lands, and a fixing land
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, produced_mana, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      100,
      "o-1",
      "Vengeful Strangler",
      "Vengeful Strangler",
      "{1}{B}",
      2,
      "Creature — Human Rogue",
      '["B"]',
      "[]",
      1,
    ),
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, produced_mana, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      101,
      "o-2",
      "Doomsday Excruciator",
      "Doomsday Excruciator",
      "{4}{B}{B}",
      6,
      "Creature — Demon",
      '["B"]',
      "[]",
      1,
    ),
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, produced_mana, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      102,
      "o-3",
      "Go for the Throat",
      "Go for the Throat",
      "{1}{B}",
      2,
      "Instant",
      '["B"]',
      "[]",
      1,
    ),
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, produced_mana, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      103,
      "o-4",
      "Gloomlake Verge",
      "Gloomlake Verge",
      "{U}{B}",
      2,
      "Creature — Horror",
      '["U","B"]',
      "[]",
      1,
    ),
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, produced_mana, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      104,
      "o-5",
      "Evolving Wilds",
      "Evolving Wilds",
      "",
      0,
      "Land",
      "[]",
      '["W","U","B","R","G"]',
      1,
    ),
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, produced_mana, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(105, "o-6", "Island", "Island", "", 0, "Basic Land — Island", "[]", '["U"]', 1),
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, produced_mana, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(106, "o-7", "Swamp", "Swamp", "", 0, "Basic Land — Swamp", "[]", '["B"]', 1),

    // Draft ratings (DSK set)
    env.DB.prepare(
      `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("DSK", "Vengeful Strangler", 10_000, 12_000, 2000, 0.56, 0.58, 0.54, 0.5, 0.04, 5, 4),
    env.DB.prepare(
      `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("DSK", "Doomsday Excruciator", 5000, 8000, 3000, 0.62, 0.65, 0.6, 0.48, 0.12, 2, 1.5),
    env.DB.prepare(
      `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("DSK", "Go for the Throat", 8000, 10_000, 2000, 0.59, 0.61, 0.57, 0.5, 0.07, 3, 2),
    env.DB.prepare(
      `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("DSK", "Gloomlake Verge", 15_000, 20_000, 5000, 0.564, 0.62, 0.54, 0.48, 0.06, 8.5, 9.2),

    // Set stats
    env.DB.prepare(
      `INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "PremierDraft", 250_000, 4, 0.55),

    // Deck stats for UB and mono-B archetypes
    env.DB.prepare(
      `INSERT INTO mtga_draft_deck_stats (set_code, archetype, avg_lands, avg_creatures, avg_noncreatures, avg_fixing, splash_rate, splash_avg_sources, splash_winrate, nonsplash_winrate, total_decks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", 17.2, 14.5, 5.3, 1.1, 0.25, 2.1, 0.52, 0.55, 5000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_deck_stats (set_code, archetype, avg_lands, avg_creatures, avg_noncreatures, avg_fixing, splash_rate, splash_avg_sources, splash_winrate, nonsplash_winrate, total_decks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("DSK", "B", 17, 15, 5, 0.5, 0.15, 1.5, 0.51, 0.54, 3000),

    // Archetype curves for UB and mono-B
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", 1, 2.5, 5000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", 2, 5.5, 5000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", 3, 4, 5000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", 6, 1.5, 5000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "B", 1, 2.5, 3000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "B", 2, 5.5, 3000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "B", 3, 4, 3000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "B", 6, 1.5, 3000),

    // Role targets for UB and mono-B
    env.DB.prepare(
      `INSERT INTO mtga_draft_role_targets (set_code, archetype, role, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", "creature", 14.5, 5000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_role_targets (set_code, archetype, role, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", "removal", 3.5, 5000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_role_targets (set_code, archetype, role, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "B", "creature", 15, 3000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_role_targets (set_code, archetype, role, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "B", "removal", 3, 3000),

    // Card roles
    env.DB.prepare(
      `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
    ).bind("o-1", "Vengeful Strangler", "creature", "DSK"),
    env.DB.prepare(
      `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
    ).bind("o-2", "Doomsday Excruciator", "creature", "DSK"),
    env.DB.prepare(
      `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
    ).bind("o-3", "Go for the Throat", "removal", "DSK"),
    env.DB.prepare(
      `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
    ).bind("o-4", "Gloomlake Verge", "creature", "DSK"),

    // Synergies
    env.DB.prepare(
      `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "Vengeful Strangler", "Gloomlake Verge", 0.04, 500),
    env.DB.prepare(
      `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "Gloomlake Verge", "Vengeful Strangler", 0.04, 500),
    env.DB.prepare(
      `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "Go for the Throat", "Gloomlake Verge", 0.02, 400),
    env.DB.prepare(
      `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "Doomsday Excruciator", "Vengeful Strangler", -0.01, 200),
  ]);
}

// ── Tests ────────────────────────────────────────────────────

describe("deckbuilding native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("mtga", deckbuildingModule);
  });

  describe("health check mode", () => {
    it("returns structured health check with sections", async () => {
      await seedDeckbuildingData();

      const result = await deckbuildingModule.execute(
        {
          set: "DSK",
          deck: [
            { name: "Vengeful Strangler", count: 2 },
            { name: "Doomsday Excruciator", count: 1 },
            { name: "Go for the Throat", count: 1 },
            { name: "Gloomlake Verge", count: 2 },
            { name: "Evolving Wilds", count: 1 },
            { name: "Island", count: 8 },
            { name: "Swamp", count: 8 },
          ],
        },
        env,
      );

      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unexpected");
      const data = result.data as {
        mode: string;
        set: string;
        archetype: {
          primary: string;
          candidates: {
            archetype: string;
            viability: string;
            format_context: string;
          }[];
          confidence: number;
        };
        sections: {
          name: string;
          status: string;
          actual: number;
          expected: number;
          note: string;
        }[];
      };

      expect(data.mode).toBe("health_check");
      expect(data.set).toBe("DSK");
      // With 31 candidates, mono-B has highest weight for this heavily black deck
      expect(data.archetype.primary).toBe("B");
      expect(data.archetype.candidates.length).toBeGreaterThan(0);
      // Viability fields present
      const primary = data.archetype.candidates[0];
      expect(["strong", "moderate", "sparse", "fringe"]).toContain(
        primary?.viability,
      );
      expect(primary?.format_context).toContain("% of decks");
      expect(data.sections.length).toBeGreaterThan(0);

      // Verify section names exist
      const sectionNames = data.sections.map((s) => s.name);
      expect(sectionNames).toContain("lands");
      expect(sectionNames).toContain("creatures");

      // Each section has required fields
      for (const section of data.sections) {
        expect(["good", "warning", "issue"]).toContain(section.status);
        expect(typeof section.actual).toBe("number");
        expect(typeof section.expected).toBe("number");
        expect(typeof section.note).toBe("string");
      }
    });

    it("auto-detects set from card names", async () => {
      await seedDeckbuildingData();

      const result = await deckbuildingModule.execute(
        {
          deck: [
            { name: "Vengeful Strangler", count: 2 },
            { name: "Go for the Throat", count: 1 },
            { name: "Swamp", count: 17 },
          ],
        },
        env,
      );

      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unexpected");
      expect((result.data as { set: string }).set).toBe("DSK");
    });

    it("flags low land count", async () => {
      await seedDeckbuildingData();

      const result = await deckbuildingModule.execute(
        {
          set: "DSK",
          deck: [
            { name: "Vengeful Strangler", count: 4 },
            { name: "Gloomlake Verge", count: 4 },
            { name: "Go for the Throat", count: 2 },
            // Only 13 lands (avg is 17.2)
            { name: "Island", count: 7 },
            { name: "Swamp", count: 6 },
          ],
        },
        env,
      );

      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unexpected");
      const data = result.data as {
        sections: { name: string; status: string; note: string }[];
      };
      const landSection = data.sections.find((s) => s.name === "lands");
      expect(landSection).toBeDefined();
      expect(landSection!.status).toBe("issue");
      expect(landSection!.note).toContain("Low land count");
    });

    it("reports CABS ratio when cabs role data exists", async () => {
      await seedDeckbuildingData();

      // Add cabs roles: creatures and removal are CABS, Divination-like spell is not
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
        ).bind("o-1", "Vengeful Strangler", "cabs", "DSK"),
        env.DB.prepare(
          `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
        ).bind("o-2", "Doomsday Excruciator", "cabs", "DSK"),
        env.DB.prepare(
          `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
        ).bind("o-3", "Go for the Throat", "cabs", "DSK"),
        env.DB.prepare(
          `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
        ).bind("o-4", "Gloomlake Verge", "cabs", "DSK"),
      ]);

      // Add a non-CABS card to the DB
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, produced_mana, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(200, "o-draw", "Divination", "Divination", "{2}{U}", 3, "Sorcery", '["U"]', "[]", 1),
      ]);

      const result = await deckbuildingModule.execute(
        {
          set: "DSK",
          deck: [
            { name: "Vengeful Strangler", count: 2 },
            { name: "Doomsday Excruciator", count: 1 },
            { name: "Go for the Throat", count: 1 },
            { name: "Gloomlake Verge", count: 2 },
            { name: "Divination", count: 3 }, // 3 non-CABS cards
            { name: "Island", count: 8 },
            { name: "Swamp", count: 8 },
          ],
        },
        env,
      );

      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unexpected");
      const data = result.data as {
        sections: { name: string; status: string; actual: number; note: string }[];
      };
      const cabsSection = data.sections.find((s) => s.name === "cabs");
      expect(cabsSection).toBeDefined();
      // 6 CABS spells out of 9 total spells → 3 non-CABS
      expect(cabsSection!.actual).toBe(3); // non-CABS count
      expect(cabsSection!.note).toContain("board");
    });
  });

  describe("cut advisor mode", () => {
    it("ranks cards by contribution score", async () => {
      await seedDeckbuildingData();

      const result = await deckbuildingModule.execute(
        {
          set: "DSK",
          deck: [
            { name: "Vengeful Strangler", count: 2 },
            { name: "Doomsday Excruciator", count: 1 },
            { name: "Go for the Throat", count: 1 },
            { name: "Gloomlake Verge", count: 2 },
            { name: "Evolving Wilds", count: 1 },
            { name: "Island", count: 8 },
            { name: "Swamp", count: 8 },
          ],
          cuts: 2,
        },
        env,
      );

      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unexpected");
      const data = result.data as {
        mode: string;
        candidates: {
          card: string;
          score: number;
          axes: {
            baseline: number;
            synergy: number;
            curve: number;
            role: number;
            castability: number;
          };
          reason: string;
        }[];
      };

      expect(data.mode).toBe("cut_advisor");
      expect(data.candidates.length).toBe(2);

      // Candidates should be sorted by score ascending (lowest = best cut)
      expect(data.candidates[0]!.score).toBeLessThanOrEqual(data.candidates[1]!.score);

      // Each candidate has per-axis breakdown
      for (const c of data.candidates) {
        expect(typeof c.axes.baseline).toBe("number");
        expect(typeof c.axes.synergy).toBe("number");
        expect(typeof c.axes.curve).toBe("number");
        expect(typeof c.axes.role).toBe("number");
        expect(typeof c.axes.castability).toBe("number");
        expect(typeof c.reason).toBe("string");
      }
    });

    it("excludes land cards from cut candidates", async () => {
      await seedDeckbuildingData();

      const result = await deckbuildingModule.execute(
        {
          set: "DSK",
          deck: [
            { name: "Vengeful Strangler", count: 1 },
            { name: "Evolving Wilds", count: 1 },
            { name: "Island", count: 8 },
            { name: "Swamp", count: 8 },
          ],
          cuts: 3,
        },
        env,
      );

      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unexpected");
      const data = result.data as {
        candidates: { card: string }[];
      };

      const landNames = ["Evolving Wilds", "Island", "Swamp"];
      for (const c of data.candidates) {
        expect(landNames).not.toContain(c.card);
      }
    });
  });

  describe("edge cases", () => {
    it("returns error for empty deck", async () => {
      const result = await deckbuildingModule.execute({ deck: [] }, env);
      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unexpected");
      expect((result.data as { error: string }).error).toContain("No deck");
    });

    it("returns error when set cannot be inferred", async () => {
      const result = await deckbuildingModule.execute(
        { deck: [{ name: "Nonexistent Card", count: 1 }] },
        env,
      );
      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unexpected");
      expect((result.data as { error: string }).error).toContain("Could not determine set");
    });

    it("tracks unresolved cards", async () => {
      await seedDeckbuildingData();

      const result = await deckbuildingModule.execute(
        {
          set: "DSK",
          deck: [
            { name: "Vengeful Strangler", count: 2 },
            { name: "Totally Made Up Card", count: 1 },
            { name: "Swamp", count: 17 },
          ],
        },
        env,
      );

      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unexpected");
      const data = result.data as { unresolved_cards: string[] };
      expect(data.unresolved_cards).toContain("Totally Made Up Card");
    });
  });

  describe("archetype alternatives", () => {
    it("suggests alternative archetypes in health check", async () => {
      await seedDeckbuildingData();

      // Add archetype stats for UB so alternatives can compute GIH WR shifts.
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, gihwr) VALUES (?, ?, ?, ?, ?)`,
        ).bind("DSK", "Vengeful Strangler", "UB", 5000, 0.58),
        env.DB.prepare(
          `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, gihwr) VALUES (?, ?, ?, ?, ?)`,
        ).bind("DSK", "Doomsday Excruciator", "UB", 3000, 0.64),
        env.DB.prepare(
          `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, gihwr) VALUES (?, ?, ?, ?, ?)`,
        ).bind("DSK", "Go for the Throat", "UB", 4000, 0.61),
        env.DB.prepare(
          `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, gihwr) VALUES (?, ?, ?, ?, ?)`,
        ).bind("DSK", "Gloomlake Verge", "UB", 3000, 0.59),
        env.DB.prepare(
          `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, gihwr) VALUES (?, ?, ?, ?, ?)`,
        ).bind("DSK", "Vengeful Strangler", "B", 3000, 0.56),
        env.DB.prepare(
          `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, gihwr) VALUES (?, ?, ?, ?, ?)`,
        ).bind("DSK", "Doomsday Excruciator", "B", 2000, 0.62),
        env.DB.prepare(
          `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, gihwr) VALUES (?, ?, ?, ?, ?)`,
        ).bind("DSK", "Go for the Throat", "B", 2000, 0.59),
        env.DB.prepare(
          `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, gihwr) VALUES (?, ?, ?, ?, ?)`,
        ).bind("DSK", "Gloomlake Verge", "B", 2000, 0.55),
      ]);

      const result = await deckbuildingModule.execute(
        {
          set: "DSK",
          deck: [
            { name: "Vengeful Strangler", count: 4 },
            { name: "Doomsday Excruciator", count: 2 },
            { name: "Gloomlake Verge", count: 4 },
            { name: "Go for the Throat", count: 2 },
            { name: "Island", count: 7 },
            { name: "Swamp", count: 6 },
          ],
        },
        env,
      );

      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unexpected");
      const data = result.data as {
        alternatives: {
          archetype: string;
          viability: string;
          format_context: string;
          cuts: string[];
          avg_gihwr_shift: number;
        }[];
      };

      // Should have alternatives (UB is a different archetype from the primary B)
      expect(data.alternatives).toBeDefined();
      // Primary should not appear in alternatives
      for (const alt of data.alternatives) {
        expect(alt.archetype).not.toBe("B");
        expect(["strong", "moderate", "sparse", "fringe"]).toContain(
          alt.viability,
        );
        expect(alt.format_context).toContain("% of decks");
      }
    });
  });
});
