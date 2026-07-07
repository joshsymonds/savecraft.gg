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
  gameId: "poe2",
  sources: ["api"],
  name: "Path of Exile 2",
  description: "Live PoE2 characters via GGG API",
  channel: "alpha",
  coverage: "partial",
  limitations: [],
  iconHtml: "",
  referenceModules: [
    { name: "Economy Prices", description: "poe.ninja PoE2 prices", requires_save: false },
  ],
};

function renderPage() {
  return render(Page, { props: { data: { game: mockGame } } });
}

describe("PoE2 landing page", () => {
  it("title and h1 carry the game plus an AI client name", () => {
    const { container } = renderPage();
    expect(document.title).toContain("Path of Exile 2");
    expect(document.title).toMatch(/Claude|ChatGPT/);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toContain("Path of Exile 2");
    expect(h1?.textContent).toMatch(/Claude|ChatGPT/);
  });

  it("renders a demo-led hero (no image frames exist for poe2)", () => {
    const { container } = renderPage();
    expect(content.hero.frames).toBeUndefined();
    expect(content.hero.demo).toBeDefined();
    expect(container.querySelector(".demo-hero")).not.toBeNull();
  });

  it("renders the economy module card", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll(".module-card")).toHaveLength(1);
    expect(container.textContent).toContain("Economy Prices");
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

  it("never claims capabilities the adapter doesn't have", () => {
    const { container } = renderPage();
    const text = (container.textContent ?? "").toLowerCase();
    // Every mention of real-time must be a DENIAL ("not real-time") — the
    // data is refresh-based, and the page must say so.
    expect(text).toContain("not real-time");
    expect(text.replaceAll("not real-time", "")).not.toContain("real-time");
    expect(text).toContain("last refresh");
    // PoB2 must appear ONLY as roadmap, never as a live capability.
    expect(text).toContain("roadmap");
    expect(text).not.toMatch(/runs? (your|the) (build|character) through/);
    // The inventory limitation must be stated.
    expect(text).toContain("doesn't expose");
  });

  it("keeps PoE1 mechanics only in the without-Savecraft demo (the failure being shown)", () => {
    // "4-link" and Tabula are the hallucination joke; they must be confined
    // to the `without` side of the compare pair.
    const scrubbed = structuredClone(content);
    const withoutTexts: string[] = [];
    for (const section of scrubbed.sections) {
      if (section.kind !== "compare") continue;
      for (const pair of section.pairs) {
        withoutTexts.push(JSON.stringify(pair.without));
        pair.without = [];
      }
    }
    const everythingElse = JSON.stringify(scrubbed);
    expect(withoutTexts.join(" ")).toContain("4-link");
    expect(everythingElse).not.toContain("4-link");
    expect(everythingElse).not.toContain("Tabula");
  });

  it("demo character details match the adapter test fixture", () => {
    const all = JSON.stringify(content);
    expect(all).toContain("InfernalConcoction");
    expect(all).toContain("Chronomancer");
    expect(all).toContain("87");
    expect(all).toContain("Nubuck");
  });

  it("ships social meta and JSON-LD pointing at the poe2 OG card", () => {
    renderPage();
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/poe2.png",
    );
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/poe2",
    );
    const scripts = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => JSON.parse(s.textContent ?? "{}"));
    const webpage = scripts.find((d) => d["@type"] === "WebPage");
    expect(webpage?.about).toEqual({ "@type": "VideoGame", name: "Path of Exile 2" });
  });
});
