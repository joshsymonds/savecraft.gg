import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cardStatsModule } from "../../plugins/mtga/reference/card-stats";
import { draftAdvisorModule } from "../../plugins/mtga/reference/draft-advisor";
import {
  computeColorCommitment,
  derivePairWeights,
  type CardMetaRow,
} from "../../plugins/mtga/reference/scoring";
import { registerNativeModule } from "../src/reference/registry";

import { cleanAll } from "./helpers";

type SourceModel = "current" | "splash" | "pivot";

// ── Shared seed data ─────────────────────────────────────────

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
    ).bind("DSK", "Gloomlake Verge", 15_000, 20_000, 5000, 0.564, 0.62, 0.54, 0.48, 0.06, 8.5, 9.2),
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
    ).bind("DSK", "Gloomlake Verge", "UB", 3000, 4000, 1000, 0.59, 0.63, 0.56, 0.49, 0.07, 7.2, 8),
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

async function seedContextualData(): Promise<void> {
  await seedDraftData();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      1,
      "oracle-1",
      "Gloomlake Verge",
      "Gloomlake Verge",
      "{U}{B}",
      2,
      "Creature — Horror",
      '["U","B"]',
      1,
    ),
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(2, "oracle-2", "Blazing Bolt", "Blazing Bolt", "{R}", 1, "Instant", '["R"]', 1),
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(3, "oracle-3", "Forest Bear", "Forest Bear", "{G}{G}", 2, "Creature — Bear", '["G"]', 1),

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

    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, color_pair, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", 1, 3.5, 1000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, color_pair, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", 2, 5, 1000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, color_pair, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", 3, 4, 1000),

    env.DB.prepare(
      `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
    ).bind("oracle-2", "Blazing Bolt", "removal", "DSK"),
  ]);
}

// ── card_stats module tests ──────────────────────────────────

describe("card_stats native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("mtga", cardStatsModule);
  });

  it("returns available sets when no set specified", async () => {
    await seedDraftData();

    const result = await cardStatsModule.execute({}, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("DSK");
    expect(result.content).toContain("BLB");
  });

  it("returns set overview when only set specified", async () => {
    await seedDraftData();

    const result = await cardStatsModule.execute({ set: "DSK" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("DSK");
    expect(result.content).toContain("PremierDraft");
    expect(result.content).toContain("Blazing Bolt");
    expect(result.content).toContain("GIH WR");
  });

  it("returns single card detail with color breakdowns", async () => {
    await seedDraftData();

    const result = await cardStatsModule.execute({ set: "DSK", card: "gloomlake" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("Gloomlake Verge");
    expect(result.content).toContain("56.4%");
    expect(result.content).toContain("UB");
    expect(result.content).toContain("BG");
  });

  it("returns leaderboard sorted by gihwr", async () => {
    await seedDraftData();

    const result = await cardStatsModule.execute({ set: "DSK", sort: "gihwr", limit: 3 }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("Top cards by GIH WR");
    const blazingIndex = result.content.indexOf("Blazing Bolt");
    const gloomlakeIndex = result.content.indexOf("Gloomlake Verge");
    expect(blazingIndex).toBeLessThan(gloomlakeIndex);
  });

  it("returns not found for nonexistent card", async () => {
    await seedDraftData();

    const result = await cardStatsModule.execute({ set: "DSK", card: "nonexistent" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("No cards matching");
  });

  it("returns error for nonexistent set", async () => {
    await seedDraftData();

    const result = await cardStatsModule.execute({ set: "ZZZ" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("not found");
  });

  it("handles FTS5 fuzzy card name search", async () => {
    await seedDraftData();

    const result = await cardStatsModule.execute({ set: "DSK", card: "blazing" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("Blazing Bolt");
  });

  it("filters leaderboard by color pair", async () => {
    await seedDraftData();

    const result = await cardStatsModule.execute({ set: "DSK", sort: "gihwr", colors: "UB" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("UB");
    expect(result.content).toContain("Gloomlake Verge");
  });
});

// ── draft_advisor module tests ───────────────────────────────

describe("draft_advisor native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("mtga", draftAdvisorModule);
  });

  it("returns structured contextual pick recommendation", async () => {
    await seedContextualData();

    const result = await draftAdvisorModule.execute(
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
      archetype: {
        primary: string;
        candidates: { color_pair: string; weight: number }[];
        confidence: number;
      };
      pick_number: number;
      weight_profile: string;
      recommendations: {
        card: string;
        composite_score: number;
        rank: number;
        axes: {
          baseline: {
            raw: number;
            normalized: number;
            weight: number;
            contribution: number;
            gihwr: number;
            source: string;
          };
          synergy: {
            raw: number;
            normalized: number;
            weight: number;
            contribution: number;
            top_synergies: { card: string; delta: number }[];
          };
          role: {
            raw: number;
            normalized: number;
            weight: number;
            contribution: number;
            roles: string[];
            detail: string;
          };
          curve: {
            raw: number;
            normalized: number;
            weight: number;
            contribution: number;
            cmc: number;
            pool_at_cmc: number;
            ideal_at_cmc: number;
          };
          castability: {
            raw: number;
            normalized: number;
            weight: number;
            contribution: number;
            max_pips: number;
            estimated_sources: number;
            potential_sources: number;
            effective_sources: number;
            source_model: SourceModel;
          };
          signal: {
            raw: number;
            normalized: number;
            weight: number;
            contribution: number;
            ata: number;
            current_pick: number;
          };
        };
        waspas: { wsm: number; wpm: number; lambda: number };
      }[];
    };

    expect(data.weight_profile).toBe("early");
    expect(data.pick_number).toBe(8);

    const w = (
      result.data as {
        weights: {
          baseline: number;
          synergy: number;
          curve: number;
          signal: number;
          role: number;
          castability: number;
        };
      }
    ).weights;
    expect(w.baseline).toBeGreaterThan(0);
    expect(w.synergy).toBeGreaterThan(0);
    expect(w.curve).toBeGreaterThan(0);
    expect(w.signal).toBeGreaterThan(0);
    expect(w.baseline + w.synergy + w.curve + w.signal + w.role + w.castability).toBeCloseTo(1, 1);

    expect(data.archetype.candidates.length).toBeGreaterThan(0);
    expect(data.recommendations).toHaveLength(2);

    for (const rec of data.recommendations) {
      expect(rec.card).toBeTruthy();
      expect(typeof rec.composite_score).toBe("number");
      expect(typeof rec.rank).toBe("number");
      expect(rec.rank).toBeGreaterThan(0);
      for (const axis of [
        "baseline",
        "synergy",
        "role",
        "curve",
        "castability",
        "signal",
      ] as const) {
        expect(rec.axes[axis]).toBeDefined();
        expect(typeof rec.axes[axis].raw).toBe("number");
        expect(typeof rec.axes[axis].normalized).toBe("number");
        expect(typeof rec.axes[axis].weight).toBe("number");
        expect(typeof rec.axes[axis].contribution).toBe("number");
      }
      expect(typeof rec.waspas.wsm).toBe("number");
      expect(typeof rec.waspas.wpm).toBe("number");
      expect(typeof rec.waspas.lambda).toBe("number");
    }

    const blazingRec = data.recommendations.find((r) => r.card === "Blazing Bolt");
    expect(blazingRec).toBeDefined();
    expect(blazingRec!.axes.synergy.raw).toBeGreaterThan(0);
    expect(blazingRec!.axes.synergy.top_synergies.length).toBeGreaterThan(0);
    expect(blazingRec!.axes.role.roles).toContain("removal");
    expect(blazingRec!.axes.role.raw).toBeGreaterThanOrEqual(0);

    const bearRec = data.recommendations.find((r) => r.card === "Forest Bear");
    expect(bearRec).toBeDefined();
    expect(bearRec!.axes.synergy.raw).toBeLessThan(0);
    expect(bearRec!.axes.role.roles).not.toContain("removal");
  });

  it("uses early weight profile for picks 1-5", async () => {
    await seedContextualData();

    const result = await draftAdvisorModule.execute(
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

    const result = await draftAdvisorModule.execute(
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

    const result = await draftAdvisorModule.execute(
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
    const data = result.data as { recommendations: { card: string; composite_score: number }[] };
    expect(data.recommendations.length).toBe(2);
  });

  it("accepts P1P1 with empty pool", async () => {
    await seedContextualData();

    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: [],
        pack: ["Blazing Bolt", "Gloomlake Verge", "Forest Bear"],
        pick_number: 1,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as { recommendations: { card: string; composite_score: number }[] };
    expect(data.recommendations.length).toBe(3);
    expect(data.recommendations[0]!.card).toBeDefined();
  });

  it("uses accumulated signal from pick_history when provided", async () => {
    await seedContextualData();

    const pickHistory = [
      { available: ["Blazing Bolt", "Forest Bear"], chosen: "Forest Bear" },
      { available: ["Blazing Bolt", "Gloomlake Verge"], chosen: "Gloomlake Verge" },
      { available: ["Blazing Bolt"], chosen: "Blazing Bolt" },
    ];

    const withHistory = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge", "Forest Bear", "Blazing Bolt"],
        pack: ["Blazing Bolt", "Forest Bear"],
        pick_number: 8,
        pick_history: pickHistory,
      },
      env,
    );

    const withoutHistory = await draftAdvisorModule.execute(
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
    if (withHistory.type !== "structured" || withoutHistory.type !== "structured")
      throw new Error("unexpected type");

    const histRecs = (
      withHistory.data as { recommendations: { card: string; axes: { signal: { raw: number } } }[] }
    ).recommendations;
    const noHistRecs = (
      withoutHistory.data as {
        recommendations: { card: string; axes: { signal: { raw: number } } }[];
      }
    ).recommendations;

    expect(histRecs.length).toBe(2);
    expect(noHistRecs.length).toBe(2);

    const histBlazing = histRecs.find((r) => r.card === "Blazing Bolt");
    const noHistBlazing = noHistRecs.find((r) => r.card === "Blazing Bolt");
    expect(histBlazing).toBeDefined();
    expect(noHistBlazing).toBeDefined();
    expect(histBlazing!.axes.signal.raw).not.toBe(noHistBlazing!.axes.signal.raw);
  });

  it("scores lands with zero curve and mana_fixing role", async () => {
    await seedContextualData();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(4, "oracle-land", "Darkslick Shores", "Darkslick Shores", "", 0, "Land", "[]", 1),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Darkslick Shores", 12_000, 16_000, 4000, 0.56, 0.58, 0.54, 0.49, 0.04, 4, 3.5),
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("oracle-land", "Darkslick Shores", "mana_fixing", "DSK"),
      env.DB.prepare(
        `INSERT INTO mtga_draft_role_targets (set_code, color_pair, role, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "UB", "mana_fixing", 2.5, 1000),
    ]);

    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge", "Blazing Bolt", "Forest Bear", "Gloomlake Verge"],
        pack: ["Darkslick Shores", "Blazing Bolt"],
        pick_number: 15,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const data = result.data as {
      recommendations: {
        card: string;
        axes: {
          curve: { raw: number };
          role: { raw: number; roles: string[] };
          castability: { raw: number };
        };
      }[];
    };

    const landRec = data.recommendations.find((r) => r.card === "Darkslick Shores");
    expect(landRec).toBeDefined();
    expect(landRec!.axes.curve.raw).toBe(0);
    expect(landRec!.axes.role.roles).toContain("mana_fixing");
    expect(landRec!.axes.role.raw).toBeGreaterThan(0);
    expect(landRec!.axes.castability.raw).toBe(1);

    const boltRec = data.recommendations.find((r) => r.card === "Blazing Bolt");
    expect(boltRec).toBeDefined();
    expect(boltRec!.axes.curve.raw).not.toBe(0);
  });

  it("returns usage instructions when no pool/pack/pick_history provided", async () => {
    await seedContextualData();

    const result = await draftAdvisorModule.execute({ set: "DSK" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");
    expect(result.content).toContain("Draft Advisor requires");
    expect(result.content).toContain("card_stats");
  });

  it("returns error for nonexistent set", async () => {
    await seedContextualData();

    const result = await draftAdvisorModule.execute({ set: "ZZZ" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");
    expect(result.content).toContain("not found");
  });

  it("infers set from pack card names when set omitted", async () => {
    await seedContextualData();

    const result = await draftAdvisorModule.execute(
      { pack: ["Blazing Bolt", "Forest Bear"], pick_number: 1 },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as { recommendations: { card: string }[] };
    expect(data.recommendations.length).toBe(2);
  });

  it("infers set from pool + pack card names when set omitted", async () => {
    await seedContextualData();

    const result = await draftAdvisorModule.execute(
      {
        pool: ["Gloomlake Verge"],
        pack: ["Blazing Bolt", "Forest Bear"],
        pick_number: 5,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as { recommendations: { card: string }[] };
    expect(data.recommendations.length).toBe(2);
  });

  it("returns ambiguity error when sets match equally", async () => {
    await seedContextualData();
    // Add a card that exists in both DSK and BLB
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("BLB", "Shared Card", 5000, 7000, 2000, 0.55, 0.56, 0.53, 0.5, 0.03, 5, 6),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Shared Card", 5000, 7000, 2000, 0.55, 0.56, 0.53, 0.5, 0.03, 5, 6),
    ]);

    const result = await draftAdvisorModule.execute({ pack: ["Shared Card"], pick_number: 1 }, env);

    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");
    expect(result.content).toContain("Could not determine set");
    expect(result.content).toContain("DSK");
    expect(result.content).toContain("BLB");
  });

  it("returns no-match error for unknown card names", async () => {
    await seedContextualData();

    const result = await draftAdvisorModule.execute(
      { pack: ["Nonexistent Card", "Another Fake Card"], pick_number: 1 },
      env,
    );

    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");
    expect(result.content).toContain("No draft data found");
    expect(result.content).toContain("Available sets");
  });

  it("returns error when no set and no card names provided", async () => {
    const result = await draftAdvisorModule.execute({}, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");
    expect(result.content).toContain("Cannot determine set");
  });

  it("infers set from pick_history chosen cards in batch review", async () => {
    await seedContextualData();

    const result = await draftAdvisorModule.execute(
      {
        pick_history: [
          { available: ["Blazing Bolt", "Forest Bear"], chosen: "Blazing Bolt" },
          { available: ["Forest Bear", "Gloomlake Verge"], chosen: "Forest Bear" },
          { available: ["Gloomlake Verge"], chosen: "Gloomlake Verge" },
        ],
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as { summary: unknown };
    expect(data.summary).toBeDefined();
  });

  // ── Liliana vs Elenda regression test (the scenario that exposed the bug) ──

  it("ranks Liliana above Elenda at P2P1 with a WU pool", async () => {
    // Exact scenario from FDN draft: WU pool at pick 13, pack contains Liliana (BB)
    // and Elenda (WB). Before the pivot-potential fix, Elenda ranked #1 because
    // Liliana's double-black castability was ~0. Reddit unanimously said Liliana.
    await env.DB.batch([
      // Set stats
      env.DB.prepare(
        `INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "PremierDraft", 500_000, 20, 0.515),

      // Pool cards (WU-heavy)
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        100,
        "o-fd",
        "Fleeting Distraction",
        "Fleeting Distraction",
        "{U}",
        1,
        "Instant",
        '["U"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        101,
        "o-hh",
        "Helpful Hunter",
        "Helpful Hunter",
        "{1}{W}",
        2,
        "Creature — Cat",
        '["W"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        102,
        "o-sl",
        "Strix Lookout",
        "Strix Lookout",
        "{U}",
        1,
        "Creature — Bird",
        '["U"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(103, "o-tt", "Think Twice", "Think Twice", "{1}{U}", 2, "Instant", '["U"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(104, "o-ft", "Faebloom Trick", "Faebloom Trick", "{1}{U}", 2, "Instant", '["U"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(105, "o-ref", "Refute", "Refute", "{1}{U}{U}", 3, "Instant", '["U"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        106,
        "o-ld",
        "Lightshell Duo",
        "Lightshell Duo",
        "{3}{U}",
        4,
        "Creature — Otter",
        '["U"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        107,
        "o-ssz",
        "Soul-Shackled Zombie",
        "Soul-Shackled Zombie",
        "{1}{B}",
        2,
        "Creature — Zombie",
        '["B"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(108, "o-lr", "Luminous Rebuke", "Luminous Rebuke", "{4}{W}", 5, "Instant", '["W"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default, produced_mana) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        109,
        "o-ew",
        "Evolving Wilds",
        "Evolving Wilds",
        "",
        0,
        "Land",
        "[]",
        1,
        '["W","U","B","R","G"]',
      ),

      // Pack cards
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        110,
        "o-lili",
        "Liliana, Dreadhorde General",
        "Liliana, Dreadhorde General",
        "{4}{B}{B}",
        6,
        "Legendary Planeswalker — Liliana",
        '["B"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        111,
        "o-elenda",
        "Elenda, Saint of Dusk",
        "Elenda, Saint of Dusk",
        "{2}{W}{B}",
        4,
        "Legendary Creature — Vampire Knight",
        '["W","B"]',
        1,
      ),

      // Draft ratings — using realistic GIH WR from 17lands
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Liliana, Dreadhorde General",
        10_000,
        12_000,
        3000,
        0.642,
        0.66,
        0.62,
        0.5,
        0.12,
        1.2,
        1.24,
        0.5,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Elenda, Saint of Dusk",
        8000,
        10_000,
        2000,
        0.583,
        0.6,
        0.57,
        0.5,
        0.06,
        2,
        2.07,
        0.8,
      ),
      // Minimal ratings for pool cards (needed for signal axis)
      ...(
        [
          "Fleeting Distraction",
          "Helpful Hunter",
          "Strix Lookout",
          "Think Twice",
          "Faebloom Trick",
          "Refute",
          "Lightshell Duo",
          "Soul-Shackled Zombie",
          "Luminous Rebuke",
          "Evolving Wilds",
        ] as const
      ).map((name, index) =>
        env.DB.prepare(
          `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind("FDN", name, 5000, 7000, 2000, 0.51, 0.52, 0.5, 0.49, 0.01, 6 + index, 7 + index, 2),
      ),
    ]);

    const result = await draftAdvisorModule.execute(
      {
        set: "FDN",
        pool: [
          "Fleeting Distraction",
          "Helpful Hunter",
          "Helpful Hunter",
          "Strix Lookout",
          "Think Twice",
          "Faebloom Trick",
          "Refute",
          "Lightshell Duo",
          "Lightshell Duo",
          "Soul-Shackled Zombie",
          "Luminous Rebuke",
          "Evolving Wilds",
        ],
        pack: ["Liliana, Dreadhorde General", "Elenda, Saint of Dusk"],
        pick_number: 13,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const data = result.data as {
      recommendations: {
        card: string;
        composite_score: number;
        rank: number;
        axes: {
          castability: {
            raw: number;
            normalized: number;
            estimated_sources: number;
            potential_sources: number;
            effective_sources: number;
            source_model: SourceModel;
            bomb_dampening: number;
          };
        };
      }[];
    };

    const lili = data.recommendations.find((r) => r.card === "Liliana, Dreadhorde General");
    const elenda = data.recommendations.find((r) => r.card === "Elenda, Saint of Dusk");
    expect(lili).toBeDefined();
    expect(elenda).toBeDefined();

    // THE FIX: Liliana must rank above Elenda. Her 64.2% GIH WR dominates in
    // pack 1 where castability weight is near-zero.
    expect(lili!.rank).toBe(1);
    expect(lili!.composite_score).toBeGreaterThan(elenda!.composite_score);

    // Liliana's castability should be modeled as a pivot (BB, zero current black sources)
    expect(lili!.axes.castability.source_model).toBe("pivot");
    expect(lili!.axes.castability.raw).toBeGreaterThanOrEqual(0.5);

    // Bomb dampening: Liliana's elite baseline triggers positive dampening at pick 13
    expect(lili!.axes.castability.bomb_dampening).toBeGreaterThan(0);
    expect(lili!.axes.castability.normalized).toBeGreaterThan(lili!.axes.castability.raw);

    // Elenda's castability should be modeled as a splash (single B pip)
    expect(elenda!.axes.castability.source_model).toBe("splash");
  });

  // ── Bomb dampening tests ─────────────────────────────────

  it("applies zero bomb dampening to non-bomb cards", async () => {
    await seedContextualData();
    // Dark Filler has a mediocre GIH WR — below the bomb threshold
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(12, "oracle-filler", "Dark Filler", "Dark Filler", "{4}{B}{B}", 6, "Creature — Zombie", '["B"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Dark Filler", 5000, 7000, 2000, 0.50, 0.51, 0.49, 0.49, 0.0, 8, 9),
    ]);

    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Blazing Bolt", "Blazing Bolt", "Forest Bear"],
        pack: ["Dark Filler"],
        pick_number: 5,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      recommendations: { card: string; axes: { castability: { bomb_dampening: number } } }[];
    };
    const rec = data.recommendations.find((r) => r.card === "Dark Filler");
    expect(rec).toBeDefined();
    // 50% GIH WR → baselineNorm well below 0.80 → zero dampening
    expect(rec!.axes.castability.bomb_dampening).toBe(0);
  });

  it("applies zero bomb dampening in late draft regardless of card power", async () => {
    await seedContextualData();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(13, "oracle-latebomb", "Late Bomb", "Late Bomb", "{4}{B}{B}", 6, "Creature — Demon", '["B"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Late Bomb", 10_000, 12_000, 2000, 0.64, 0.66, 0.62, 0.5, 0.1, 1.5, 2),
    ]);

    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Blazing Bolt", "Blazing Bolt", "Forest Bear"],
        pack: ["Late Bomb"],
        pick_number: 35,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      recommendations: { card: string; axes: { castability: { bomb_dampening: number } } }[];
    };
    const rec = data.recommendations.find((r) => r.card === "Late Bomb");
    expect(rec).toBeDefined();
    // earlyFactor = max(0, 1 - 35/(42*0.6)) = max(0, 1-1.39) = 0 → zero dampening
    expect(rec!.axes.castability.bomb_dampening).toBe(0);
  });

  // ── Pivot-potential castability tests ─────────────────────

  it("scores double-pip off-color card as pivot at mid-draft", async () => {
    await seedContextualData();
    // Seed a BB card (like Liliana) — double black pip at CMC 6
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        10,
        "oracle-lili",
        "Dark Bomb",
        "Dark Bomb",
        "{4}{B}{B}",
        6,
        "Creature — Zombie",
        '["B"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Dark Bomb", 10_000, 12_000, 2000, 0.64, 0.66, 0.62, 0.5, 0.1, 1.5, 2),
    ]);

    // Pool is WU (no black pips) at pick 13
    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Blazing Bolt", "Blazing Bolt", "Forest Bear"], // R and G pips, no B
        pack: ["Dark Bomb"],
        pick_number: 13,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const data = result.data as {
      recommendations: {
        card: string;
        axes: {
          castability: {
            raw: number;
            estimated_sources: number;
            potential_sources: number;
            effective_sources: number;
            source_model: SourceModel;
          };
        };
      }[];
    };

    const rec = data.recommendations.find((r) => r.card === "Dark Bomb");
    expect(rec).toBeDefined();
    // Epic success criterion: BB at pick 13 with no black sources → castability ≥ 0.5
    expect(rec!.axes.castability.raw).toBeGreaterThanOrEqual(0.5);
    expect(rec!.axes.castability.estimated_sources).toBe(0);
    expect(rec!.axes.castability.potential_sources).toBeGreaterThan(0);
    expect(rec!.axes.castability.source_model).toBe("pivot");
  });

  it("scores single-pip off-color card as splash at mid-draft", async () => {
    await seedContextualData();
    // Seed a 1B card (like Elenda) — single black pip at CMC 4
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        11,
        "oracle-elenda",
        "Splash Bomb",
        "Splash Bomb",
        "{3}{B}",
        4,
        "Creature — Vampire",
        '["B"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Splash Bomb", 8000, 10_000, 2000, 0.583, 0.6, 0.56, 0.5, 0.06, 2.5, 3),
    ]);

    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Blazing Bolt", "Blazing Bolt", "Forest Bear"],
        pack: ["Splash Bomb"],
        pick_number: 13,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const data = result.data as {
      recommendations: {
        card: string;
        axes: {
          castability: {
            raw: number;
            source_model: SourceModel;
          };
        };
      }[];
    };

    const rec = data.recommendations.find((r) => r.card === "Splash Bomb");
    expect(rec).toBeDefined();
    // Epic success criterion: 1B at pick 13 → castability ≥ 0.6
    expect(rec!.axes.castability.raw).toBeGreaterThanOrEqual(0.6);
    expect(rec!.axes.castability.source_model).toBe("splash");
  });

  it("gives near-zero castability to double-pip off-color card late in draft", async () => {
    await seedContextualData();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        12,
        "oracle-late",
        "Late Bomb",
        "Late Bomb",
        "{4}{B}{B}",
        6,
        "Creature — Demon",
        '["B"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Late Bomb", 5000, 7000, 2000, 0.6, 0.62, 0.58, 0.5, 0.08, 2, 2.5),
    ]);

    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Blazing Bolt", "Blazing Bolt", "Forest Bear"],
        pack: ["Late Bomb"],
        pick_number: 38,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const data = result.data as {
      recommendations: {
        card: string;
        axes: { castability: { raw: number } };
      }[];
    };

    const rec = data.recommendations.find((r) => r.card === "Late Bomb");
    expect(rec).toBeDefined();
    // Epic success criterion: BB at pick 38 → castability < 0.1
    expect(rec!.axes.castability.raw).toBeLessThan(0.1);
  });

  it("uses 'current' source model for on-color cards", async () => {
    await seedContextualData();

    // Gloomlake Verge is {U}{B} — pool is full of UB cards, so it's on-color.
    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge", "Gloomlake Verge", "Gloomlake Verge"],
        pack: ["Gloomlake Verge"],
        pick_number: 13,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const data = result.data as {
      recommendations: {
        card: string;
        axes: {
          castability: {
            raw: number;
            source_model: SourceModel;
          };
        };
      }[];
    };

    const rec = data.recommendations.find((r) => r.card === "Gloomlake Verge");
    expect(rec).toBeDefined();
    // UB card in a UB pool — current sources are high, so source_model should be "current"
    expect(rec!.axes.castability.source_model).toBe("current");
  });

  it("counts Evolving Wilds produced_mana as sources", async () => {
    await seedContextualData();
    // Add Evolving Wilds with produced_mana for all 5 colors
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default, produced_mana) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        13,
        "oracle-ew",
        "Evolving Wilds",
        "Evolving Wilds",
        "",
        0,
        "Land",
        "[]",
        1,
        '["W","U","B","R","G"]',
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Evolving Wilds", 12_000, 15_000, 3000, 0.54, 0.55, 0.53, 0.49, 0.03, 6, 7),
      // A single-pip black card to test castability against
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        14,
        "oracle-sb2",
        "Black Splash",
        "Black Splash",
        "{3}{B}",
        4,
        "Creature — Horror",
        '["B"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Black Splash", 8000, 10_000, 2000, 0.56, 0.58, 0.54, 0.5, 0.04, 5, 6),
    ]);

    // Pool: UB cards + Evolving Wilds. Evolving Wilds should contribute black source.
    const withEW = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge", "Gloomlake Verge", "Evolving Wilds"],
        pack: ["Black Splash"],
        pick_number: 20,
      },
      env,
    );

    const withoutEW = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge", "Gloomlake Verge"],
        pack: ["Black Splash"],
        pick_number: 20,
      },
      env,
    );

    expect(withEW.type).toBe("structured");
    expect(withoutEW.type).toBe("structured");
    if (withEW.type !== "structured" || withoutEW.type !== "structured")
      throw new Error("unexpected type");

    const ewData = withEW.data as {
      recommendations: {
        card: string;
        axes: { castability: { estimated_sources: number } };
      }[];
    };
    const noEwData = withoutEW.data as {
      recommendations: {
        card: string;
        axes: { castability: { estimated_sources: number } };
      }[];
    };

    const ewRec = ewData.recommendations.find((r) => r.card === "Black Splash");
    const noEwRec = noEwData.recommendations.find((r) => r.card === "Black Splash");
    expect(ewRec).toBeDefined();
    expect(noEwRec).toBeDefined();

    // With Evolving Wilds, estimated (current) sources for black should be higher
    expect(ewRec!.axes.castability.estimated_sources).toBeGreaterThan(
      noEwRec!.axes.castability.estimated_sources,
    );
  });

  it("potential sources at pick 1 give high castability for off-color cards", async () => {
    await seedContextualData();
    // At pick 1, remainingPicks = 41, so even BB cards should get reasonable castability
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        15,
        "oracle-p1",
        "Pick One Bomb",
        "Pick One Bomb",
        "{4}{B}{B}",
        6,
        "Creature — Demon",
        '["B"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Pick One Bomb", 5000, 7000, 2000, 0.62, 0.64, 0.6, 0.5, 0.08, 1.5, 2),
    ]);

    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Forest Bear"],
        pack: ["Pick One Bomb", "Blazing Bolt"],
        pick_number: 1,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const data = result.data as {
      recommendations: {
        card: string;
        axes: { castability: { raw: number; source_model: SourceModel } };
      }[];
    };

    const rec = data.recommendations.find((r) => r.card === "Pick One Bomb");
    expect(rec).toBeDefined();
    // At pick 1 with 41 remaining picks, pivot model should give high castability
    // (replaces the old pick 1-5 dampening)
    expect(rec!.axes.castability.raw).toBeGreaterThanOrEqual(0.5);
    expect(rec!.axes.castability.source_model).toBe("pivot");
  });

  // ── Batch review tests ───────────────────────────────────

  it("evaluates every pick in batch review mode", async () => {
    await seedContextualData();

    const pickHistory = [
      { available: ["Blazing Bolt", "Forest Bear", "Gloomlake Verge"], chosen: "Gloomlake Verge" },
      { available: ["Blazing Bolt", "Forest Bear"], chosen: "Blazing Bolt" },
      { available: ["Forest Bear"], chosen: "Forest Bear" },
    ];

    const result = await draftAdvisorModule.execute({ set: "DSK", pick_history: pickHistory }, env);

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const data = result.data as {
      summary: {
        total_picks: number;
        optimal: number;
        good: number;
        questionable: number;
        misses: number;
        score: string;
      };
      picks: {
        pick_number: number;
        pack_number: number;
        pick_in_pack: number;
        chosen: string;
        chosen_rank: number;
        chosen_composite: number;
        recommended: string;
        recommended_composite: number;
        classification: string;
      }[];
    };

    // Should evaluate all 3 picks
    expect(data.summary.total_picks).toBe(3);
    expect(data.picks).toHaveLength(3);

    // Each pick should have compact structure (no full recommendations)
    for (const pick of data.picks) {
      expect(pick.pick_number).toBeGreaterThan(0);
      expect(pick.pack_number).toBeGreaterThan(0);
      expect(pick.chosen).toBeTruthy();
      expect(pick.chosen_rank).toBeGreaterThan(0);
      expect(typeof pick.chosen_composite).toBe("number");
      expect(pick.recommended).toBeTruthy();
      expect(["optimal", "good", "questionable", "miss"]).toContain(pick.classification);
      // Batch review should NOT include full recommendations (use live pick for detail)
      expect((pick as Record<string, unknown>).recommendations).toBeUndefined();
    }

    // Summary counts should add up
    expect(
      data.summary.optimal + data.summary.good + data.summary.questionable + data.summary.misses,
    ).toBe(data.summary.total_picks);
  });

  // ── Basic land filtering tests ──────────────────────────────

  async function seedBasicLand(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        9999,
        "oracle-mountain",
        "Mountain",
        "Mountain",
        "",
        0,
        "Basic Land — Mountain",
        "[]",
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Mountain", 49_000, 55_000, 6000, 0.576, 0.58, 0.57, 0.5, 0.02, 14, 13.9),
    ]);
  }

  it("excludes basic lands from live pick recommendations", async () => {
    await seedContextualData();
    await seedBasicLand();

    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge"],
        pack: ["Blazing Bolt", "Forest Bear", "Mountain"],
        pick_number: 5,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as { recommendations: { card: string }[] };
    const cardNames = data.recommendations.map((r) => r.card);
    expect(cardNames).not.toContain("Mountain");
    expect(cardNames).toHaveLength(2);
  });

  it("returns no scorable cards when pack is all basic lands", async () => {
    await seedContextualData();
    await seedBasicLand();

    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge"],
        pack: ["Mountain"],
        pick_number: 14,
      },
      env,
    );

    // All basics filtered → empty packMeta → early return with error
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as { error?: string; recommendations?: unknown[] };
    expect(data.error).toBeDefined();
    expect(data.recommendations).toBeUndefined();
  });

  it("skips basic land picks in batch review", async () => {
    await seedContextualData();
    await seedBasicLand();

    // Mountain is in the MIDDLE of pick_history — verifies it doesn't
    // pollute poolSoFar for the Forest Bear evaluation that follows it.
    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pick_history: [
          { available: ["Blazing Bolt", "Forest Bear", "Mountain"], chosen: "Blazing Bolt" },
          { available: ["Forest Bear", "Mountain"], chosen: "Mountain" },
          { available: ["Forest Bear", "Gloomlake Verge"], chosen: "Forest Bear" },
        ],
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      summary: {
        total_picks: number;
        optimal: number;
        good: number;
        questionable: number;
        misses: number;
      };
      picks: { chosen: string }[];
    };
    // Mountain pick should be skipped entirely
    expect(data.picks.map((p) => p.chosen)).not.toContain("Mountain");
    expect(data.summary.total_picks).toBe(2);
    expect(
      data.summary.optimal + data.summary.good + data.summary.questionable + data.summary.misses,
    ).toBe(2);
  });
});

// ── Color commitment model unit tests ────────────────────────

function makeCard(name: string, manaCost: string): CardMetaRow {
  return {
    name,
    cmc: 0,
    mana_cost: manaCost,
    colors: "[]",
    type_line: "Creature",
    produced_mana: "[]",
  };
}

describe("computeColorCommitment", () => {
  it("returns low commitment (~0.1) for colors with 0% of pips", () => {
    // Pool is all blue — green should have near-zero commitment
    const pool = [
      makeCard("Blue Card 1", "{U}{U}"),
      makeCard("Blue Card 2", "{U}{U}"),
      makeCard("Blue Card 3", "{U}"),
    ];
    const commitments = computeColorCommitment(pool, 10);
    expect(commitments.get("G")).toBeLessThan(0.15);
    expect(commitments.get("R")).toBeLessThan(0.15);
  });

  it("returns high commitment (~0.95+) for dominant color", () => {
    // Pool is overwhelmingly blue
    const pool = [
      makeCard("Blue 1", "{U}{U}"),
      makeCard("Blue 2", "{U}{U}"),
      makeCard("Blue 3", "{U}"),
      makeCard("Blue 4", "{U}{U}"),
      makeCard("Splash W", "{W}"),
    ];
    const commitments = computeColorCommitment(pool, 15);
    expect(commitments.get("U")).toBeGreaterThan(0.9);
  });

  it("returns moderate commitment (~0.5) for secondary color at ~15% pips", () => {
    // 7 blue pips, 2 white pips → white is ~22% of pips
    const pool = [
      makeCard("Blue 1", "{U}{U}"),
      makeCard("Blue 2", "{U}{U}"),
      makeCard("Blue 3", "{U}{U}"),
      makeCard("Blue 4", "{U}"),
      makeCard("White Splash", "{W}{W}"),
    ];
    const commitments = computeColorCommitment(pool, 15);
    const white = commitments.get("W")!;
    expect(white).toBeGreaterThan(0.3);
    expect(white).toBeLessThan(0.8);
  });

  it("dampens toward 0.2 for picks 1-5 (early-pick flattening)", () => {
    // Same pool at pick 1 vs pick 15
    const pool = [
      makeCard("Blue 1", "{U}{U}"),
      makeCard("Blue 2", "{U}{U}"),
    ];
    const earlyCommitments = computeColorCommitment(pool, 1);
    const midCommitments = computeColorCommitment(pool, 15);
    // At pick 1, all commitments should be close to 0.2
    const earlyBlue = earlyCommitments.get("U")!;
    const midBlue = midCommitments.get("U")!;
    expect(earlyBlue).toBeCloseTo(0.2, 0);
    expect(midBlue).toBeGreaterThan(earlyBlue);
  });

  it("returns uniform 0.2 for empty pool", () => {
    const commitments = computeColorCommitment([], 1);
    for (const color of ["W", "U", "B", "R", "G"]) {
      expect(commitments.get(color)).toBeCloseTo(0.2, 1);
    }
  });
});

describe("derivePairWeights", () => {
  it("gives UW highest weight when U is locked and W is secondary", () => {
    const commitments = new Map([
      ["W", 0.6],
      ["U", 0.99],
      ["B", 0.1],
      ["R", 0.1],
      ["G", 0.1],
    ]);
    const pairs = derivePairWeights(commitments);
    const uw = pairs.find((p) => p.colorPair === "WU");
    expect(uw).toBeDefined();
    expect(uw!.weight).toBeGreaterThan(0);
    // UW should be the top pair
    expect(pairs[0]!.colorPair).toBe("WU");
  });

  it("gives meaningful weight to UB/UR/UG when U is locked and others are open", () => {
    const commitments = new Map([
      ["W", 0.1],
      ["U", 0.99],
      ["B", 0.1],
      ["R", 0.1],
      ["G", 0.1],
    ]);
    const pairs = derivePairWeights(commitments);
    const ub = pairs.find((p) => p.colorPair === "UB")!;
    const ur = pairs.find((p) => p.colorPair === "UR")!;
    const ug = pairs.find((p) => p.colorPair === "UG")!;
    // All blue pairs should have roughly equal weight (open_bonus)
    expect(ub.weight).toBeGreaterThan(0.05);
    expect(ur.weight).toBeGreaterThan(0.05);
    expect(ug.weight).toBeGreaterThan(0.05);
    // They should be approximately equal
    expect(Math.abs(ub.weight - ur.weight)).toBeLessThan(0.02);
  });

  it("gives negligible weight to pairs with no locked color", () => {
    const commitments = new Map([
      ["W", 0.1],
      ["U", 0.99],
      ["B", 0.1],
      ["R", 0.1],
      ["G", 0.1],
    ]);
    const pairs = derivePairWeights(commitments);
    const br = pairs.find((p) => p.colorPair === "BR")!;
    // BR has two open colors and no locked one — should be minimal
    expect(br.weight).toBeLessThan(0.05);
  });

  it("normalizes weights to sum to 1.0", () => {
    const commitments = new Map([
      ["W", 0.6],
      ["U", 0.99],
      ["B", 0.1],
      ["R", 0.1],
      ["G", 0.1],
    ]);
    const pairs = derivePairWeights(commitments);
    const total = pairs.reduce((s, p) => s + p.weight, 0);
    expect(total).toBeCloseTo(1.0, 4);
  });

  it("returns _overall fallback when all commitments are near-zero", () => {
    const commitments = new Map([
      ["W", 0.0],
      ["U", 0.0],
      ["B", 0.0],
      ["R", 0.0],
      ["G", 0.0],
    ]);
    const pairs = derivePairWeights(commitments);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.colorPair).toBe("_overall");
    expect(pairs[0]!.weight).toBe(1.0);
  });
});
