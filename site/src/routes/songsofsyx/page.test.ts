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
  gameId: "songsofsyx",
  sources: ["mod"],
  name: "Songs of Syx",
  description: "Reference from the game's own shipped data",
  channel: "alpha",
  coverage: "partial",
  limitations: [],
  iconHtml: "",
  referenceModules: [
    { name: "Mechanics Guide", description: "guide", requires_save: false },
    { name: "Room & Building Lookup", description: "rooms", requires_save: false },
    { name: "Resource Lookup", description: "resources", requires_save: false },
    { name: "Race & Species Lookup", description: "races", requires_save: false },
    { name: "Knowledge Tree Lookup", description: "tech", requires_save: false },
  ],
};

function renderPage() {
  return render(Page, { props: { data: { game: mockGame } } });
}

describe("Songs of Syx landing page", () => {
  it("title and h1 carry the game plus an AI client name", () => {
    const { container } = renderPage();
    expect(document.title).toContain("Songs of Syx");
    expect(document.title).toMatch(/Claude|ChatGPT/);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toContain("Songs of Syx");
    expect(h1?.textContent).toMatch(/Claude|ChatGPT/);
  });

  it("renders a demo-led hero and all five module cards", () => {
    const { container } = renderPage();
    expect(content.hero.frames).toBeUndefined();
    expect(container.querySelector(".demo-hero")).not.toBeNull();
    expect(container.querySelectorAll(".module-card")).toHaveLength(5);
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

  it("never claims live colony state works today", () => {
    const { container } = renderPage();
    const text = (container.textContent ?? "").toLowerCase();
    // The mod-pending honesty must be present and unambiguous.
    expect(text).toContain("not yet shipped");
    expect(text).toContain("roadmap");
    expect(text).toContain("reference-only");
    // No claim that the mod pushes state today.
    expect(text).not.toMatch(/mod (pushes|exports) your (live )?colony/);
    expect(text).toContain("alpha");
  });

  it("quotes only generated-data-verified facts in demo copy", () => {
    const all = JSON.stringify(content);
    // Cretonian entry, verbatim from races_gen.go
    expect(all).toContain("Cretonians");
    expect(all).toContain("excel at farming and thrive in temperate and warm climates");
    expect(all).toContain("vegetables, bread, and fruit");
    // Room count from rooms_gen.go (112 Name: entries)
    expect(all).toContain("112 rooms");
  });

  it("ships social meta and JSON-LD pointing at the songsofsyx OG card", () => {
    renderPage();
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/songsofsyx.png",
    );
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/songsofsyx",
    );
    const scripts = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => JSON.parse(s.textContent ?? "{}"));
    const webpage = scripts.find((d) => d["@type"] === "WebPage");
    expect(webpage?.about).toEqual({ "@type": "VideoGame", name: "Songs of Syx" });
  });
});
