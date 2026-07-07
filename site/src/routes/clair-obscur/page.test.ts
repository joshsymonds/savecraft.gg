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
  gameId: "clair-obscur",
  sources: ["wasm"],
  name: "Clair Obscur: Expedition 33",
  description: "Parses Clair Obscur saves",
  channel: "alpha",
  coverage: "partial",
  limitations: [],
  iconHtml: "",
  referenceModules: [],
};

function renderPage() {
  return render(Page, { props: { data: { game: mockGame } } });
}

describe("Clair Obscur landing page", () => {
  it("title and h1 carry the game plus an AI client name", () => {
    const { container } = renderPage();
    expect(document.title).toContain("Clair Obscur: Expedition 33");
    expect(document.title).toMatch(/Claude|ChatGPT/);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toContain("Expedition 33");
    expect(h1?.textContent).toMatch(/Claude|ChatGPT/);
  });

  it("renders a demo-led hero and NO module grid (zero reference modules)", () => {
    const { container } = renderPage();
    expect(content.hero.frames).toBeUndefined();
    expect(container.querySelector(".demo-hero")).not.toBeNull();
    expect(container.querySelectorAll(".module-card")).toHaveLength(0);
    expect(content.sections.some((s) => s.kind === "modules")).toBe(false);
  });

  it("uses at least 3 distinct section treatments without the modules section", () => {
    const { container } = renderPage();
    const used = new Set(
      ["plain", "tinted", "bleed"].filter(
        (t) => container.querySelector(`.treatment-${t}`) !== null,
      ),
    );
    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  it("claims only documented save sections", () => {
    const all = JSON.stringify(content);
    // Terms verbatim from docs/games.md: Lumina allocations, NG+ cycle,
    // per-character sheets, party, inventory, progression, weapons.
    expect(all).toContain("Lumina allocations");
    expect(all).toContain("New Game+");
    expect(all).toContain("progression");
    // The parser reads Pictos only insofar as Luminas surface; the copy
    // must not claim a Pictos section it doesn't have.
    expect(all).not.toMatch(/parses? (your )?Pictos/i);
  });

  it("makes the no-invented-formulas stance explicit and keeps fake math in the without-demo", () => {
    const { container } = renderPage();
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).toContain("aren't publicly documented");
    expect(text).toContain("aren't categorized");
    // The invented 2.5x crit multiplier lives ONLY in the without side.
    const scrubbed = structuredClone(content);
    const withoutTexts: string[] = [];
    for (const section of scrubbed.sections) {
      if (section.kind !== "compare") continue;
      for (const pair of section.pairs) {
        // The caption calling out the fake number is part of the
        // without-side framing; scrub it with the demo messages.
        withoutTexts.push(JSON.stringify(pair.without), pair.withoutCaption);
        pair.without = [];
        pair.withoutCaption = "";
      }
    }
    expect(withoutTexts.join(" ")).toContain("2.5x");
    expect(JSON.stringify(scrubbed)).not.toContain("2.5x");
  });

  it("ships social meta and JSON-LD pointing at the clair-obscur OG card", () => {
    renderPage();
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/clair-obscur.png",
    );
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/clair-obscur",
    );
    const scripts = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => JSON.parse(s.textContent ?? "{}"));
    const webpage = scripts.find((d) => d["@type"] === "WebPage");
    expect(webpage?.about).toEqual({
      "@type": "VideoGame",
      name: "Clair Obscur: Expedition 33",
    });
  });
});
