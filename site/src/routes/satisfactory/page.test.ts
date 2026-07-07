/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/static/public", () => ({
  PUBLIC_APP_URL: "https://test-app.savecraft.gg",
}));

import Page from "./+page.svelte";
import { content } from "./content";

afterEach(cleanup);

const moduleNames = [
  "Recipe & Item Lookup",
  "Production Planner",
  "Milestone Navigator",
  "Power Calculator",
  "Space Elevator",
  "Hard Drive Tiers",
  "Building Reference",
];

const mockGame = {
  gameId: "satisfactory",
  sources: ["wasm"],
  name: "Satisfactory",
  description: "Parses .sav saves",
  channel: "alpha",
  coverage: "full",
  limitations: [],
  iconHtml: "",
  referenceModules: moduleNames.map((name) => ({
    name,
    description: name,
    requires_save: false,
  })),
};

function renderPage() {
  return render(Page, { props: { data: { game: mockGame } } });
}

describe("Satisfactory landing page", () => {
  it("title and h1 carry the game plus an AI client name", () => {
    const { container } = renderPage();
    expect(document.title).toContain("Satisfactory");
    expect(document.title).toMatch(/Claude|ChatGPT/);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toContain("Satisfactory");
    expect(h1?.textContent).toMatch(/Claude|ChatGPT/);
  });

  it("renders a module card per reference module", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll(".module-card")).toHaveLength(7);
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

  it("quotes only fixture-verified numbers in demo copy", () => {
    const all = JSON.stringify(content.sections);
    // Thermal Propulsion Rocket plan fixture
    expect(all).toContain("169 machines");
    expect(all).toContain("1,911.53 MW");
    expect(all).toContain("25 Iron Rod");
    expect(all).toContain("137.5 MW");
  });

  it("discloses the version window prominently", () => {
    const { container } = renderPage();
    const text = container.textContent ?? "";
    expect(text).toContain("1.0");
    expect(text).toContain("1.2");
    expect(text.toLowerCase()).toContain("rejected");
    expect(text.toLowerCase()).toContain("alpha");
  });

  it("ships social meta and JSON-LD pointing at the satisfactory OG card", () => {
    renderPage();
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/satisfactory.png",
    );
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/satisfactory",
    );
    const scripts = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => JSON.parse(s.textContent ?? "{}"));
    const webpage = scripts.find((d) => d["@type"] === "WebPage");
    expect(webpage?.about).toEqual({ "@type": "VideoGame", name: "Satisfactory" });
  });

  it("hero frames are view renders from the capture pipeline", () => {
    const frames = content.hero.frames ?? [];
    expect(frames.length).toBe(3);
    for (const frame of frames) {
      expect(frame.src).toMatch(/^\/images\/satisfactory\//);
    }
  });
});
