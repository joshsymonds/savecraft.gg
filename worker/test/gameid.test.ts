import { describe, expect, it } from "vitest";

import { slugifyGameName } from "../src/gameid";

describe("slugifyGameName", () => {
  it("lowercases and hyphenates punctuation and spaces", () => {
    expect(slugifyGameName("Hollow Knight: Silksong")).toBe("hollow-knight-silksong");
  });

  it("collapses runs of non-alphanumeric characters into a single hyphen", () => {
    expect(slugifyGameName("hollow   knight -- silksong!!!")).toBe("hollow-knight-silksong");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugifyGameName("  !!!Hollow Knight!!!  ")).toBe("hollow-knight");
  });

  it("strips diacritics", () => {
    expect(slugifyGameName("Pokémon")).toBe("pokemon");
  });

  it("returns an empty string for punctuation-only input", () => {
    expect(slugifyGameName("!!!")).toBe("");
  });
});
