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
  gameId: "rimworld",
  sources: ["mod"],
  name: "RimWorld",
  description: "Colony state via in-game mod",
  channel: "alpha",
  coverage: "full",
  limitations: [],
  iconHtml: "",
  referenceModules: [
    { name: "Surgery Success Calculator", description: "surgery", requires_save: false },
    { name: "Crop Production Optimizer", description: "crops", requires_save: false },
    { name: "Weapon & Armor Combat Calculator", description: "combat", requires_save: false },
    { name: "Material & Item Stat Lookup", description: "materials", requires_save: false },
    { name: "Drug Economy & Addiction Analyzer", description: "drugs", requires_save: false },
    { name: "Colony Wealth & Raid Threat Estimator", description: "raids", requires_save: false },
    { name: "Gene Metabolism & Xenotype Builder", description: "genes", requires_save: false },
    {
      name: "Research Tree & Crafting Chain Navigator",
      description: "research",
      requires_save: false,
    },
  ],
};

function renderPage() {
  return render(Page, { props: { data: { game: mockGame } } });
}

describe("RimWorld landing page", () => {
  it("hero names RimWorld and an AI client, and leads with real formulas", () => {
    const { container } = renderPage();
    const hero = container.querySelector(".hero");
    expect(hero?.textContent).toContain("RimWorld");
    expect(hero?.textContent).toContain("Claude");
    expect(hero?.textContent?.toLowerCase()).toContain("formula");
  });

  it("title and h1 carry the game plus an AI client name", () => {
    const { container } = renderPage();
    expect(document.title).toContain("RimWorld");
    expect(document.title).toMatch(/Claude|ChatGPT/);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toContain("RimWorld");
    expect(h1?.textContent).toMatch(/Claude|ChatGPT/);
  });

  it("renders a module card per reference module", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll(".module-card")).toHaveLength(8);
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

  // Every number in demo copy must be a verbatim module fixture output —
  // the same data rendered in the hero captures. Guard the load-bearing ones.
  it("quotes only fixture-verified numbers in demo copy", () => {
    const allDemoText = JSON.stringify(content.sections);
    // Surgery: 12.6% from 0.35 x 0.80 x 0.60 at 1.50 difficulty
    expect(allDemoText).toContain("12.6%");
    expect(allDemoText).toContain("0.35");
    // Raid: 6,200 = 3,800 wealth + 2,400 colonists
    expect(allDemoText).toContain("6,200");
    expect(allDemoText).toContain("3,800");
    expect(allDemoText).toContain("2,400");
    // Combat: bolt-action 4.68 of 5.50 raw at 85%
    expect(allDemoText).toContain("4.68");
    expect(allDemoText).toContain("5.50");
    // Crops: devilstrand on gravel 0.49x, 46.8 days, 0.342 silver
    expect(allDemoText).toContain("0.49x");
    expect(allDemoText).toContain("46.8");
    expect(allDemoText).toContain("0.342");
  });

  it("never overclaims: no modded-content support, no real-time sync", () => {
    const { container } = renderPage();
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toContain("real-time");
    expect(text).not.toContain("all mods");
    expect(text).not.toContain("any mod");
    // The honest vanilla-only limitation must actually be on the page.
    expect(text).toContain("vanilla");
    expect(text).toContain("aren't parsed yet");
  });

  it("points players at the Steam Workshop install path", () => {
    const { container } = renderPage();
    expect(container.textContent).toContain("Steam Workshop");
  });

  it("ships social meta and JSON-LD pointing at the rimworld OG card", () => {
    renderPage();
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/rimworld.png",
    );
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/rimworld",
    );
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="twitter:title"]')?.getAttribute("content")).toBe(
      "Savecraft -- RimWorld's Real Formulas for Your AI",
    );
    const scripts = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => JSON.parse(s.textContent ?? "{}"));
    const webpage = scripts.find((d) => d["@type"] === "WebPage");
    expect(webpage?.about).toEqual({ "@type": "VideoGame", name: "RimWorld" });
  });

  it("hero frames are real view renders from the capture pipeline", () => {
    for (const frame of content.hero.frames ?? []) {
      expect(frame.src).toMatch(/^\/images\/rimworld\/[a-z-]+\.(png|webp)$/);
    }
    expect(content.hero.frames?.length).toBeGreaterThanOrEqual(3);
  });
});
