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
  "Technology Search",
  "Technology Path",
  "Building Search",
  "Ship Component Search",
  "Tradition & Ascension Perk Search",
  "Species & Leader Trait Search",
  "Civic & Origin Search",
  "Edict & Policy Search",
  "Empire Health Diagnosis",
  "Pop Job Search",
];

const mockGame = {
  gameId: "stellaris",
  sources: ["wasm"],
  name: "Stellaris",
  description: "Parses Stellaris saves",
  channel: "beta",
  coverage: "full",
  limitations: [],
  iconHtml: "",
  referenceModules: moduleNames.map((name) => ({
    name,
    description: name,
    requires_save: name === "Empire Health Diagnosis",
  })),
};

function renderPage() {
  return render(Page, { props: { data: { game: mockGame } } });
}

describe("Stellaris landing page", () => {
  it("title and h1 carry the game plus an AI client name", () => {
    const { container } = renderPage();
    expect(document.title).toContain("Stellaris");
    expect(document.title).toMatch(/Claude|ChatGPT/);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toContain("Stellaris");
    expect(h1?.textContent).toMatch(/Claude|ChatGPT/);
  });

  it("renders a module card per reference module", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll(".module-card")).toHaveLength(10);
    expect(container.textContent).toContain("Empire Health Diagnosis");
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
    // Devouring Swarm audit (stellaris2.jpg)
    expect(all).toContain("1,068");
    expect(all).toContain("43-month");
    expect(all).toContain("148 months");
    expect(all).toContain("4,530");
    // Prethoryn crisis fixture (empirehealth-empire-in-crisis.png)
    expect(all).toContain("423");
    expect(all).toContain("312");
    expect(all).toContain("1,840");
    // Battleships path (stellaris1.jpg)
    expect(all).toContain("6,500");
    expect(all).toContain("2,000");
    expect(all).toContain("4,000");
  });

  it("discloses the ironman and planet-summary limitations", () => {
    const { container } = renderPage();
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).toContain("ironman");
    expect(text).toContain("untested");
    expect(text).toContain("summary");
    expect(text).not.toContain("real-time");
  });

  it("says the save file stays local", () => {
    const { container } = renderPage();
    expect(container.textContent).toContain("never leaves your machine");
  });

  it("ships social meta and JSON-LD pointing at the stellaris OG card", () => {
    renderPage();
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/stellaris.png",
    );
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/stellaris",
    );
    const scripts = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => JSON.parse(s.textContent ?? "{}"));
    const webpage = scripts.find((d) => d["@type"] === "WebPage");
    expect(webpage?.about).toEqual({ "@type": "VideoGame", name: "Stellaris" });
  });

  it("hero mixes real conversation captures with view renders", () => {
    const frames = content.hero.frames ?? [];
    expect(frames.length).toBe(3);
    for (const frame of frames) {
      expect(frame.src).toMatch(/^\/images\/stellaris\//);
    }
  });
});
