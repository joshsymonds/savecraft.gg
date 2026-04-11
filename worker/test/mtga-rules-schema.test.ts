import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

describe("MTGA rules D1 schema", () => {
  beforeEach(cleanAll);

  // ── mtga_rules table + FTS5 ────────────────────────────────

  it("inserts and retrieves rules", async () => {
    await env.DB.prepare(
      "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)",
    )
      .bind("702.2", "Deathtouch is a static ability.", null, null)
      .run();

    const row = await env.DB.prepare("SELECT * FROM mtga_rules WHERE number = ?")
      .bind("702.2")
      .first<{ number: string; text: string; example: string | null; see_also: string | null }>();

    expect(row).not.toBeNull();
    expect(row!.number).toBe("702.2");
    expect(row!.text).toBe("Deathtouch is a static ability.");
  });

  it("FTS5 keyword search returns ranked results", async () => {
    // Seed rules — "deathtouch" appears in both but is more prominent in 702.2
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)",
      ).bind("702.2", "Deathtouch is a static ability.", null, null),
      env.DB.prepare(
        "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)",
      ).bind(
        "702.2a",
        "Deathtouch is a keyword ability that causes damage dealt by the source to be lethal.",
        null,
        null,
      ),
      env.DB.prepare(
        "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)",
      ).bind(
        "704.5",
        "The state-based actions are as follows: A creature with toughness 0 or less is put into the graveyard.",
        null,
        null,
      ),
      // Insert corresponding FTS5 rows
      env.DB.prepare("INSERT INTO mtga_rules_fts (number, text, example) VALUES (?, ?, ?)").bind(
        "702.2",
        "Deathtouch is a static ability.",
        "",
      ),
      env.DB.prepare("INSERT INTO mtga_rules_fts (number, text, example) VALUES (?, ?, ?)").bind(
        "702.2a",
        "Deathtouch is a keyword ability that causes damage dealt by the source to be lethal.",
        "",
      ),
      env.DB.prepare("INSERT INTO mtga_rules_fts (number, text, example) VALUES (?, ?, ?)").bind(
        "704.5",
        "The state-based actions are as follows: A creature with toughness 0 or less is put into the graveyard.",
        "",
      ),
    ]);

    // FTS5 BM25 search for "deathtouch"
    const results = await env.DB.prepare(
      `SELECT number, rank FROM mtga_rules_fts WHERE mtga_rules_fts MATCH ? ORDER BY rank LIMIT 10`,
    )
      .bind("deathtouch")
      .all<{ number: string; rank: number }>();

    expect(results.results.length).toBe(2);
    // Both deathtouch rules found, state-based action rule excluded
    const numbers = results.results.map((r) => r.number);
    expect(numbers).toContain("702.2");
    expect(numbers).toContain("702.2a");
    expect(numbers).not.toContain("704.5");
  });

  it("FTS5 porter stemming matches inflected forms", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)",
      ).bind(
        "701.7",
        "Destroying a permanent means moving it from the battlefield to the graveyard.",
        null,
        null,
      ),
      env.DB.prepare("INSERT INTO mtga_rules_fts (number, text, example) VALUES (?, ?, ?)").bind(
        "701.7",
        "Destroying a permanent means moving it from the battlefield to the graveyard.",
        "",
      ),
    ]);

    // "destroy" should match "Destroying" via porter stemming
    const results = await env.DB.prepare(
      `SELECT number FROM mtga_rules_fts WHERE mtga_rules_fts MATCH ? LIMIT 10`,
    )
      .bind("destroy")
      .all<{ number: string }>();

    expect(results.results.length).toBe(1);
    expect(results.results[0]!.number).toBe("701.7");
  });
});
