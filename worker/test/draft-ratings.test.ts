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
      ).bind("DSK", "PremierDraft", 250000, 3, 0.515),
      env.DB.prepare(
        `INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr) VALUES (?, ?, ?, ?, ?)`,
      ).bind("BLB", "PremierDraft", 200000, 2, 0.51),

      // DSK cards
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", 15000, 20000, 5000, 0.564, 0.62, 0.54, 0.48, 0.06, 8.5, 9.2),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Blazing Bolt", 10000, 12000, 2000, 0.58, 0.60, 0.55, 0.50, 0.05, 3.0, 2.5),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Forest Bear", 8000, 10000, 2000, 0.48, 0.49, 0.47, 0.50, -0.03, 10.0, 11.0),

      // BLB cards
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("BLB", "Card A", 5000, 7000, 2000, 0.55, 0.56, 0.53, 0.50, 0.03, 5.0, 6.0),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("BLB", "Card B", 4000, 6000, 2000, 0.52, 0.53, 0.51, 0.49, 0.02, 7.0, 8.0),

      // Color stats for Gloomlake Verge
      env.DB.prepare(
        `INSERT INTO mtga_draft_color_stats (set_code, card_name, color_pair, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", "UB", 3000, 4000, 1000, 0.59, 0.63, 0.56, 0.49, 0.07, 7.2, 8.0),
      env.DB.prepare(
        `INSERT INTO mtga_draft_color_stats (set_code, card_name, color_pair, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", "BG", 2000, 3000, 1000, 0.52, 0.54, 0.50, 0.49, 0.01, 9.0, 10.0),

      // FTS5 rows for card name search
      env.DB.prepare("INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (?, ?)").bind("DSK", "Gloomlake Verge"),
      env.DB.prepare("INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (?, ?)").bind("DSK", "Blazing Bolt"),
      env.DB.prepare("INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (?, ?)").bind("DSK", "Forest Bear"),
      env.DB.prepare("INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (?, ?)").bind("BLB", "Card A"),
      env.DB.prepare("INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (?, ?)").bind("BLB", "Card B"),
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

    const result = await draftRatingsModule.execute({
      set: "DSK",
      cards: ["Gloomlake Verge", "Blazing Bolt"],
    }, env);
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
    const blazingIdx = result.content.indexOf("Blazing Bolt");
    const gloomlakeIdx = result.content.indexOf("Gloomlake Verge");
    expect(blazingIdx).toBeLessThan(gloomlakeIdx);
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

    const result = await draftRatingsModule.execute({ set: "DSK", sort: "gihwr", colors: "UB" }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("UB");
    // Only Gloomlake Verge has UB color stats
    expect(result.content).toContain("Gloomlake Verge");
  });
});
