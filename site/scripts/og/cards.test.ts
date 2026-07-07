import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cards, OG_HEIGHT, OG_WIDTH } from "./cards.mjs";

describe("OG card definitions", () => {
  it("defines the standard OG image dimensions", () => {
    expect(OG_WIDTH).toBe(1200);
    expect(OG_HEIGHT).toBe(630);
  });

  it("covers every marketing page with a unique slug", () => {
    const slugs = cards.map((c) => c.slug);
    expect(slugs.toSorted()).toEqual([
      "docs",
      "games",
      "home",
      "magic",
      "poe",
      "privacy",
      "rimworld",
      "support",
      "terms",
    ]);
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

  it("references only screenshots that exist on disk", () => {
    // A renamed/deleted image would otherwise ship a broken-image card:
    // the generator's networkidle wait does not fail on a 404'd <img>.
    const staticDir = join(import.meta.dirname, "../../static");
    for (const card of cards) {
      expect(existsSync(join(staticDir, card.screenshot)), card.screenshot).toBe(true);
    }
  });
});
