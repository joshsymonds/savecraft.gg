import { describe, expect, it } from "vitest";

import { cards, OG_HEIGHT, OG_WIDTH } from "./cards.mjs";

describe("OG card definitions", () => {
  it("defines the standard OG image dimensions", () => {
    expect(OG_WIDTH).toBe(1200);
    expect(OG_HEIGHT).toBe(630);
  });

  it("covers all four marketing pages with unique slugs", () => {
    const slugs = cards.map((c) => c.slug);
    expect(slugs.toSorted()).toEqual(["games", "home", "magic", "poe"]);
  });

  it("gives every card the fields the template needs", () => {
    for (const card of cards) {
      expect(card.eyebrow.length, card.slug).toBeGreaterThan(0);
      expect(card.title.length, card.slug).toBeGreaterThan(0);
      expect(card.screenshot, card.slug).toMatch(/^images\/.+\.(jpe?g|png)$/);
    }
  });

  it("gives each page a distinct screenshot", () => {
    const shots = cards.map((c) => c.screenshot);
    expect(new Set(shots).size).toBe(shots.length);
  });
});
