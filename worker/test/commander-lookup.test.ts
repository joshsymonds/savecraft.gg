import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { commanderLookupModule } from "../../plugins/magic/reference/commander-lookup";
import { registerNativeModule } from "../src/reference/registry";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

describe("commander_lookup native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("magic", commanderLookupModule);
  });

  async function seedAtraxa(): Promise<void> {
    const atraxaId = "d0d33d52-3d28-4635-b985-51e126289259";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders
           (scryfall_id, name, slug, color_identity, deck_count, themes, similar, rank, salt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        atraxaId,
        "Atraxa, Praetors' Voice",
        "atraxa-praetors-voice",
        '["G","W","U","B"]',
        40_176,
        '[{"slug":"infect","value":"Infect","count":5730},{"slug":"counters","value":"+1/+1 Counters","count":2681}]',
        '[{"id":"4a1f905f-1d55-4d02-9d24-e58070793d3f","name":"Atraxa, Grand Unifier"}]',
        3,
        1.72,
      ),
      env.DB.prepare(`INSERT INTO magic_edh_commanders_fts (scryfall_id, name) VALUES (?, ?)`).bind(
        atraxaId,
        "Atraxa, Praetors' Voice",
      ),
      // Recommendations across a few categories
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations
           (commander_id, card_name, category, synergy, inclusion, potential_decks, trend_zscore)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(atraxaId, "Tekuthal, Inquiry Dominus", "highsynergycards", 0.27, 26_146, 40_000, 0.5),
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations
           (commander_id, card_name, category, synergy, inclusion, potential_decks, trend_zscore)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(atraxaId, "Swords to Plowshares", "topcards", -0.04, 22_104, 40_000, 0.1),
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations
           (commander_id, card_name, category, synergy, inclusion, potential_decks, trend_zscore)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(atraxaId, "Sol Ring", "topcards", 0, 38_000, 40_000, 0),
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations
           (commander_id, card_name, category, synergy, inclusion, potential_decks, trend_zscore)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(atraxaId, "Birds of Paradise", "creatures", 0.1, 15_000, 40_000, 0.2),
      env.DB.prepare(
        `INSERT INTO magic_edh_mana_curves (commander_id, cmc, avg_count) VALUES (?, ?, ?)`,
      ).bind(atraxaId, 2, 18),
      env.DB.prepare(
        `INSERT INTO magic_edh_mana_curves (commander_id, cmc, avg_count) VALUES (?, ?, ?)`,
      ).bind(atraxaId, 3, 16),
    ]);
  }

  it("looks up commander by exact name and returns metadata + recs grouped by category", async () => {
    await seedAtraxa();

    const result = await commanderLookupModule.execute(
      { commander: "Atraxa, Praetors' Voice" },
      env as unknown as Env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;

    const data = result.data as {
      commander: {
        name: string;
        slug: string;
        color_identity: string[];
        deck_count: number;
        rank: number;
      };
      themes: { slug: string; value: string; count: number }[];
      similar: { id: string; name: string }[];
      mana_curve: { cmc: number; avg_count: number }[];
      recommendations: Record<string, { card_name: string; synergy: number; inclusion: number }[]>;
      attribution: { source: string; url: string };
    };

    expect(data.commander.name).toBe("Atraxa, Praetors' Voice");
    expect(data.commander.slug).toBe("atraxa-praetors-voice");
    expect(data.commander.color_identity).toEqual(["G", "W", "U", "B"]);
    expect(data.commander.deck_count).toBe(40_176);
    expect(data.commander.rank).toBe(3);

    expect(data.themes.length).toBeGreaterThanOrEqual(2);
    expect(data.themes[0].slug).toBe("infect");
    expect(data.similar[0].name).toBe("Atraxa, Grand Unifier");
    expect(data.mana_curve).toHaveLength(2);

    // Recommendations grouped by category
    expect(Object.keys(data.recommendations)).toContain("highsynergycards");
    expect(Object.keys(data.recommendations)).toContain("topcards");
    expect(Object.keys(data.recommendations)).toContain("creatures");

    // topcards should be ordered by synergy DESC then inclusion DESC
    const topcards = data.recommendations.topcards;
    expect(topcards.length).toBe(2);
    expect(topcards.map((c) => c.card_name)).toContain("Sol Ring");
    expect(topcards.map((c) => c.card_name)).toContain("Swords to Plowshares");

    // Attribution
    expect(data.attribution.source).toBe("EDHREC");
    expect(data.attribution.url).toBe("https://edhrec.com/commanders/atraxa-praetors-voice");
  });

  it("fuzzy matches commander name via FTS", async () => {
    await seedAtraxa();

    const result = await commanderLookupModule.execute(
      { commander: "atraxa" },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { commander: { name: string } };
    expect(data.commander.name).toBe("Atraxa, Praetors' Voice");
  });

  it("fuzzy matches multi-word commander name", async () => {
    const urDragonId = "ur-dragon-id";
    const muldrothaId = "muldrotha-id";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(urDragonId, "The Ur-Dragon", "the-ur-dragon", '["W","U","B","R","G"]', 30_000),
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        muldrothaId,
        "Muldrotha, the Gravetide",
        "muldrotha-the-gravetide",
        '["B","U","G"]',
        20_000,
      ),
      env.DB.prepare(`INSERT INTO magic_edh_commanders_fts (scryfall_id, name) VALUES (?, ?)`).bind(
        urDragonId,
        "The Ur-Dragon",
      ),
      env.DB.prepare(`INSERT INTO magic_edh_commanders_fts (scryfall_id, name) VALUES (?, ?)`).bind(
        muldrothaId,
        "Muldrotha, the Gravetide",
      ),
    ]);

    const result = await commanderLookupModule.execute(
      { commander: "ur dragon" },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { commander: { name: string } };
    expect(data.commander.name).toBe("The Ur-Dragon");
  });

  it("fuzzy matches by second-word substring (gravetide -> Muldrotha)", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        "muldrotha-id",
        "Muldrotha, the Gravetide",
        "muldrotha-the-gravetide",
        '["B","U","G"]',
        20_000,
      ),
      env.DB.prepare(`INSERT INTO magic_edh_commanders_fts (scryfall_id, name) VALUES (?, ?)`).bind(
        "muldrotha-id",
        "Muldrotha, the Gravetide",
      ),
    ]);

    const result = await commanderLookupModule.execute(
      { commander: "gravetide" },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { commander: { name: string } };
    expect(data.commander.name).toBe("Muldrotha, the Gravetide");
  });

  it("filters recommendations by category when provided", async () => {
    await seedAtraxa();

    const result = await commanderLookupModule.execute(
      { commander: "Atraxa", category: "topcards" },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { recommendations: Record<string, unknown[]> };
    expect(Object.keys(data.recommendations)).toEqual(["topcards"]);
    expect(data.recommendations.topcards.length).toBe(2);
  });

  it("respects limit parameter per category", async () => {
    await seedAtraxa();

    const result = await commanderLookupModule.execute(
      { commander: "Atraxa", limit: 1 },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { recommendations: Record<string, unknown[]> };
    // topcards has 2 seeded rows, should truncate to 1
    expect(data.recommendations.topcards.length).toBe(1);
  });

  it("returns a text error when commander is not found", async () => {
    await seedAtraxa();

    const result = await commanderLookupModule.execute(
      { commander: "Nonexistent Commander" },
      env as unknown as Env,
    );
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content).toMatch(/not found/i);
  });

  it("returns a text error when commander parameter is missing", async () => {
    await seedAtraxa();

    const result = await commanderLookupModule.execute({}, env as unknown as Env);
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content).toMatch(/commander/i);
  });

  it("handles commander with zero recommendations and zero curve rows", async () => {
    // Seed just the commander row — no recs, no curve. Should return
    // empty collections, not error.
    const id = "bare-commander-id";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(id, "Bare Commander", "bare-commander", '["W"]', 100),
      env.DB.prepare(`INSERT INTO magic_edh_commanders_fts (scryfall_id, name) VALUES (?, ?)`).bind(
        id,
        "Bare Commander",
      ),
    ]);

    const result = await commanderLookupModule.execute(
      { commander: "Bare Commander" },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as {
      commander: { name: string };
      recommendations: Record<string, unknown[]>;
      mana_curve: unknown[];
      themes: unknown[];
      similar: unknown[];
    };
    expect(data.commander.name).toBe("Bare Commander");
    expect(data.recommendations).toEqual({});
    expect(data.mana_curve).toEqual([]);
    expect(data.themes).toEqual([]);
    expect(data.similar).toEqual([]);
  });
});
