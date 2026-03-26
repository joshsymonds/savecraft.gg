import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cardStatsModule } from "../../plugins/mtga/reference/card-stats";
import { draftAdvisorModule } from "../../plugins/mtga/reference/draft-advisor";
import {
  type CardMetaRow,
  computeColorCommitment,
  computeViabilityTier,
  deriveArchetypeWeights,
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
      `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("DSK", "Gloomlake Verge", "UB", 3000, 4000, 1000, 0.59, 0.63, 0.56, 0.49, 0.07, 7.2, 8),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", 1, 3.5, 1000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", 2, 5, 1000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", 3, 4, 1000),
    // Mono archetypes: with 31 candidates, mono colors can be the primary
    // archetype when commitment is high. Seed curves so curve scoring works.
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "U", 1, 3, 500),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "U", 2, 5, 500),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "U", 3, 4, 500),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "B", 1, 3, 500),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "B", 2, 5, 500),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "B", 3, 4, 500),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "G", 1, 3, 500),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "G", 2, 5, 500),
    env.DB.prepare(
      `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
    ).bind("DSK", "G", 3, 4, 500),

    env.DB.prepare(
      `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
    ).bind("oracle-2", "Blazing Bolt", "removal", "DSK"),

    // Deck stats: UB is a real archetype (5000 decks), RG has moderate (3000),
    // WG is marginal (100 decks = ~1% of total).
    env.DB.prepare(
      `INSERT INTO mtga_draft_deck_stats (set_code, archetype, avg_lands, avg_creatures, avg_noncreatures, avg_fixing, splash_rate, splash_avg_sources, splash_winrate, nonsplash_winrate, total_decks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("DSK", "UB", 17, 14, 5, 1, 0.2, 2, 0.52, 0.55, 5000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_deck_stats (set_code, archetype, avg_lands, avg_creatures, avg_noncreatures, avg_fixing, splash_rate, splash_avg_sources, splash_winrate, nonsplash_winrate, total_decks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("DSK", "RG", 17, 15, 4, 0.5, 0.1, 1, 0.5, 0.53, 3000),
    env.DB.prepare(
      `INSERT INTO mtga_draft_deck_stats (set_code, archetype, avg_lands, avg_creatures, avg_noncreatures, avg_fixing, splash_rate, splash_avg_sources, splash_winrate, nonsplash_winrate, total_decks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("DSK", "WG", 17, 15, 4, 0.5, 0.1, 1, 0.48, 0.49, 100),

    // Calibration: all 8 axes required (no hardcoded defaults in TS).
    // Card-intrinsic axes use percentile-based values for the DSK test set.
    // State-dependent axes use theoretical constants.
    env.DB.prepare(
      `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
    ).bind("DSK", "baseline", 0.535, 30),
    env.DB.prepare(
      `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
    ).bind("DSK", "synergy", 0, 10),
    env.DB.prepare(
      `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
    ).bind("DSK", "signal", 7, 0.5),
    env.DB.prepare(
      `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
    ).bind("DSK", "castability", 0.75, 8),
    env.DB.prepare(
      `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
    ).bind("DSK", "color_commitment", 0.5, 4),
    env.DB.prepare(
      `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
    ).bind("DSK", "opportunity_cost", 0.85, 8),
    env.DB.prepare(
      `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
    ).bind("DSK", "curve", 0, 3),
    env.DB.prepare(
      `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
    ).bind("DSK", "role", 0.3, 5),
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
        candidates: { archetype: string; weight: number }[];
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
          color_commitment: {
            raw: number;
            normalized: number;
            weight: number;
            contribution: number;
            color_fit: number;
          };
          opportunity_cost: {
            raw: number;
            normalized: number;
            weight: number;
            contribution: number;
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
          color_commitment: number;
          opportunity_cost: number;
        };
      }
    ).weights;
    expect(w.baseline).toBeGreaterThan(0);
    expect(w.synergy).toBeGreaterThan(0);
    expect(w.curve).toBeGreaterThan(0);
    expect(w.signal).toBeGreaterThan(0);
    expect(
      w.baseline +
        w.synergy +
        w.curve +
        w.signal +
        w.role +
        w.castability +
        w.color_commitment +
        w.opportunity_cost,
    ).toBeCloseTo(1, 1);

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
        "color_commitment",
        "opportunity_cost",
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

  it("scores on-color card higher on color_commitment than off-color card", async () => {
    await seedContextualData();

    // Pool is UB (Gloomlake Verge = {U}{B}). Blazing Bolt is {R} (off-color),
    // Forest Bear is {G}{G} (off-color). Both should have lower color_commitment
    // than a hypothetical on-color card. But we can compare: the UB pool means
    // U and B are committed. Blazing Bolt (R) and Forest Bear (G) are both off-color.
    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge", "Gloomlake Verge", "Gloomlake Verge"],
        pack: ["Blazing Bolt", "Forest Bear"],
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
          color_commitment: { raw: number; normalized: number; color_fit: number };
        };
      }[];
    };

    // Both cards are off-color in a UB pool — their color_fit should be low
    const blazing = data.recommendations.find((r) => r.card === "Blazing Bolt")!;
    const bear = data.recommendations.find((r) => r.card === "Forest Bear")!;
    expect(blazing.axes.color_commitment.color_fit).toBeLessThan(0.5);
    expect(bear.axes.color_commitment.color_fit).toBeLessThan(0.5);
  });

  it("uses max commitment across colors for multi-color card colorFit", async () => {
    await seedContextualData();

    // Pool is UB (3x Gloomlake Verge). Gloomlake Verge in the pack is {U}{B}.
    // colorFit should be max(commitment_U, commitment_B) — both are committed,
    // so colorFit should be high.
    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge", "Gloomlake Verge", "Gloomlake Verge"],
        pack: ["Gloomlake Verge", "Forest Bear"],
        pick_number: 15,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      recommendations: {
        card: string;
        axes: { color_commitment: { color_fit: number } };
      }[];
    };

    const gloomlake = data.recommendations.find((r) => r.card === "Gloomlake Verge")!;
    const bear = data.recommendations.find((r) => r.card === "Forest Bear")!;
    // Gloomlake Verge is on-color (UB in UB pool) — high colorFit
    // Forest Bear is off-color (GG in UB pool) — low colorFit
    expect(gloomlake.axes.color_commitment.color_fit).toBeGreaterThan(
      bear.axes.color_commitment.color_fit,
    );
    expect(gloomlake.axes.color_commitment.color_fit).toBeGreaterThan(0.5);
  });

  it("gives off-color card higher opportunity cost than on-color card", async () => {
    await seedContextualData();

    // Pool has Blazing Bolt (R) and Forest Bear (GG) — committed to RG.
    // Pack has Gloomlake Verge (UB, off-color) and Forest Bear (GG, on-color).
    // Gloomlake Verge implies a pair with U or B — stranding the R and G cards.
    // Forest Bear is on-color (G is committed) — no stranding.
    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Blazing Bolt", "Blazing Bolt", "Forest Bear", "Forest Bear", "Forest Bear"],
        pack: ["Gloomlake Verge", "Forest Bear"],
        pick_number: 15,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      recommendations: {
        card: string;
        axes: { opportunity_cost: { raw: number } };
      }[];
    };

    const gloomlake = data.recommendations.find((r) => r.card === "Gloomlake Verge")!;
    const bear = data.recommendations.find((r) => r.card === "Forest Bear")!;
    // Forest Bear is on-color (RG pool) — should have higher opportunity score
    // Gloomlake Verge is off-color — should strand R and G cards
    expect(bear.axes.opportunity_cost.raw).toBeGreaterThan(gloomlake.axes.opportunity_cost.raw);
    expect(gloomlake.axes.opportunity_cost.raw).toBeLessThan(1);
  });

  it("gives colorless pack card opportunity cost of 1.0", async () => {
    await seedContextualData();
    // Add Evolving Wilds (colorless land with produced_mana) to cards table
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, produced_mana, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        10,
        "oracle-ew",
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
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Evolving Wilds", 5000, 8000, 3000, 0.54, 0.55, 0.52, 0.5, 0.02, 6, 5),
    ]);

    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["Gloomlake Verge", "Gloomlake Verge"],
        pack: ["Evolving Wilds", "Forest Bear"],
        pick_number: 10,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      recommendations: {
        card: string;
        axes: { opportunity_cost: { raw: number } };
      }[];
    };

    const ew = data.recommendations.find((r) => r.card === "Evolving Wilds")!;
    expect(ew.axes.opportunity_cost.raw).toBe(1);
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
        `INSERT INTO mtga_draft_role_targets (set_code, archetype, role, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
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
      // Calibration for all 8 axes (required — no TS defaults).
      ...(
        [
          ["baseline", 0.535, 30],
          ["synergy", 0, 10],
          ["signal", 7, 0.5],
          ["castability", 0.75, 8],
          ["color_commitment", 0.5, 4],
          ["opportunity_cost", 0.85, 8],
          ["curve", 0, 3],
          ["role", 0.3, 5],
        ] as const
      ).map(([axis, center, steepness]) =>
        env.DB.prepare(
          `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
        ).bind("FDN", axis, center, steepness),
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

  // Shared seed for realistic FDN Liliana scenarios (production data).
  async function seedRealisticFDN(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "PremierDraft", 500_000, 20, 0.515),
      // Pool cards (same as existing Liliana test)
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
      ).bind(101, "o-hh", "Helpful Hunter", "Helpful Hunter", "{1}{W}", 2, "Creature", '["W"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(102, "o-sl", "Strix Lookout", "Strix Lookout", "{U}", 1, "Creature", '["U"]', 1),
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
      ).bind(106, "o-ld", "Lightshell Duo", "Lightshell Duo", "{3}{U}", 4, "Creature", '["U"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        107,
        "o-ssz",
        "Soul-Shackled Zombie",
        "Soul-Shackled Zombie",
        "{1}{B}",
        2,
        "Creature",
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
      // Pack cards (Liliana + Elenda from existing test, plus 6 more)
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        110,
        "o-lili",
        "Liliana, Dreadhorde General",
        "Liliana, Dreadhorde General",
        "{4}{B}{B}",
        6,
        "Legendary Planeswalker",
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
        "Legendary Creature",
        '["W","B"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        112,
        "o-iitm",
        "Imprisoned in the Moon",
        "Imprisoned in the Moon",
        "{2}{U}",
        3,
        "Enchantment — Aura",
        '["U"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        113,
        "o-fa",
        "Fiery Annihilation",
        "Fiery Annihilation",
        "{2}{R}",
        3,
        "Sorcery",
        '["R"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        114,
        "o-hr",
        "Heroic Reinforcements",
        "Heroic Reinforcements",
        "{2}{R}{W}",
        4,
        "Sorcery",
        '["R","W"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        115,
        "o-ag",
        "Armasaur Guide",
        "Armasaur Guide",
        "{4}{W}",
        5,
        "Creature — Dinosaur",
        '["W"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        116,
        "o-ms",
        "Mocking Sprite",
        "Mocking Sprite",
        "{2}{U}",
        3,
        "Creature — Faerie",
        '["U"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        117,
        "o-cf",
        "Crypt Feaster",
        "Crypt Feaster",
        "{2}{B}",
        3,
        "Creature — Zombie",
        '["B"]',
        1,
      ),
      // Ratings for all cards
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Liliana, Dreadhorde General",
        10_000,
        12_000,
        3000,
        0.6412,
        0.66,
        0.62,
        0.5,
        0.12,
        1.2,
        1.24,
        0.6013,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Elenda, Saint of Dusk",
        8000,
        10_000,
        2000,
        0.6154,
        0.63,
        0.6,
        0.5,
        0.1,
        2,
        2.0662,
        1.5732,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Imprisoned in the Moon",
        7000,
        9000,
        2000,
        0.5005,
        0.51,
        0.5,
        0.5,
        0,
        7.836,
        7.836,
        3.4173,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Fiery Annihilation",
        6000,
        8000,
        2000,
        0.5817,
        0.59,
        0.58,
        0.5,
        0.08,
        3.4674,
        3.4674,
        2.1816,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Heroic Reinforcements",
        5000,
        7000,
        2000,
        0.5578,
        0.57,
        0.55,
        0.49,
        0.06,
        6.0336,
        6.0336,
        3.4022,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Armasaur Guide",
        4000,
        6000,
        2000,
        0.5052,
        0.51,
        0.5,
        0.49,
        0.01,
        10.7973,
        10.7973,
        2.5215,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Mocking Sprite",
        5000,
        7000,
        2000,
        0.4998,
        0.5,
        0.5,
        0.5,
        0,
        9.6963,
        9.6963,
        3.0962,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Crypt Feaster",
        4000,
        6000,
        2000,
        0.5038,
        0.51,
        0.5,
        0.5,
        0,
        11.3835,
        11.3835,
        2.2789,
      ),
      // Pool card ratings from production D1
      ...(
        [
          [
            "Fleeting Distraction",
            5000,
            7000,
            2000,
            0.5483,
            0.55,
            0.54,
            0.49,
            0.01,
            8.036,
            8.036,
            3.2359,
          ],
          [
            "Helpful Hunter",
            5000,
            7000,
            2000,
            0.5745,
            0.58,
            0.57,
            0.49,
            0.01,
            4.4729,
            4.4729,
            2.478,
          ],
          [
            "Strix Lookout",
            5000,
            7000,
            2000,
            0.5496,
            0.55,
            0.54,
            0.49,
            0.01,
            7.0549,
            7.0549,
            3.1916,
          ],
          ["Think Twice", 5000, 7000, 2000, 0.5658, 0.57, 0.56, 0.49, 0.01, 6.4807, 6.4807, 3.1259],
          [
            "Faebloom Trick",
            5000,
            7000,
            2000,
            0.5908,
            0.6,
            0.58,
            0.49,
            0.01,
            3.6875,
            3.6875,
            2.3187,
          ],
          ["Refute", 5000, 7000, 2000, 0.5755, 0.58, 0.57, 0.49, 0.01, 7.0905, 7.0905, 3.3091],
          [
            "Lightshell Duo",
            5000,
            7000,
            2000,
            0.5572,
            0.56,
            0.55,
            0.49,
            0.01,
            9.5006,
            9.5006,
            3.0608,
          ],
          [
            "Soul-Shackled Zombie",
            5000,
            7000,
            2000,
            0.5505,
            0.56,
            0.54,
            0.49,
            0.01,
            9.2303,
            9.2303,
            3.0107,
          ],
          [
            "Luminous Rebuke",
            5000,
            7000,
            2000,
            0.5771,
            0.58,
            0.57,
            0.49,
            0.01,
            5.2066,
            5.2066,
            2.7506,
          ],
          [
            "Evolving Wilds",
            5000,
            7000,
            2000,
            0.5459,
            0.55,
            0.54,
            0.49,
            0.01,
            6.6791,
            6.6791,
            2.6879,
          ],
        ] as const
      ).map(([name, ...vals]) =>
        env.DB.prepare(
          `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind("FDN", name, ...vals),
      ),
      // Production color stats: per-archetype GIH WR for pack cards.
      // Liliana has UB/WB stats but NO WU stats (rarely in WU decks).
      // Elenda has WU/WB/UB stats — boosted in WB (0.6387).
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Liliana, Dreadhorde General",
        "UB",
        3000,
        4000,
        1000,
        0.6558,
        0.67,
        0.64,
        0.5,
        0.14,
        1.2,
        1.24,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Liliana, Dreadhorde General",
        "WB",
        2000,
        3000,
        1000,
        0.6595,
        0.67,
        0.65,
        0.5,
        0.15,
        1.2,
        1.24,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Liliana, Dreadhorde General",
        "WU",
        500,
        800,
        200,
        0.6347,
        0.65,
        0.62,
        0.5,
        0.12,
        1.2,
        1.24,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Elenda, Saint of Dusk",
        "WU",
        2000,
        3000,
        1000,
        0.5751,
        0.59,
        0.57,
        0.5,
        0.07,
        2,
        2.07,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Elenda, Saint of Dusk",
        "WB",
        3000,
        4000,
        1000,
        0.6387,
        0.65,
        0.63,
        0.5,
        0.13,
        2,
        2.07,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Elenda, Saint of Dusk",
        "UB",
        1500,
        2000,
        500,
        0.588,
        0.6,
        0.58,
        0.5,
        0.08,
        2,
        2.07,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Imprisoned in the Moon",
        "WU",
        3000,
        4000,
        1000,
        0.5164,
        0.52,
        0.51,
        0.5,
        0.01,
        7.8,
        7.8,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Fiery Annihilation",
        "WU",
        2000,
        3000,
        1000,
        0.5946,
        0.6,
        0.59,
        0.5,
        0.09,
        3.5,
        4,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Mocking Sprite",
        "WU",
        2000,
        3000,
        1000,
        0.5186,
        0.53,
        0.51,
        0.5,
        0.01,
        9.7,
        9.7,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FDN",
        "Armasaur Guide",
        "WU",
        1000,
        2000,
        500,
        0.4952,
        0.5,
        0.49,
        0.49,
        0,
        10.8,
        10.8,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("FDN", "Crypt Feaster", "UB", 1500, 2000, 500, 0.5066, 0.51, 0.5, 0.5, 0, 11.4, 11.4),
      // Synergies: Elenda has positive synergy with WU pool, Liliana has none
      env.DB.prepare(
        `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "Elenda, Saint of Dusk", "Helpful Hunter", 0.0234, 500),
      env.DB.prepare(
        `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "Elenda, Saint of Dusk", "Luminous Rebuke", 0.0224, 400),
      env.DB.prepare(
        `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "Elenda, Saint of Dusk", "Refute", 0.0227, 300),
      env.DB.prepare(
        `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "Elenda, Saint of Dusk", "Strix Lookout", 0.0171, 300),
      env.DB.prepare(
        `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "Elenda, Saint of Dusk", "Think Twice", 0.0154, 300),
      env.DB.prepare(
        `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "Elenda, Saint of Dusk", "Evolving Wilds", 0.0097, 200),
      // Production archetype curves for WU
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", 0, 3.3333, 52_087),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", 1, 2.4387, 52_087),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", 2, 4.9018, 52_087),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", 3, 5.0339, 52_087),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", 4, 3.6567, 52_087),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", 5, 1.9489, 52_087),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", 6, 0.5642, 52_087),
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", 7, 0.2927, 52_087),
      // Production card roles (from production D1)
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("o-lili", "Liliana, Dreadhorde General", "removal", "FDN"),
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("o-lili", "Liliana, Dreadhorde General", "cabs", "FDN"),
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("o-iitm", "Imprisoned in the Moon", "removal", "FDN"),
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("o-fa", "Fiery Annihilation", "removal", "FDN"),
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("o-fa", "Fiery Annihilation", "cabs", "FDN"),
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("o-elenda", "Elenda, Saint of Dusk", "creature", "FDN"),
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("o-elenda", "Elenda, Saint of Dusk", "cabs", "FDN"),
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("o-cf", "Crypt Feaster", "creature", "FDN"),
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("o-cf", "Crypt Feaster", "cabs", "FDN"),
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("o-ms", "Mocking Sprite", "creature", "FDN"),
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("o-ag", "Armasaur Guide", "creature", "FDN"),
      env.DB.prepare(
        `INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("o-ag", "Armasaur Guide", "cabs", "FDN"),
      // Production role targets for WU
      env.DB.prepare(
        `INSERT INTO mtga_draft_role_targets (set_code, archetype, role, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", "removal", 4.9243, 52_087),
      env.DB.prepare(
        `INSERT INTO mtga_draft_role_targets (set_code, archetype, role, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", "creature", 11.9805, 52_087),
      env.DB.prepare(
        `INSERT INTO mtga_draft_role_targets (set_code, archetype, role, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", "cabs", 16.316, 52_087),
      env.DB.prepare(
        `INSERT INTO mtga_draft_role_targets (set_code, archetype, role, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", "noncreature_nonremoval", 5.4901, 52_087),
      env.DB.prepare(
        `INSERT INTO mtga_draft_role_targets (set_code, archetype, role, avg_count, total_decks) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", "mana_fixing", 0.7828, 52_087),
      // Production deck stats
      env.DB.prepare(
        `INSERT INTO mtga_draft_deck_stats (set_code, archetype, avg_lands, avg_creatures, avg_noncreatures, avg_fixing, splash_rate, splash_avg_sources, splash_winrate, nonsplash_winrate, total_decks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("FDN", "WU", 17, 14, 5, 1, 0.2, 2, 0.52, 0.55, 52_087),
      env.DB.prepare(
        `INSERT INTO mtga_draft_deck_stats (set_code, archetype, avg_lands, avg_creatures, avg_noncreatures, avg_fixing, splash_rate, splash_avg_sources, splash_winrate, nonsplash_winrate, total_decks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("FDN", "UB", 17, 14, 5, 1, 0.2, 2, 0.51, 0.53, 57_137),
      env.DB.prepare(
        `INSERT INTO mtga_draft_deck_stats (set_code, archetype, avg_lands, avg_creatures, avg_noncreatures, avg_fixing, splash_rate, splash_avg_sources, splash_winrate, nonsplash_winrate, total_decks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("FDN", "WB", 17, 14, 5, 1, 0.2, 2, 0.52, 0.54, 68_040),
      // Calibration from real pipeline output (3.0 percentile constant).
      // Card-intrinsic axes: percentile-calibrated from FDN 17Lands data.
      // State-dependent axes: theoretical constants from bounded ranges.
      ...(
        [
          ["baseline", 0.5462, 32.2729],
          ["synergy", -1.2402, 0.418],
          ["signal", 6.4154, 0.3693],
          ["castability", 0.75, 8],
          ["color_commitment", 0.5, 4],
          ["opportunity_cost", 0.85, 8],
          ["curve", 0, 3],
          ["role", 0.3, 5],
        ] as const
      ).map(([axis, center, steepness]) =>
        env.DB.prepare(
          `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
        ).bind("FDN", axis, center, steepness),
      ),
    ]);
  }

  it("ranks Liliana #1 in realistic 8-card P2P1 pack with WU pool", async () => {
    // Full scenario from Reddit: P2P1, 8-card pack, 12-card WU pool.
    // Liliana (4BB, 64.1%) must rank above Elenda (2WB, 61.5%) despite
    // being off-color. Additional pack cards seed the full context.
    await seedRealisticFDN();

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
        pack: [
          "Liliana, Dreadhorde General",
          "Elenda, Saint of Dusk",
          "Imprisoned in the Moon",
          "Fiery Annihilation",
          "Heroic Reinforcements",
          "Armasaur Guide",
          "Mocking Sprite",
          "Crypt Feaster",
        ],
        pick_number: 15,
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
      }[];
    };

    const lili = data.recommendations.find((r) => r.card === "Liliana, Dreadhorde General")!;
    const elenda = data.recommendations.find((r) => r.card === "Elenda, Saint of Dusk")!;
    expect(lili).toBeDefined();
    expect(elenda).toBeDefined();

    // Liliana (64.1% GIH WR bomb) must rank above Elenda (61.5%) at P2P1.
    // A 3-point GIH WR gap between a format-defining mythic and a good rare
    // must not be erased by color commitment + opportunity cost penalties.
    expect(lili.rank).toBe(1);
    expect(lili.composite_score).toBeGreaterThan(elenda.composite_score);
  });

  it("ranks Elenda above Liliana at pick 25 (mid pack 2) with WU pool", async () => {
    // Same scenario but deeper into pack 2. By pick 25, castability,
    // color commitment, and opportunity cost weights have risen enough
    // that Elenda's on-color advantage should clearly dominate Liliana's
    // raw power. This validates the pick-adaptive weight progression.
    await seedRealisticFDN();

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
        pick_number: 25,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      recommendations: { card: string; composite_score: number; rank: number }[];
    };

    const lili = data.recommendations.find((r) => r.card === "Liliana, Dreadhorde General")!;
    const elenda = data.recommendations.find((r) => r.card === "Elenda, Saint of Dusk")!;
    expect(elenda.rank).toBe(1);
    expect(elenda.composite_score).toBeGreaterThan(lili.composite_score);
  });

  it("ranks Elenda far above Liliana at pick 35 (late pack 3) with WU pool", async () => {
    // Late pack 3: castability and color commitment dominate. Liliana's
    // double-black is nearly uncastable in a committed WU deck. The gap
    // should be substantial — not close at all.
    await seedRealisticFDN();

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
        pick_number: 35,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      recommendations: { card: string; composite_score: number; rank: number }[];
    };

    const lili = data.recommendations.find((r) => r.card === "Liliana, Dreadhorde General")!;
    const elenda = data.recommendations.find((r) => r.card === "Elenda, Saint of Dusk")!;
    expect(elenda.rank).toBe(1);
    // At pick 35, the gap should be substantial (>5 cents).
    expect(elenda.composite_score - lili.composite_score).toBeGreaterThan(0.05);
  });

  // ── Bomb dampening tests ─────────────────────────────────

  it("applies zero bomb dampening to non-bomb cards", async () => {
    await seedContextualData();
    // Dark Filler has a mediocre GIH WR — below the bomb threshold
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        12,
        "oracle-filler",
        "Dark Filler",
        "Dark Filler",
        "{4}{B}{B}",
        6,
        "Creature — Zombie",
        '["B"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Dark Filler", 5000, 7000, 2000, 0.5, 0.51, 0.49, 0.49, 0, 8, 9),
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
      ).bind(
        13,
        "oracle-latebomb",
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
        archetype_snapshot: {
          primary: string;
          confidence: number;
          viability: string;
        };
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
      // Archetype snapshot should be present per pick
      expect(pick.archetype_snapshot).toBeDefined();
      expect(pick.archetype_snapshot.primary).toBeTruthy();
      expect(typeof pick.archetype_snapshot.confidence).toBe("number");
      expect(["strong", "moderate", "sparse", "fringe"]).toContain(
        pick.archetype_snapshot.viability,
      );
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

  it("includes deck_count and deck_share in archetype candidates", async () => {
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
        candidates: {
          archetype: string;
          weight: number;
          deck_count: number;
          deck_share: number;
          viability: string;
          format_context: string;
        }[];
      };
    };

    // At least one candidate should have deck_count and deck_share
    const withStats = data.archetype.candidates.filter((c) => c.deck_count > 0);
    expect(withStats.length).toBeGreaterThan(0);
    // deck_share should be between 0 and 1
    for (const c of withStats) {
      expect(c.deck_share).toBeGreaterThan(0);
      expect(c.deck_share).toBeLessThanOrEqual(1);
    }
    // viability and format_context should be present on all candidates
    for (const c of data.archetype.candidates) {
      expect(["strong", "moderate", "sparse", "fringe"]).toContain(c.viability);
      expect(c.format_context).toContain("% of decks");
      expect(c.format_context).toContain("format avg:");
    }
  });

  it("suppresses low-viability color pairs from archetype candidates", async () => {
    await seedContextualData();

    // Pool with some white and green pips — but WG only has 100 decks (<2%)
    // Need to add a white card first
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        20,
        "oracle-wp",
        "White Pilgrim",
        "White Pilgrim",
        "{W}{W}",
        2,
        "Creature",
        '["W"]',
        1,
      ),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "White Pilgrim", 3000, 5000, 2000, 0.51, 0.52, 0.5, 0.49, 0.01, 8, 9),
    ]);

    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pool: ["White Pilgrim", "Forest Bear"],
        pack: ["Blazing Bolt", "Forest Bear"],
        pick_number: 10,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      archetype: {
        candidates: { archetype: string; deck_count: number; deck_share: number }[];
      };
    };

    // WG should be suppressed (100 decks out of 8100 total = 1.2%)
    const wg = data.archetype.candidates.find((c) => c.archetype === "WG");
    expect(wg).toBeUndefined();
  });

  it("includes display_label in batch review picks", async () => {
    await seedContextualData();

    const result = await draftAdvisorModule.execute(
      {
        set: "DSK",
        pick_history: [
          { available: ["Blazing Bolt", "Forest Bear"], chosen: "Blazing Bolt" },
          { available: ["Forest Bear", "Gloomlake Verge"], chosen: "Forest Bear" },
        ],
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      picks: {
        pick_number: number;
        pack_number: number;
        pick_in_pack: number;
        display_label: string;
      }[];
    };

    expect(data.picks[0]!.display_label).toBe("P1P1");
    expect(data.picks[1]!.display_label).toBe("P1P2");
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
    const pool = [makeCard("Blue 1", "{U}{U}"), makeCard("Blue 2", "{U}{U}")];
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

describe("deriveArchetypeWeights", () => {
  it("returns 26 candidates (mono suppressed)", () => {
    const commitments = new Map([
      ["W", 0.6],
      ["U", 0.99],
      ["B", 0.1],
      ["R", 0.1],
      ["G", 0.1],
    ]);
    const candidates = deriveArchetypeWeights(commitments);
    // 10 pair + 10 triple + 5 quad + 1 five-color = 26 (no mono)
    expect(candidates).toHaveLength(26);
  });

  it("gives WU highest weight when U is locked and W is secondary", () => {
    const commitments = new Map([
      ["W", 0.6],
      ["U", 0.99],
      ["B", 0.1],
      ["R", 0.1],
      ["G", 0.1],
    ]);
    const candidates = deriveArchetypeWeights(commitments);
    // With mono suppressed, WU pair is the top candidate
    expect(candidates[0]!.archetype).toBe("WU");
  });

  it("does not include mono-color candidates", () => {
    const commitments = new Map([
      ["W", 0.1],
      ["U", 0.99],
      ["B", 0.1],
      ["R", 0.1],
      ["G", 0.1],
    ]);
    const candidates = deriveArchetypeWeights(commitments);
    const monos = candidates.filter((c) => c.archetype.length === 1);
    expect(monos).toHaveLength(0);
  });

  it("gives meaningful weight to UB/UR/UG when U is locked and others are open", () => {
    const commitments = new Map([
      ["W", 0.1],
      ["U", 0.99],
      ["B", 0.1],
      ["R", 0.1],
      ["G", 0.1],
    ]);
    const candidates = deriveArchetypeWeights(commitments);
    const ub = candidates.find((p) => p.archetype === "UB")!;
    const ur = candidates.find((p) => p.archetype === "UR")!;
    const ug = candidates.find((p) => p.archetype === "UG")!;
    expect(ub.weight).toBeGreaterThan(0.02);
    expect(ur.weight).toBeGreaterThan(0.02);
    expect(ug.weight).toBeGreaterThan(0.02);
    expect(Math.abs(ub.weight - ur.weight)).toBeLessThan(0.02);
  });

  it("normalizes all 26 weights to sum to 1.0", () => {
    const commitments = new Map([
      ["W", 0.6],
      ["U", 0.99],
      ["B", 0.1],
      ["R", 0.1],
      ["G", 0.1],
    ]);
    const candidates = deriveArchetypeWeights(commitments);
    const total = candidates.reduce((s, p) => s + p.weight, 0);
    expect(total).toBeCloseTo(1, 4);
  });

  it("returns _overall fallback when all commitments are near-zero", () => {
    const commitments = new Map([
      ["W", 0],
      ["U", 0],
      ["B", 0],
      ["R", 0],
      ["G", 0],
    ]);
    const candidates = deriveArchetypeWeights(commitments);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.archetype).toBe("_overall");
    expect(candidates[0]!.weight).toBe(1);
  });

  it("never lets a mono archetype be the primary", () => {
    // Even with extreme single-color commitment, mono is suppressed
    const commitments = new Map([
      ["W", 0.01],
      ["U", 0.99],
      ["B", 0.01],
      ["R", 0.01],
      ["G", 0.01],
    ]);
    const candidates = deriveArchetypeWeights(commitments);
    expect(candidates[0]!.archetype.length).toBeGreaterThanOrEqual(2);
    // The top candidate should be a U-pair (UW, UB, UR, or UG)
    expect(candidates[0]!.archetype).toContain("U");
  });

  it("uses pure product for triple-color weights", () => {
    // High commitment to all 3 colors of WUB
    const commitments = new Map([
      ["W", 0.8],
      ["U", 0.7],
      ["B", 0.6],
      ["R", 0.1],
      ["G", 0.1],
    ]);
    const candidates = deriveArchetypeWeights(commitments);
    const wub = candidates.find((p) => p.archetype === "WUB")!;
    const wur = candidates.find((p) => p.archetype === "WUR")!;
    // WUB (0.8*0.7*0.6 = 0.336) should be much higher than WUR (0.8*0.7*0.1 = 0.056)
    expect(wub.weight).toBeGreaterThan(wur.weight * 3);
  });

  it("gives vanishingly small weight to 4/5-color combos in typical drafts", () => {
    const commitments = new Map([
      ["W", 0.5],
      ["U", 0.5],
      ["B", 0.5],
      ["R", 0.5],
      ["G", 0.5],
    ]);
    const candidates = deriveArchetypeWeights(commitments);
    const fiveColor = candidates.find((p) => p.archetype === "WUBRG")!;
    const fourColor = candidates.find((p) => p.archetype === "WUBR")!;
    const pair = candidates.find((p) => p.archetype === "WU")!;
    // 5-color product (0.5^5 = 0.03125) << pair weight
    expect(fiveColor.weight).toBeLessThan(pair.weight);
    expect(fourColor.weight).toBeLessThan(pair.weight);
  });

  it("preserves open-bonus for pairs only (not triples)", () => {
    // One locked color (U=0.99), one open (W=0.1)
    // Pair WU gets open bonus: 0.99*0.1 + 0.3*(1-0.99)*0.1 + 0.3*0.99*(1-0.1)
    // Triple WUB pure product: 0.99*0.1*0.1 = 0.0099
    const commitments = new Map([
      ["W", 0.1],
      ["U", 0.99],
      ["B", 0.1],
      ["R", 0.1],
      ["G", 0.1],
    ]);
    const candidates = deriveArchetypeWeights(commitments);
    const wu = candidates.find((p) => p.archetype === "WU")!;
    const wub = candidates.find((p) => p.archetype === "WUB")!;
    // Pair with open bonus >> triple pure product
    expect(wu.weight).toBeGreaterThan(wub.weight * 5);
  });
});

describe("Bayesian shrinkage", () => {
  beforeEach(async () => {
    await cleanAll(env.DB);
  });

  it("blends sparse archetype GIH WR toward overall mean", async () => {
    // Card has overall GIH WR 0.55. In archetype "U" it has 0.70 but
    // only 10 games — the archetype stat is unreliable.
    // With Bayesian shrinkage (prior ~750), effective ≈ (10*0.70 + 750*0.55) / 760 ≈ 0.552
    // Without shrinkage, the archetype-specific 0.70 would dominate.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr) VALUES (?, ?, ?, ?, ?)`,
      ).bind("TST", "PremierDraft", 100_000, 1, 0.55),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("TST", "Test Card", 50_000, 70_000, 20_000, 0.55, 0.55, 0.55, 0.55, 0, 5, 5),
      // Archetype "U" has very few games — should be shrunk heavily
      env.DB.prepare(
        `INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("TST", "Test Card", "U", 10, 15, 5, 0.7, 0.7, 0.7, 0.55, 0.15, 5, 5),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(1, "o-1", "Test Card", "Test Card", "{U}", 1, "Creature", '["U"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(2, "o-2", "Pool Card", "Pool Card", "{U}", 1, "Creature", '["U"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("TST", "Pool Card", 50_000, 70_000, 20_000, 0.55, 0.55, 0.55, 0.55, 0, 5, 5),
      // Calibration: all required axes + archetype_prior
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("TST", "baseline", 0.55, 30),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("TST", "synergy", 0, 10),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("TST", "signal", 5, 1),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("TST", "castability", 0.75, 8),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("TST", "color_commitment", 0.5, 4),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("TST", "opportunity_cost", 0.85, 8),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("TST", "curve", 0, 3),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("TST", "role", 0.3, 5),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("TST", "archetype_prior", 750, 0),
    ]);

    const result = await draftAdvisorModule.execute(
      {
        set: "TST",
        pool: ["Pool Card"],
        pack: ["Test Card"],
        pick_number: 15,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      recommendations: { card: string; axes: { baseline: { raw: number } } }[];
    };
    const rec = data.recommendations.find((r) => r.card === "Test Card");
    expect(rec).toBeDefined();
    // With shrinkage: effective ≈ (10*0.70 + 750*0.55) / 760 ≈ 0.552
    // WITHOUT shrinkage: would use 0.70 directly
    // The baseline raw score should be close to 0.552, not 0.70
    expect(rec!.axes.baseline.raw).toBeLessThan(0.6);
    expect(rec!.axes.baseline.raw).toBeGreaterThan(0.54);
  });

  it("shrinks sparse synergy deltas toward zero", async () => {
    // Card pair has synergy_delta 0.10 but only 5 games together.
    // With synergy_prior = 75: effective = (5 * 0.10) / (5 + 75) = 0.00625
    // Without shrinkage: synergy sum would be 0.10
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr) VALUES (?, ?, ?, ?, ?)`,
      ).bind("SYN", "PremierDraft", 100_000, 2, 0.55),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("SYN", "Pack Card", 50_000, 70_000, 20_000, 0.55, 0.55, 0.55, 0.55, 0, 5, 5),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("SYN", "Pool Card", 50_000, 70_000, 20_000, 0.55, 0.55, 0.55, 0.55, 0, 5, 5),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(1, "o-1", "Pack Card", "Pack Card", "{U}", 1, "Creature", '["U"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(2, "o-2", "Pool Card", "Pool Card", "{U}", 1, "Creature", '["U"]', 1),
      // Sparse synergy: high delta but very few games
      env.DB.prepare(
        `INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (?, ?, ?, ?, ?)`,
      ).bind("SYN", "Pack Card", "Pool Card", 0.1, 5),
      // Calibration
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("SYN", "baseline", 0.55, 30),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("SYN", "synergy", 0, 10),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("SYN", "signal", 5, 1),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("SYN", "castability", 0.75, 8),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("SYN", "color_commitment", 0.5, 4),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("SYN", "opportunity_cost", 0.85, 8),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("SYN", "curve", 0, 3),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("SYN", "role", 0.3, 5),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("SYN", "synergy_prior", 75, 0),
    ]);

    const result = await draftAdvisorModule.execute(
      {
        set: "SYN",
        pool: ["Pool Card"],
        pack: ["Pack Card"],
        pick_number: 15,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      recommendations: { card: string; axes: { synergy: { raw: number } } }[];
    };
    const rec = data.recommendations.find((r) => r.card === "Pack Card");
    expect(rec).toBeDefined();
    // With shrinkage: effective = (5 * 0.10) / (5 + 75) = 0.00625
    // Without shrinkage: would be 0.10
    // Raw synergy should be heavily dampened
    expect(rec!.axes.synergy.raw).toBeLessThan(0.02);
    expect(rec!.axes.synergy.raw).toBeGreaterThanOrEqual(0);
  });
});

describe("computeViabilityTier", () => {
  it("classifies top 25% as strong", () => {
    // 10 archetypes: shares from 0.02 to 0.20
    const shares = [0.02, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.13, 0.15, 0.2];
    const result = computeViabilityTier(0.2, shares);
    expect(result.viability).toBe("strong");
    expect(result.format_context).toContain("20.0% of decks");
  });

  it("classifies 25th-75th percentile as moderate", () => {
    const shares = [0.02, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.13, 0.15, 0.2];
    const result = computeViabilityTier(0.08, shares);
    expect(result.viability).toBe("moderate");
  });

  it("classifies 5th-25th percentile as sparse", () => {
    const shares = [0.02, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.13, 0.15, 0.2];
    const result = computeViabilityTier(0.04, shares);
    expect(result.viability).toBe("sparse");
  });

  it("classifies bottom 5% as fringe", () => {
    // 20 archetypes so 5% = 1 archetype. The very lowest is fringe.
    const shares = Array.from({ length: 20 }, (_, index) => (index + 1) * 0.005);
    const result = computeViabilityTier(0.005, shares);
    expect(result.viability).toBe("fringe");
  });

  it("returns fringe with empty deck shares", () => {
    const result = computeViabilityTier(0, []);
    expect(result.viability).toBe("fringe");
    expect(result.format_context).toContain("format avg: 0.0%");
  });

  it("includes format average in context string", () => {
    const shares = [0.1, 0.2, 0.3];
    const result = computeViabilityTier(0.2, shares);
    expect(result.format_context).toContain("format avg: 20.0%");
  });

  it("handles single archetype as strong", () => {
    const result = computeViabilityTier(1, [1]);
    expect(result.viability).toBe("strong");
  });
});

describe("format-adjusted archetype weighting", () => {
  beforeEach(async () => {
    await cleanAll(env.DB);
  });

  it("steers toward stronger archetype when commitment is equal", async () => {
    // Pool has equal R and U pips — commitment to UR and UB should be similar.
    // But UB has a higher archetype win rate (0.55) than UR (0.45).
    // Format adjustment should make UB's weight higher than UR's.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr) VALUES (?, ?, ?, ?, ?)`,
      ).bind("FMT", "PremierDraft", 100_000, 3, 0.5),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(1, "o-1", "Blue Card", "Blue Card", "{U}", 1, "Creature", '["U"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(2, "o-2", "Black Card", "Black Card", "{B}", 1, "Creature", '["B"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(3, "o-3", "Red Card", "Red Card", "{R}", 1, "Creature", '["R"]', 1),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, colors, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(4, "o-4", "Pack Card", "Pack Card", "{U}", 1, "Creature", '["U"]', 1),
      // Ratings for all cards
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("FMT", "Blue Card", 50_000, 70_000, 20_000, 0.55, 0.55, 0.55, 0.55, 0, 5, 5),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("FMT", "Black Card", 50_000, 70_000, 20_000, 0.55, 0.55, 0.55, 0.55, 0, 5, 5),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("FMT", "Red Card", 50_000, 70_000, 20_000, 0.55, 0.55, 0.55, 0.55, 0, 5, 5),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("FMT", "Pack Card", 50_000, 70_000, 20_000, 0.55, 0.55, 0.55, 0.55, 0, 5, 5),
      // UB is a strong archetype (55% WR), UR is weak (45% WR)
      env.DB.prepare(
        `INSERT INTO mtga_draft_deck_stats (set_code, archetype, avg_lands, avg_creatures, avg_noncreatures, avg_fixing, splash_rate, splash_avg_sources, splash_winrate, nonsplash_winrate, total_decks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("FMT", "UB", 17, 14, 5, 1, 0, 0, 0, 0.55, 5000),
      env.DB.prepare(
        `INSERT INTO mtga_draft_deck_stats (set_code, archetype, avg_lands, avg_creatures, avg_noncreatures, avg_fixing, splash_rate, splash_avg_sources, splash_winrate, nonsplash_winrate, total_decks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("FMT", "UR", 17, 14, 5, 1, 0, 0, 0, 0.45, 5000),
      // Calibration
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("FMT", "baseline", 0.55, 30),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("FMT", "synergy", 0, 10),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("FMT", "signal", 5, 1),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("FMT", "castability", 0.75, 8),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("FMT", "color_commitment", 0.5, 4),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("FMT", "opportunity_cost", 0.85, 8),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("FMT", "curve", 0, 3),
      env.DB.prepare(
        `INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (?, ?, ?, ?)`,
      ).bind("FMT", "role", 0.3, 5),
    ]);

    // Pool: 1 blue + 1 black + 1 red → equally open to UB and UR
    const result = await draftAdvisorModule.execute(
      {
        set: "FMT",
        pool: ["Blue Card", "Black Card", "Red Card"],
        pack: ["Pack Card"],
        pick_number: 10,
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const data = result.data as {
      archetype: {
        candidates: { archetype: string; weight: number }[];
      };
    };

    const ub = data.archetype.candidates.find((c) => c.archetype === "UB");
    const ur = data.archetype.candidates.find((c) => c.archetype === "UR");

    // Both should exist (equal commitment)
    expect(ub).toBeDefined();
    expect(ur).toBeDefined();

    // UB should have higher weight than UR due to format adjustment
    // (55% WR vs 45% WR, with similar commitment weights)
    // Ratio should be roughly 55/45 ≈ 1.22x
    expect(ub!.weight).toBeGreaterThan(ur!.weight * 1.1);
  });
});
