import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { cards, OG_HEIGHT, OG_WIDTH } from "./cards.mjs";

describe("OG card definitions", () => {
  it("defines the standard OG image dimensions", () => {
    expect(OG_WIDTH).toBe(1200);
    expect(OG_HEIGHT).toBe(630);
  });

  it("covers every page route with a unique slug (derived from the filesystem)", () => {
    // Derive the expected slug set from the routes on disk so a new
    // landing page without an OG card fails this test automatically.
    const routesDir = resolve(import.meta.dirname, "../../src/routes");
    const expected: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, `${prefix}${entry.name}/`);
        else if (entry.name === "+page.svelte") {
          const route = prefix.replace(/\/$/, "");
          expected.push(route === "" ? "home" : route);
        }
      }
    };
    walk(routesDir, "");
    const slugs = cards.map((c) => c.slug);
    expect(slugs.toSorted()).toEqual(expected.toSorted());
  });

  it("gives every card the fields the template needs", () => {
    for (const card of cards) {
      expect(card.eyebrow.length, card.slug).toBeGreaterThan(0);
      expect(card.title.length, card.slug).toBeGreaterThan(0);
      expect(card.screenshot, card.slug).toMatch(/^images\/.+\.(jpe?g|png|webp)$/);
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
