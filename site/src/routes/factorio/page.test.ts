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
  "Tech Tree Navigator",
  "Production Ratio Calculator",
  "Oil Processing Balancer",
  "Power Generation Calculator",
  "Blueprint Analyzer",
  "Evolution & Threat Tracker",
  "Module & Beacon Optimizer",
  "Factory Health Diagnosis",
  "Quality Tier Calculator",
  "Train Throughput Calculator",
];

const mockGame = {
  gameId: "factorio",
  sources: ["wasm", "mod"],
  name: "Factorio",
  description: "Lua mod exports game state",
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

describe("Factorio landing page", () => {
  it("title and h1 carry the game plus an AI client name", () => {
    const { container } = renderPage();
    expect(document.title).toContain("Factorio");
    expect(document.title).toMatch(/Claude|ChatGPT/);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toContain("Factorio");
    expect(h1?.textContent).toMatch(/Claude|ChatGPT/);
  });

  it("renders a module card per reference module", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll(".module-card")).toHaveLength(11);
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

  it("quotes only capture-verified numbers in demo copy", () => {
    const all = JSON.stringify(content.sections);
    // Bottlenecked-factory diagnosis fixture
    expect(all).toContain("38 a minute");
    expect(all).toContain("1,175");
    expect(all).toContain("+1,960");
    expect(all).toContain("538");
    expect(all).toContain("540");
    // Artillery tech-path capture
    expect(all).toContain("12h 30m");
    expect(all).toContain("172");
  });

  it("discloses the mod requirement and points at the mod portal, never the Workshop", () => {
    const { container } = renderPage();
    const text = container.textContent ?? "";
    expect(text).toContain("Factorio mod portal");
    expect(text).toContain("Export mod");
    expect(text).not.toContain("Steam Workshop");
  });

  it("discloses the modded-content limitation without carving out working expansion coverage", () => {
    const { container } = renderPage();
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).toContain("vanilla");
    expect(text).toContain("modded recipes");
    expect(text).toContain("alpha");
    // The stale manifest wording "base-game only" must not appear: the page's
    // own demos show expansion techs and the quality calculator.
    expect(text).not.toContain("base-game only");
  });

  it("ships social meta and JSON-LD pointing at the factorio OG card", () => {
    renderPage();
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/factorio.png",
    );
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/factorio",
    );
    const scripts = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => JSON.parse(s.textContent ?? "{}"));
    const webpage = scripts.find((d) => d["@type"] === "WebPage");
    expect(webpage?.about).toEqual({ "@type": "VideoGame", name: "Factorio" });
  });

  it("hero mixes the real conversation capture with view renders", () => {
    const frames = content.hero.frames ?? [];
    expect(frames.length).toBe(3);
    for (const frame of frames) {
      expect(frame.src).toMatch(/^\/images\/factorio\//);
    }
  });
});
