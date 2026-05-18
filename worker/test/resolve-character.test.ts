import { describe, expect, it } from "vitest";

import { resolveCharacterContext } from "../src/adapters/resolve-character";

// Characterization of the CURRENT (WoW-coupled) resolveCharacterContext
// before the adapter-generic refresh refactor. These pin the exact
// observable mapping the refactor removes, so the replacement can be
// shown to preserve WoW's effective refresh identity (and the points
// where it deliberately diverges are explicit, not accidental).

describe("resolveCharacterContext [characterization — pre-refactor WoW behavior]", () => {
  it("uses linked_characters metadata realm_slug/region; lowercases the name", () => {
    const ctx = resolveCharacterContext(
      {
        character_name: "Dratnos",
        metadata: JSON.stringify({ realm_slug: "tichondrius", region: "eu" }),
      },
      "Dratnos-tichondrius-EU",
    );
    expect(ctx).toEqual({
      realmSlug: "tichondrius",
      region: "eu",
      characterName: "dratnos", // NOTE: lowercased — breaks case-sensitive GGG
    });
  });

  it("falls back to parsing save_name (Name-Realm-REGION) when no linked char", () => {
    const ctx = resolveCharacterContext(null, "Dratnos-tichondrius-US");
    expect(ctx).toEqual({
      realmSlug: "tichondrius",
      region: "us",
      characterName: "dratnos",
    });
  });

  it("yields empty realmSlug for an unparseable save_name (the realm gate trigger)", () => {
    const ctx = resolveCharacterContext(null, "BadName");
    expect(ctx.realmSlug).toBe("");
    expect(ctx.region).toBe("us");
    expect(ctx.characterName).toBe("badname");
  });

  it("falls through to save_name parsing when metadata JSON is malformed", () => {
    const ctx = resolveCharacterContext(
      { character_name: "Zug", metadata: "{not json" },
      "Zug-illidan-US",
    );
    expect(ctx.realmSlug).toBe("illidan");
    expect(ctx.region).toBe("us");
  });

  it("prefers linked character_name over the save_name first segment", () => {
    const ctx = resolveCharacterContext(
      { character_name: "RealName", metadata: JSON.stringify({ realm_slug: "area-52", region: "us" }) },
      "StaleName-area-52-US",
    );
    expect(ctx.characterName).toBe("realname");
    expect(ctx.realmSlug).toBe("area-52");
  });
});
