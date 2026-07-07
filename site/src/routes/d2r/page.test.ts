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
  gameId: "d2r",
  sources: ["wasm"],
  name: "Diablo II: Resurrected",
  description: "Parses .d2s and .d2i saves",
  channel: "beta",
  coverage: "full",
  limitations: [],
  iconHtml: "",
  referenceModules: [{ name: "Drop Calculator", description: "drop odds", requires_save: false }],
};

function renderPage() {
  return render(Page, { props: { data: { game: mockGame } } });
}

describe("D2R landing page", () => {
  it("title and h1 carry the game plus an AI client name", () => {
    const { container } = renderPage();
    expect(document.title).toContain("Diablo II: Resurrected");
    expect(document.title).toMatch(/Claude|ChatGPT/);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toContain("D2R");
    expect(h1?.textContent).toMatch(/Claude|ChatGPT/);
  });

  it("renders the drop calculator module card", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll(".module-card")).toHaveLength(1);
    expect(container.textContent).toContain("Drop Calculator");
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

  it("makes the v105 Reign of the Warlock scope prominent and never claims classic LoD", () => {
    const { container } = renderPage();
    const text = container.textContent ?? "";
    expect(text).toContain("Reign of the Warlock");
    expect(text).toContain("v105");
    // The mod must be named as a mod, and vanilla D2R excluded explicitly.
    expect(text).toContain("mod that adds the Warlock class");
    expect(text.toLowerCase()).toContain("aren't the target");
    expect(text.toLowerCase()).toContain("aren't supported");
    expect(text).not.toMatch(
      /supports classic|classic (LoD|Lord of Destruction) (works|supported)/i,
    );
  });

  it("quotes only capture-verified numbers in demo copy", () => {
    const all = JSON.stringify(content.sections);
    // Vipermagi drop table at 81% MF (d2r2.jpeg)
    expect(all).toContain("81%");
    expect(all).toContain("5,228");
    expect(all).toContain("1:101");
    expect(all).toContain("1:444");
    expect(all).toContain("1:476");
    expect(all).toContain("1:579");
    // Atmus character card (d2r1.jpeg)
    expect(all).toContain("Atmus");
    expect(all).toContain("Level 75 Warlock");
  });

  it("ships social meta and JSON-LD pointing at the d2r OG card", () => {
    renderPage();
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/d2r.png",
    );
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/d2r",
    );
    const scripts = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => JSON.parse(s.textContent ?? "{}"));
    const webpage = scripts.find((d) => d["@type"] === "WebPage");
    expect(webpage?.about).toEqual({ "@type": "VideoGame", name: "Diablo II: Resurrected" });
  });

  it("hero mixes real conversation captures with a view render", () => {
    const frames = content.hero.frames ?? [];
    expect(frames.length).toBe(3);
    for (const frame of frames) {
      expect(frame.src).toMatch(/^\/images\/d2r\//);
    }
  });
});
