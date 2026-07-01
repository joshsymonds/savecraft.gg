import { describe, expect, it } from "vitest";

import { resolveAttribution, SOURCES } from "./attributions";

describe("SOURCES", () => {
  it("has a non-empty name for every source", () => {
    for (const [key, source] of Object.entries(SOURCES)) {
      expect(source.name.length, `${key}.name`).toBeGreaterThan(0);
    }
  });

  it("has a non-empty disclaimer for every source", () => {
    for (const [key, source] of Object.entries(SOURCES)) {
      expect(source.disclaimer.length, `${key}.disclaimer`).toBeGreaterThan(0);
    }
  });

  it("has an https url for every source", () => {
    for (const [key, source] of Object.entries(SOURCES)) {
      expect(source.url, `${key}.url`).toMatch(/^https:\/\//);
    }
  });
});

describe("resolveAttribution", () => {
  it("returns matching entries in order for valid keys", () => {
    const result = resolveAttribution(["wotc", "scryfall"]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Wizards of the Coast");
    expect(result[1].name).toBe("Scryfall");
  });

  it("resolves every registered source key", () => {
    const keys = Object.keys(SOURCES);
    const all = resolveAttribution(keys);
    expect(all).toHaveLength(keys.length);
    expect(all).toEqual(keys.map((key) => SOURCES[key]));
  });

  it("returns an empty array for empty input", () => {
    expect(resolveAttribution([])).toEqual([]);
  });

  it("throws with the key name for an unknown key", () => {
    expect(() => resolveAttribution(["wotc", "bogus"])).toThrow(
      'Unknown attribution source "bogus"',
    );
  });
});
