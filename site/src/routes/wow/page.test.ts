/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/static/public", () => ({
  PUBLIC_APP_URL: "https://test-app.savecraft.gg",
}));

import Page from "./+page.svelte";
import { content } from "./content";

afterEach(cleanup);

const mockGame = {
  gameId: "wow",
  sources: ["api"],
  name: "World of Warcraft",
  description: "Battle.net character profiles",
  channel: "beta",
  coverage: "partial",
  limitations: [],
  iconHtml: "",
  referenceModules: [
    { name: "Ability Lookup", description: "spells", requires_save: false },
    { name: "Dungeon Guide", description: "bosses", requires_save: false },
    { name: "Gear Audit", description: "gear flags", requires_save: true },
    { name: "Season Info", description: "rotation", requires_save: false },
  ],
};

function renderPage() {
  return render(Page, { props: { data: { game: mockGame } } });
}

describe("WoW landing page", () => {
  it("title and h1 carry the game plus an AI client name", () => {
    const { container } = renderPage();
    expect(document.title).toContain("World of Warcraft");
    expect(document.title).toMatch(/Claude|ChatGPT/);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toContain("World of Warcraft");
    expect(h1?.textContent).toMatch(/Claude|ChatGPT/);
  });

  it("renders a demo-led hero and all four module cards", () => {
    const { container } = renderPage();
    expect(content.hero.frames).toBeUndefined();
    expect(container.querySelector(".demo-hero")).not.toBeNull();
    expect(container.querySelectorAll(".module-card")).toHaveLength(4);
  });

  it("uses at least 3 distinct section treatments", () => {
    const { container } = renderPage();
    const used = new Set(
      ["plain", "tinted", "bleed"].filter(
        (t) => container.querySelector(`.treatment-${t}`) !== null,
      ),
    );
    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  it("quotes only fixture-verified character details in demo copy", () => {
    const all = JSON.stringify(content);
    // Dratnos fixture: rating 2524.7, timed 12s in The Rookery + Darkflame
    // Cleft, +10 Operation: Floodgate
    expect(all).toContain("Dratnos");
    expect(all).toContain("2524");
    expect(all).toContain("The Rookery");
    expect(all).toContain("Darkflame Cleft");
    expect(all).toContain("Floodgate");
  });

  it("never overclaims: logout freshness, no inventory, no combat logs", () => {
    const { container } = renderPage();
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).toContain("on logout");
    expect(text).toContain("not in real-time");
    expect(text.replaceAll("not in real-time", "")).not.toContain("real-time");
    expect(text).toContain("doesn't expose bags or bank");
    expect(text).toContain("roadmap");
    expect(text).toContain("beta");
  });

  it("keeps the stale-rotation joke confined to the without-Savecraft demo", () => {
    const scrubbed = structuredClone(content);
    const withoutTexts: string[] = [];
    for (const section of scrubbed.sections) {
      if (section.kind !== "compare") continue;
      for (const pair of section.pairs) {
        withoutTexts.push(JSON.stringify(pair.without));
        pair.without = [];
      }
    }
    expect(withoutTexts.join(" ")).toContain("Mists of Tirna Scithe");
    expect(JSON.stringify(scrubbed)).not.toContain("Mists of Tirna Scithe");
  });

  it("ships social meta and JSON-LD pointing at the wow OG card", () => {
    renderPage();
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/wow.png",
    );
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/wow",
    );
    const scripts = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => JSON.parse(s.textContent ?? "{}"));
    const webpage = scripts.find((d) => d["@type"] === "WebPage");
    expect(webpage?.about).toEqual({ "@type": "VideoGame", name: "World of Warcraft" });
  });
});
