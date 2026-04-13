import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { comboSearchModule } from "../../plugins/magic/reference/combo-search";
import { registerNativeModule } from "../src/reference/registry";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const ATRAXA_ID = "d0d33d52-3d28-4635-b985-51e126289259";
const KOZILEK_ID = "kozilek-id-placeholder";

describe("combo_search native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("magic", comboSearchModule);
  });

  async function seedCombos(): Promise<void> {
    await env.DB.batch([
      // Two commanders
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        ATRAXA_ID,
        "Atraxa, Praetors' Voice",
        "atraxa-praetors-voice",
        '["G","W","U","B"]',
        40_000,
      ),
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(KOZILEK_ID, "Kozilek, Butcher of Truth", "kozilek-butcher-of-truth", "[]", 5000),
      env.DB.prepare(`INSERT INTO magic_edh_commanders_fts (scryfall_id, name) VALUES (?, ?)`).bind(
        ATRAXA_ID,
        "Atraxa, Praetors' Voice",
      ),
      env.DB.prepare(`INSERT INTO magic_edh_commanders_fts (scryfall_id, name) VALUES (?, ?)`).bind(
        KOZILEK_ID,
        "Kozilek, Butcher of Truth",
      ),

      // Atraxa combos
      env.DB.prepare(
        `INSERT INTO magic_edh_combos
           (commander_id, combo_id, card_names, card_ids, colors, results, deck_count, percentage, bracket_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        ATRAXA_ID,
        "1529-1887",
        '["Vraska, Betrayal\'s Sting","Vorinclex, Monstrous Raider"]',
        '["9f1fa1c5","92613468"]',
        "BG",
        '["Target opponent loses the game"]',
        25_216,
        1.4,
        3,
      ),
      env.DB.prepare(
        `INSERT INTO magic_edh_combos
           (commander_id, combo_id, card_names, card_ids, colors, results, deck_count, percentage, bracket_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        ATRAXA_ID,
        "2000-3000",
        '["Thassa\'s Oracle","Demonic Consultation"]',
        '["oracle-id","consult-id"]',
        "UB",
        '["You win the game"]',
        18_000,
        1.1,
        4,
      ),
      env.DB.prepare(
        `INSERT INTO magic_edh_combos
           (commander_id, combo_id, card_names, card_ids, colors, results, deck_count, percentage, bracket_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        ATRAXA_ID,
        "4000-5000",
        '["Basalt Monolith","Mesmeric Orb"]',
        '["basalt-id","orb-id"]',
        "",
        '["Infinite mana"]',
        500,
        0.02,
        2,
      ),

      // Kozilek combo
      env.DB.prepare(
        `INSERT INTO magic_edh_combos
           (commander_id, combo_id, card_names, card_ids, colors, results, deck_count, percentage, bracket_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        KOZILEK_ID,
        "9000-1000",
        '["Eldrazi Conscription","Sword of Feast and Famine"]',
        '["con-id","sword-id"]',
        "",
        '["Lethal commander damage"]',
        2000,
        0.4,
        3,
      ),

      // FTS rows (denormalized text)
      env.DB.prepare(
        `INSERT INTO magic_edh_combos_fts (commander_id, combo_id, card_names_text, results_text) VALUES (?, ?, ?, ?)`,
      ).bind(
        ATRAXA_ID,
        "1529-1887",
        "Vraska Betrayals Sting Vorinclex Monstrous Raider",
        "Target opponent loses the game",
      ),
      env.DB.prepare(
        `INSERT INTO magic_edh_combos_fts (commander_id, combo_id, card_names_text, results_text) VALUES (?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "2000-3000", "Thassas Oracle Demonic Consultation", "You win the game"),
      env.DB.prepare(
        `INSERT INTO magic_edh_combos_fts (commander_id, combo_id, card_names_text, results_text) VALUES (?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "4000-5000", "Basalt Monolith Mesmeric Orb", "Infinite mana"),
      env.DB.prepare(
        `INSERT INTO magic_edh_combos_fts (commander_id, combo_id, card_names_text, results_text) VALUES (?, ?, ?, ?)`,
      ).bind(
        KOZILEK_ID,
        "9000-1000",
        "Eldrazi Conscription Sword of Feast and Famine",
        "Lethal commander damage",
      ),
    ]);
  }

  it("searches combos by commander (fuzzy name)", async () => {
    await seedCombos();
    const result = await comboSearchModule.execute({ commander: "atraxa" }, env as unknown as Env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { combos: { combo_id: string; deck_count: number }[] };
    expect(data.combos.length).toBe(3);
    // Ordered by deck_count DESC
    expect(data.combos[0]?.combo_id).toBe("1529-1887");
    expect(data.combos[0]?.deck_count).toBe(25_216);
  });

  it("searches combos by card name via FTS", async () => {
    await seedCombos();
    const result = await comboSearchModule.execute({ card: "Oracle" }, env as unknown as Env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as {
      combos: { combo_id: string; card_names: string[]; commander_name: string }[];
    };
    expect(data.combos.length).toBeGreaterThanOrEqual(1);
    const found = data.combos.find((c) => c.combo_id === "2000-3000");
    expect(found).toBeDefined();
    expect(found?.card_names).toContain("Thassa's Oracle");
  });

  it("filters combos by color identity subset (BG matches BG + colorless)", async () => {
    await seedCombos();
    const result = await comboSearchModule.execute({ colors: "BG" }, env as unknown as Env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { combos: { combo_id: string }[] };
    const ids = data.combos.map((c) => c.combo_id).toSorted((a, b) => a.localeCompare(b));
    // Should include: BG combo, Atraxa's colorless combo, Kozilek's colorless combo.
    // Should exclude: UB combo (has U that BG doesn't have).
    expect(ids).toEqual(["1529-1887", "4000-5000", "9000-1000"]);
  });

  it("filters by WUBRG returns every combo (all subsets)", async () => {
    await seedCombos();
    const result = await comboSearchModule.execute({ colors: "WUBRG" }, env as unknown as Env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { combos: unknown[] };
    expect(data.combos.length).toBe(4);
  });

  it("filters by empty colors returns only colorless combos", async () => {
    await seedCombos();
    const result = await comboSearchModule.execute({ colors: "" }, env as unknown as Env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { combos: { combo_id: string }[] };
    const ids = data.combos.map((c) => c.combo_id).toSorted((a, b) => a.localeCompare(b));
    expect(ids).toEqual(["4000-5000", "9000-1000"]);
  });

  it("rejects invalid colors value", async () => {
    await seedCombos();
    const result = await comboSearchModule.execute({ colors: "BX" }, env as unknown as Env);
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content).toMatch(/invalid colors/i);
  });

  it("respects min_deck_count threshold", async () => {
    await seedCombos();
    const result = await comboSearchModule.execute(
      { commander: "atraxa", min_deck_count: 10_000 },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { combos: { combo_id: string }[] };
    // Only 1529-1887 (25k) and 2000-3000 (18k) — 4000-5000 (500) is filtered out
    expect(data.combos.length).toBe(2);
    expect(data.combos.map((c) => c.combo_id)).not.toContain("4000-5000");
  });

  it("respects limit parameter", async () => {
    await seedCombos();
    const result = await comboSearchModule.execute(
      { commander: "atraxa", limit: 1 },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { combos: unknown[] };
    expect(data.combos.length).toBe(1);
  });

  it("returns text error when no search criterion provided", async () => {
    await seedCombos();
    const result = await comboSearchModule.execute({}, env as unknown as Env);
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content).toMatch(/commander|card|colors/i);
  });

  it("returns commander context with each combo", async () => {
    await seedCombos();
    const result = await comboSearchModule.execute({ card: "Oracle" }, env as unknown as Env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as {
      combos: { commander_name: string; commander_id: string }[];
    };
    expect(data.combos[0]?.commander_name).toBe("Atraxa, Praetors' Voice");
    expect(data.combos[0]?.commander_id).toBe(ATRAXA_ID);
  });
});
