import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { commanderTrendsModule } from "../../plugins/magic/reference/commander-trends";
import { registerNativeModule } from "../src/reference/registry";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

describe("commander_trends native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("magic", commanderTrendsModule);
  });

  async function seedCommanders(): Promise<void> {
    await env.DB.batch([
      // Atraxa: WUBG (4 colors), most popular
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank, themes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "atraxa-id",
        "Atraxa, Praetors' Voice",
        "atraxa-praetors-voice",
        '["W","U","B","G"]',
        40_000,
        3,
        '[{"slug":"counters","value":"+1/+1 Counters","count":2681},{"slug":"infect","value":"Infect","count":5730}]',
      ),
      // Korvold: BRG (3 colors), second most popular
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank, themes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "korvold-id",
        "Korvold, Fae-Cursed King",
        "korvold-fae-cursed-king",
        '["B","R","G"]',
        25_000,
        8,
        '[{"slug":"sacrifice","value":"Sacrifice","count":3200},{"slug":"treasures","value":"Treasures","count":1800}]',
      ),
      // Muldrotha: BUG (3 colors), lower popularity
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank, themes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "muldrotha-id",
        "Muldrotha, the Gravetide",
        "muldrotha-the-gravetide",
        '["B","U","G"]',
        15_000,
        22,
        '[{"slug":"graveyard","value":"Graveyard","count":5000},{"slug":"counters","value":"+1/+1 Counters","count":400}]',
      ),
      // Kozilek: colorless (Eldrazi commander)
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank, themes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "kozilek-id",
        "Kozilek, Butcher of Truth",
        "kozilek-butcher-of-truth",
        "[]",
        5000,
        100,
        '[{"slug":"eldrazi","value":"Eldrazi","count":4500}]',
      ),
    ]);
  }

  it("mode=top returns commanders ordered by deck_count DESC", async () => {
    await seedCommanders();

    const result = await commanderTrendsModule.execute({ mode: "top" }, env as unknown as Env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as {
      mode: string;
      commanders: { name: string; deck_count: number; color_identity: string[] }[];
      count: number;
    };
    expect(data.mode).toBe("top");
    expect(data.commanders.length).toBe(4);
    expect(data.commanders[0]?.name).toBe("Atraxa, Praetors' Voice");
    expect(data.commanders[0]?.deck_count).toBe(40_000);
    expect(data.commanders[3]?.name).toBe("Kozilek, Butcher of Truth");
    // Color identity should be parsed to array
    expect(data.commanders[0]?.color_identity).toEqual(["W", "U", "B", "G"]);
  });

  it("mode=top respects limit", async () => {
    await seedCommanders();

    const result = await commanderTrendsModule.execute(
      { mode: "top", limit: 2 },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { commanders: { name: string }[] };
    expect(data.commanders.length).toBe(2);
    expect(data.commanders[0]?.name).toBe("Atraxa, Praetors' Voice");
  });

  it("mode=themes returns pre-aggregated rows ordered by total_count DESC", async () => {
    await seedCommanders();
    // Themes mode reads from magic_edh_themes — the pre-aggregated table that
    // edhrec-fetch populates at import time. Seed it directly here.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_themes (slug, value, total_count, commander_count)
         VALUES (?, ?, ?, ?)`,
      ).bind("graveyard", "Graveyard", 5000, 1),
      env.DB.prepare(
        `INSERT INTO magic_edh_themes (slug, value, total_count, commander_count)
         VALUES (?, ?, ?, ?)`,
      ).bind("counters", "+1/+1 Counters", 3081, 2),
      env.DB.prepare(
        `INSERT INTO magic_edh_themes (slug, value, total_count, commander_count)
         VALUES (?, ?, ?, ?)`,
      ).bind("sacrifice", "Sacrifice", 3200, 1),
    ]);

    const result = await commanderTrendsModule.execute({ mode: "themes" }, env as unknown as Env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as {
      mode: string;
      themes: {
        slug: string;
        value: string;
        total_count: number;
        commander_count: number;
      }[];
    };
    expect(data.mode).toBe("themes");
    // Sorted by total_count DESC
    expect(data.themes.map((t) => t.slug)).toEqual(["graveyard", "sacrifice", "counters"]);
    const counters = data.themes.find((t) => t.slug === "counters");
    expect(counters?.commander_count).toBe(2);
    expect(counters?.total_count).toBe(3081);
  });

  it("mode=by_colors filters by color identity subset", async () => {
    await seedCommanders();

    // BG deck can run: Kozilek (colorless) + Muldrotha has U so NOT BG subset
    // Actually: BG means user's deck supports B and G. Commander must be subset of BG.
    // Korvold is BRG → NOT a subset of BG (has R).
    // Muldrotha is BUG → NOT a subset of BG (has U).
    // Kozilek is [] → subset of BG ✓
    // Atraxa is WUBG → NOT a subset of BG (has W, U).
    const result = await commanderTrendsModule.execute(
      { mode: "by_colors", colors: "BG" },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { commanders: { name: string }[] };
    expect(data.commanders.map((c) => c.name)).toEqual(["Kozilek, Butcher of Truth"]);
  });

  it("mode=by_colors with WUBRG returns all commanders", async () => {
    await seedCommanders();

    const result = await commanderTrendsModule.execute(
      { mode: "by_colors", colors: "WUBRG" },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { commanders: unknown[] };
    expect(data.commanders.length).toBe(4);
  });

  it("mode=by_colors with BUG matches Muldrotha and Kozilek only", async () => {
    await seedCommanders();

    const result = await commanderTrendsModule.execute(
      { mode: "by_colors", colors: "BUG" },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { commanders: { name: string }[] };
    const names = data.commanders.map((c) => c.name).toSorted((a, b) => a.localeCompare(b));
    expect(names).toEqual(["Kozilek, Butcher of Truth", "Muldrotha, the Gravetide"]);
  });

  it("mode=by_colors requires colors parameter", async () => {
    await seedCommanders();

    const result = await commanderTrendsModule.execute(
      { mode: "by_colors" },
      env as unknown as Env,
    );
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content).toMatch(/colors/i);
  });

  it("rejects invalid mode", async () => {
    await seedCommanders();

    const result = await commanderTrendsModule.execute({ mode: "nonsense" }, env as unknown as Env);
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content).toMatch(/mode/i);
  });

  it("defaults to mode=top when mode omitted", async () => {
    await seedCommanders();

    const result = await commanderTrendsModule.execute({}, env as unknown as Env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { mode: string; commanders: unknown[] };
    expect(data.mode).toBe("top");
    expect(data.commanders.length).toBe(4);
  });
});
