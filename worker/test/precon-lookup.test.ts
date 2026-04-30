import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { preconLookupModule } from "../../plugins/magic/reference/precon-lookup";
import { registerNativeModule } from "../src/reference/registry";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const ATRAXA_ID = "atraxa-id";
const KORVOLD_ID = "korvold-id";

describe("precon_lookup native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("magic", preconLookupModule);
  });

  async function seedPrecons(): Promise<void> {
    await env.DB.batch([
      // Commanders (for color-identity lookup on browse mode)
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Atraxa, Praetors' Voice", "atraxa-praetors-voice", '["W","U","B","G"]', 40000, 3),
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(KORVOLD_ID, "Korvold, Fae-Cursed King", "korvold-fae-cursed-king", '["B","R","G"]', 25000, 12),

      // Atraxa precon
      env.DB.prepare(
        `INSERT INTO magic_edh_precons (slug, name, msrp_usd, set_code, release_year)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind("breed-lethality", "Breed Lethality", 30, "C16", 2016),
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_decks (precon_slug, card_name, quantity, category) VALUES (?, ?, ?, ?)`,
      ).bind("breed-lethality", "Sol Ring", 1, "Artifact"),
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_decks (precon_slug, card_name, quantity, category) VALUES (?, ?, ?, ?)`,
      ).bind("breed-lethality", "Forest", 7, "Land"),
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_upgrades (precon_slug, card_name, action, category, inclusion) VALUES (?, ?, ?, ?, ?)`,
      ).bind("breed-lethality", "Inexorable Tide", "add", "cardstoadd", 93),
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_upgrades (precon_slug, card_name, action, category, inclusion) VALUES (?, ?, ?, ?, ?)`,
      ).bind("breed-lethality", "Frumious Bandersnatch", "cut", "cardstocut", 0),
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_commanders (precon_slug, commander_name, deck_count, is_face) VALUES (?, ?, ?, ?)`,
      ).bind("breed-lethality", "Atraxa, Praetors' Voice", 270, 1),
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_commanders (precon_slug, commander_name, deck_count, is_face) VALUES (?, ?, ?, ?)`,
      ).bind("breed-lethality", "Ishai, Ojutai Dragonspeaker // Reyhan, Last of the Abzan", 8, 0),

      // Korvold precon (BRG, $50 MSRP — for browse-by-colors test)
      env.DB.prepare(
        `INSERT INTO magic_edh_precons (slug, name, msrp_usd, set_code, release_year)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind("merciless-rage", "Merciless Rage", 50, "C19", 2019),
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_commanders (precon_slug, commander_name, deck_count, is_face) VALUES (?, ?, ?, ?)`,
      ).bind("merciless-rage", "Korvold, Fae-Cursed King", 100, 1),

      // Precon with no MSRP (NULL — for budget-filter exclusion test)
      env.DB.prepare(
        `INSERT INTO magic_edh_precons (slug, name, msrp_usd, set_code, release_year)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind("unknown-precon", "unknown-precon (Atraxa, Praetors' Voice)", null, null, null),
      env.DB.prepare(
        `INSERT INTO magic_edh_precon_commanders (precon_slug, commander_name, deck_count, is_face) VALUES (?, ?, ?, ?)`,
      ).bind("unknown-precon", "Atraxa, Praetors' Voice", 50, 1),
    ]);
  }

  it("looks up by exact slug", async () => {
    await seedPrecons();
    const result = await preconLookupModule.execute(
      { slug: "breed-lethality" },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { precons: { slug: string; name: string; msrp_usd: number }[] };
    expect(data.precons.length).toBe(1);
    expect(data.precons[0]!.slug).toBe("breed-lethality");
    expect(data.precons[0]!.msrp_usd).toBe(30);
  });

  it("returns text response for unknown slug", async () => {
    await seedPrecons();
    const result = await preconLookupModule.execute(
      { slug: "no-such-slug" },
      env as unknown as Env,
    );
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content).toContain("no-such-slug");
  });

  it("looks up by commander name (face match)", async () => {
    await seedPrecons();
    const result = await preconLookupModule.execute(
      { commander: "Atraxa" },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      precons: {
        slug: string;
        face_commander: { name: string };
        alternate_commanders: { name: string }[];
      }[];
    };
    // Atraxa is the face commander of breed-lethality and unknown-precon.
    expect(data.precons.length).toBe(2);
    const slugs = data.precons.map((p) => p.slug);
    expect(slugs).toContain("breed-lethality");
    expect(slugs).toContain("unknown-precon");
    const breed = data.precons.find((p) => p.slug === "breed-lethality")!;
    expect(breed.face_commander.name).toBe("Atraxa, Praetors' Voice");
    expect(breed.alternate_commanders.length).toBe(1);
  });

  it("includes deck and upgrades by default", async () => {
    await seedPrecons();
    const result = await preconLookupModule.execute(
      { slug: "breed-lethality" },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      precons: {
        deck: { card_name: string; quantity: number }[];
        upgrades: { add: { card_name: string }[]; cut: { card_name: string }[] };
      }[];
    };
    expect(data.precons[0]!.deck.length).toBe(2);
    expect(data.precons[0]!.upgrades.add).toEqual([
      { card_name: "Inexorable Tide", inclusion: 93 },
    ]);
    expect(data.precons[0]!.upgrades.cut.length).toBe(1);
  });

  it("omits deck and upgrades when toggles are false", async () => {
    await seedPrecons();
    const result = await preconLookupModule.execute(
      { slug: "breed-lethality", include_deck: false, include_upgrades: false },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { precons: Record<string, unknown>[] };
    expect(data.precons[0]!.deck).toBeUndefined();
    expect(data.precons[0]!.upgrades).toBeUndefined();
  });

  it("browse mode filters by max_price", async () => {
    await seedPrecons();
    const result = await preconLookupModule.execute(
      { max_price: 35, include_deck: false, include_upgrades: false },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { precons: { slug: string }[] };
    // Breed Lethality ($30) qualifies; Merciless Rage ($50) doesn't; unknown-precon
    // (NULL MSRP) is excluded since we can't certify it under budget.
    const slugs = data.precons.map((p) => p.slug);
    expect(slugs).toContain("breed-lethality");
    expect(slugs).not.toContain("merciless-rage");
    expect(slugs).not.toContain("unknown-precon");
  });

  it("browse mode filters by colors (subset semantics)", async () => {
    await seedPrecons();
    const result = await preconLookupModule.execute(
      { colors: "BRG", include_deck: false, include_upgrades: false },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { precons: { slug: string }[] };
    const slugs = data.precons.map((p) => p.slug);
    // Korvold precon (BRG) fits in BRG. Atraxa (WUBG) does not (has W, U).
    expect(slugs).toContain("merciless-rage");
    expect(slugs).not.toContain("breed-lethality");
  });
});
