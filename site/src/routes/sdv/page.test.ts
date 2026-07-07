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
  gameId: "sdv",
  sources: ["wasm"],
  name: "Stardew Valley",
  description: "Parses Stardew Valley 1.6 saves",
  channel: "beta",
  coverage: "full",
  limitations: [],
  iconHtml: "",
  referenceModules: [
    { name: "Gift Preferences", description: "gift tastes", requires_save: false },
    { name: "Crop Planner", description: "crop data", requires_save: false },
  ],
};

function renderPage() {
  return render(Page, { props: { data: { game: mockGame } } });
}

describe("Stardew Valley landing page", () => {
  it("title and h1 carry the game plus an AI client name", () => {
    const { container } = renderPage();
    expect(document.title).toContain("Stardew Valley");
    expect(document.title).toMatch(/Claude|ChatGPT/);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toContain("Stardew Valley");
    expect(h1?.textContent).toMatch(/Claude|ChatGPT/);
  });

  it("renders a demo-led hero (no image frames exist for sdv)", () => {
    const { container } = renderPage();
    expect(content.hero.frames).toBeUndefined();
    expect(content.hero.demo).toBeDefined();
    expect(container.querySelector(".demo-hero")).not.toBeNull();
  });

  it("renders both module cards", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll(".module-card")).toHaveLength(2);
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

  it("quotes only module-data-verified gift and crop facts", () => {
    const all = JSON.stringify(content);
    // Sebastian's loved list, verbatim from data.go taste tables
    for (const item of [
      "Frozen Tear",
      "Obsidian",
      "Void Egg",
      "Sashimi",
      "Pumpkin Soup",
      "Frog Egg",
    ]) {
      expect(all).toContain(item);
    }
    // Clay is on his hate list in the data; the demo leans on it
    expect(all).toContain("Clay");
    // Crop math from data_crops.go: Starfruit 13d/750g/400g, Ancient Fruit 28d/7d regrow/550g
    expect(all).toContain("13 days");
    expect(all).toContain("750g");
    expect(all).toContain("400g");
    expect(all).toContain("28 days");
    expect(all).toContain("550g");
  });

  it("discloses the 1.6-only and beta limits", () => {
    const { container } = renderPage();
    const text = container.textContent ?? "";
    expect(text).toContain("1.6");
    expect(text.toLowerCase()).toContain("beta");
    expect(text.toLowerCase()).toContain("aren't supported");
  });

  it("ships social meta and JSON-LD pointing at the sdv OG card", () => {
    renderPage();
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/sdv.png",
    );
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/sdv",
    );
    const scripts = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => JSON.parse(s.textContent ?? "{}"));
    const webpage = scripts.find((d) => d["@type"] === "WebPage");
    expect(webpage?.about).toEqual({ "@type": "VideoGame", name: "Stardew Valley" });
  });
});
