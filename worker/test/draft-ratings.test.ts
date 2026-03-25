import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { draftRatingsModule } from "../../plugins/mtga/reference/draft-ratings";
import { registerNativeModule } from "../src/reference/registry";

import { cleanAll } from "./helpers";

describe("draft_ratings native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("mtga", draftRatingsModule);
  });

  async function seedDraftData(): Promise<void> {
    await env.DB.batch([
      // Set stats
      env.DB.prepare(
        `INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "PremierDraft", 250_000, 3, 0.515),
      env.DB.prepare(
        `INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr) VALUES (?, ?, ?, ?, ?)`,
      ).bind("BLB", "PremierDraft", 200_000, 2, 0.51),

      // DSK cards
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "DSK",
        "Gloomlake Verge",
        15_000,
        20_000,
        5000,
        0.564,
        0.62,
        0.54,
        0.48,
        0.06,
        8.5,
        9.2,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Blazing Bolt", 10_000, 12_000, 2000, 0.58, 0.6, 0.55, 0.5, 0.05, 3, 2.5),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Forest Bear", 8000, 10_000, 2000, 0.48, 0.49, 0.47, 0.5, -0.03, 10, 11),

      // BLB cards
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("BLB", "Card A", 5000, 7000, 2000, 0.55, 0.56, 0.53, 0.5, 0.03, 5, 6),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("BLB", "Card B", 4000, 6000, 2000, 0.52, 0.53, 0.51, 0.49, 0.02, 7, 8),

      // Color stats for Gloomlake Verge
      env.DB.prepare(
        `INSERT INTO mtga_draft_color_stats (set_code, card_name, color_pair, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "DSK",
        "Gloomlake Verge",
        "UB",
        3000,
        4000,
        1000,
        0.59,
        0.63,
        0.56,
        0.49,
        0.07,
        7.2,
        8,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_color_stats (set_code, card_name, color_pair, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", "BG", 2000, 3000, 1000, 0.52, 0.54, 0.5, 0.49, 0.01, 9, 10),

      // FTS5 rows for card name search
      env.DB.prepare("INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (?, ?)").bind(
        "DSK",
        "Gloomlake Verge",
      ),
      env.DB.prepare("INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (?, ?)").bind(
        "DSK",
        "Blazing Bolt",
      ),
      env.DB.prepare("INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (?, ?)").bind(
        "DSK",
        "Forest Bear",
      ),
      env.DB.prepare("INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (?, ?)").bind(
        "BLB",
        "Card A",
      ),
      env.DB.prepare("INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (?, ?)").bind(
        "BLB",
        "Card B",
      ),
    ]);
  }

  it("returns available sets when no set specified", async () => {
    await seedDraftData();

    const result = await draftRatingsModule.execute({}, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("DSK");
    expect(result.content).toContain("BLB");
  });

  it("returns set overview when only set specified", async () => {
    await seedDraftData();

    const result = await draftRatingsModule.execute({ set: "DSK" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    // Should contain set info
    expect(result.content).toContain("DSK");
    expect(result.content).toContain("PremierDraft");
    // Should contain top cards
    expect(result.content).toContain("Blazing Bolt");
    expect(result.content).toContain("GIH WR");
  });

  it("returns single card detail with color breakdowns", async () => {
    await seedDraftData();

    const result = await draftRatingsModule.execute({ set: "DSK", card: "gloomlake" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("Gloomlake Verge");
    expect(result.content).toContain("56.4%"); // GIHWR
    // Should include color pair breakdowns
    expect(result.content).toContain("UB");
    expect(result.content).toContain("BG");
  });

  it("returns comparison for multiple cards", async () => {
    await seedDraftData();

    const result = await draftRatingsModule.execute(
      {
        set: "DSK",
        cards: ["Gloomlake Verge", "Blazing Bolt"],
      },
      env,
    );
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("Gloomlake Verge");
    expect(result.content).toContain("Blazing Bolt");
    expect(result.content).toContain("comparison");
  });

  it("returns leaderboard sorted by gihwr", async () => {
    await seedDraftData();

    const result = await draftRatingsModule.execute({ set: "DSK", sort: "gihwr", limit: 3 }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("Top cards by GIH WR");
    // Blazing Bolt (0.58) should appear before Gloomlake Verge (0.564)
    const blazingIndex = result.content.indexOf("Blazing Bolt");
    const gloomlakeIndex = result.content.indexOf("Gloomlake Verge");
    expect(blazingIndex).toBeLessThan(gloomlakeIndex);
  });

  it("returns not found for nonexistent card", async () => {
    await seedDraftData();

    const result = await draftRatingsModule.execute({ set: "DSK", card: "nonexistent" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("No cards matching");
  });

  it("returns error for nonexistent set", async () => {
    await seedDraftData();

    const result = await draftRatingsModule.execute({ set: "ZZZ" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("not found");
  });

  it("handles FTS5 fuzzy card name search", async () => {
    await seedDraftData();

    // "blazing" should match "Blazing Bolt" via FTS5
    const result = await draftRatingsModule.execute({ set: "DSK", card: "blazing" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("Blazing Bolt");
  });

  it("filters leaderboard by color pair", async () => {
    await seedDraftData();

    const result = await draftRatingsModule.execute(
      { set: "DSK", sort: "gihwr", colors: "UB" },
      env,
    );
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("UB");
    // Only Gloomlake Verge has UB color stats
    expect(result.content).toContain("Gloomlake Verge");
  });

  // ── Mode 6: Contextual pick ───────────────────────────────

  async function seedContextualData(): Promise<void> {
    await seedDraftData();
    await env.DB.batch([
      // Card metadata in mtga_cards (need front_face_name, cmc, colors for pool analysis)
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(1, "oracle-1", "Gloomlake Verge", "Gloomlake Verge", "{U}{B}", 2, '["U","B"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(2, "oracle-2", "Blazing Bolt", "Blazing Bolt", "{R}", 1, '["R"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(3, "oracle-3", "Forest Bear", "Forest Bear", "{G}{G}", 2, '["G"]', 1),

      // Synergy data (both directions)
      env.DB.prepare(
        `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "Blazing Bolt", "Gloomlake Verge", 0.05, 500),
      env.DB.prepare(
        `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", "Blazing Bolt", 0.05, 500),
      env.DB.prepare(
        `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "Forest Bear", "Gloomlake Verge", -0.02, 300),
      env.DB.prepare(
        `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", "Forest Bear", -0.02, 300),

      // Archetype curves for UB
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_curves (set_code, color_pair, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "UB", 1, 3.5, 1000),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_curves (set_code, color_pair, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "UB", 2, 5.0, 1000),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_curves (set_code, color_pair, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "UB", 3, 4.0, 1000),

      // Card roles (Blazing Bolt is removal)
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("oracle-2", "Blazing Bolt", "removal", "DSK"),
    ]);
  }

  it("returns structured contextual pick recommendation", async () => {
    await seedContextualData();

    const result = await draftRatingsModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge"],
        pack: ["Blazing Bolt", "Forest Bear"],
        pick_number: 8,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const data = result.data as {
      archetype: { primary: string; candidates: Array<{ color_pair: string; weight: number }>; confidence: number };
      pick_number: number;
      weight_profile: string;
      recommendations: Array<{
        card: string;
        composite_score: number;
        rank: number;
        axes: {
          baseline: { raw: number; normalized: number; weight: number; contribution: number; gihwr: number; source: string };
          synergy: { raw: number; normalized: number; weight: number; contribution: number; top_synergies: Array<{ card: string; delta: number }> };
          role: { raw: number; normalized: number; weight: number; contribution: number; roles: string[]; detail: string };
          curve: { raw: number; normalized: number; weight: number; contribution: number; cmc: number; pool_at_cmc: number; ideal_at_cmc: number };
          castability: { raw: number; normalized: number; weight: number; contribution: number; max_pips: number; estimated_sources: number };
          signal: { raw: number; normalized: number; weight: number; contribution: number; ata: number; current_pick: number };
        };
        waspas: { wsm: number; wpm: number; lambda: number };
      }>;
    };

    // Pick 8 = mid weight profile
    expect(data.weight_profile).toBe("mid");
    expect(data.pick_number).toBe(8);

    // Continuous weights should be present and sum to ~1.0
    const w = (result.data as { weights: { baseline: number; synergy: number; curve: number; signal: number; role: number; castability: number } }).weights;
    expect(w.baseline).toBeGreaterThan(0);
    expect(w.synergy).toBeGreaterThan(0);
    expect(w.curve).toBeGreaterThan(0);
    expect(w.signal).toBeGreaterThan(0);
    expect(w.baseline + w.synergy + w.curve + w.signal + w.role + w.castability).toBeCloseTo(1.0, 1);

    // Pool has UB card, so UB should be primary or a candidate
    expect(data.archetype.candidates.length).toBeGreaterThan(0);

    // Should have 2 recommendations (one per pack card)
    expect(data.recommendations).toHaveLength(2);

    // Each recommendation should have all components in spec format
    for (const rec of data.recommendations) {
      expect(rec.card).toBeTruthy();
      expect(typeof rec.composite_score).toBe("number");
      expect(typeof rec.rank).toBe("number");
      expect(rec.rank).toBeGreaterThan(0);
      // All axes present with raw/normalized/weight/contribution
      for (const axis of ["baseline", "synergy", "role", "curve", "castability", "signal"] as const) {
        expect(rec.axes[axis]).toBeDefined();
        expect(typeof rec.axes[axis].raw).toBe("number");
        expect(typeof rec.axes[axis].normalized).toBe("number");
        expect(typeof rec.axes[axis].weight).toBe("number");
        expect(typeof rec.axes[axis].contribution).toBe("number");
      }
      // WASPAS intermediates exposed
      expect(typeof rec.waspas.wsm).toBe("number");
      expect(typeof rec.waspas.wpm).toBe("number");
      expect(typeof rec.waspas.lambda).toBe("number");
    }

    // Blazing Bolt has positive synergy with Gloomlake Verge
    const blazingRec = data.recommendations.find((r) => r.card === "Blazing Bolt");
    expect(blazingRec).toBeDefined();
    expect(blazingRec!.axes.synergy.raw).toBeGreaterThan(0);
    expect(blazingRec!.axes.synergy.top_synergies.length).toBeGreaterThan(0);

    // Blazing Bolt is removal — should have role data
    expect(blazingRec!.axes.role.roles).toContain("removal");
    expect(blazingRec!.axes.role.raw).toBeGreaterThanOrEqual(0);

    // Forest Bear has negative synergy with Gloomlake Verge
    const bearRec = data.recommendations.find((r) => r.card === "Forest Bear");
    expect(bearRec).toBeDefined();
    expect(bearRec!.axes.synergy.raw).toBeLessThan(0);
    // Forest Bear is not removal
    expect(bearRec!.axes.role.roles).not.toContain("removal");
  });

  it("uses early weight profile for picks 1-5", async () => {
    await seedContextualData();

    const result = await draftRatingsModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge"],
        pack: ["Blazing Bolt"],
        pick_number: 3,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    expect((result.data as { weight_profile: string }).weight_profile).toBe("early");
  });

  it("uses late weight profile for picks 21+", async () => {
    await seedContextualData();

    const result = await draftRatingsModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge"],
        pack: ["Blazing Bolt"],
        pick_number: 30,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    expect((result.data as { weight_profile: string }).weight_profile).toBe("late");
  });

  it("falls back to overall stats with empty pool", async () => {
    await seedContextualData();

    // Need at least 1 card in pool and pack for mode 6
    // With a colorless pool card, should fallback to _overall
    const result = await draftRatingsModule.execute(
      {
        set: "DSK",
        pool: ["Forest Bear"],
        pack: ["Blazing Bolt", "Gloomlake Verge"],
        pick_number: 1,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as { recommendations: Array<{ card: string; composite_score: number }> };
    expect(data.recommendations.length).toBe(2);
  });

  it("uses accumulated signal from pick_history when provided", async () => {
    await seedContextualData();

    // Simulate a draft where red cards keep being available late (red is open).
    // pick_history: 3 past picks where Blazing Bolt (R, ATA 2.5) was available at picks 5, 8, 10.
    const pickHistory = [
      { available: ["Blazing Bolt", "Forest Bear"], chosen: "Forest Bear" },
      { available: ["Blazing Bolt", "Gloomlake Verge"], chosen: "Gloomlake Verge" },
      { available: ["Blazing Bolt"], chosen: "Blazing Bolt" },
    ];

    // With pick_history: signal should be accumulated from history.
    const withHistory = await draftRatingsModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge", "Forest Bear", "Blazing Bolt"],
        pack: ["Blazing Bolt", "Forest Bear"],
        pick_number: 8,
        pick_history: pickHistory,
      },
      env,
    );

    // Without pick_history: signal uses single-pick ATA fallback.
    const withoutHistory = await draftRatingsModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge", "Forest Bear", "Blazing Bolt"],
        pack: ["Blazing Bolt", "Forest Bear"],
        pick_number: 8,
      },
      env,
    );

    expect(withHistory.type).toBe("structured");
    expect(withoutHistory.type).toBe("structured");
    if (withHistory.type !== "structured" || withoutHistory.type !== "structured") throw new Error("unexpected type");

    const histRecs = (withHistory.data as { recommendations: Array<{ card: string; axes: { signal: { raw: number } } }> }).recommendations;
    const noHistRecs = (withoutHistory.data as { recommendations: Array<{ card: string; axes: { signal: { raw: number } } }> }).recommendations;

    // Both should return recommendations.
    expect(histRecs.length).toBe(2);
    expect(noHistRecs.length).toBe(2);

    // Signal scores should differ between with/without history (accumulated vs single-pick).
    const histBlazing = histRecs.find((r) => r.card === "Blazing Bolt");
    const noHistBlazing = noHistRecs.find((r) => r.card === "Blazing Bolt");
    expect(histBlazing).toBeDefined();
    expect(noHistBlazing).toBeDefined();
    expect(histBlazing!.axes.signal.raw).not.toBe(noHistBlazing!.axes.signal.raw);
  });
});
