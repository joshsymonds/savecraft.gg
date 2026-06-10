/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/static/public", () => ({
  PUBLIC_APP_URL: "https://test-app.savecraft.gg",
}));

import Page from "./+page.svelte";
import { withPoB } from "./demos";

afterEach(cleanup);

const mockGame = {
  gameId: "poe",
  sources: ["adapter"],
  name: "Path of Exile",
  description: "PoB analysis",
  channel: "beta",
  coverage: "partial",
  limitations: [],
  iconHtml: "",
  referenceModules: [
    { name: "Build Planner", description: "PoB calc", requires_save: false },
    { name: "Gem Search", description: "gems", requires_save: false },
    { name: "Passive Tree Search", description: "tree nodes", requires_save: false },
    { name: "Unique Item Search", description: "uniques", requires_save: false },
    { name: "Economy Prices", description: "poe.ninja", requires_save: false },
    { name: "Mod Search", description: "item mods", requires_save: false },
  ],
};

describe("PoE landing page", () => {
  it("renders the hero with PoB positioning", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const hero = container.querySelector(".hero");
    expect(hero?.textContent).toContain("Path of Building");
  });

  it("renders a module card per reference module", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    expect(container.querySelectorAll(".module-card")).toHaveLength(6);
  });

  it("uses at least 3 distinct section treatments", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const used = new Set(
      ["plain", "tinted", "bleed"].filter(
        (t) => container.querySelector(`.treatment-${t}`) !== null,
      ),
    );
    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  // ConversationDemo animates messages in after mount, so the "with Savecraft"
  // answer never appears in jsdom — assert on the demo data directly.
  it("pitches Heart of Ice as tree points, not a purchasable cluster", () => {
    const answer = withPoB.map((m) => m.text).join(" ");
    expect(answer).toContain("Heart of Ice");
    expect(answer).toContain("tree");
    expect(answer).not.toContain("cluster");
    expect(answer).not.toContain("12 div");
  });

  it("contains no fabricated item claims", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    // Headhunter has no "jewel slot mods"; Taste of Hate has no chaos
    // conversion; +1-gems amulets grant no max res; ToH is not 14 div.
    expect(text).not.toContain("jewel slot mods");
    expect(text).not.toContain("chaos conversion");
    expect(text).not.toContain("+4% max resists");
    expect(text).not.toContain("Taste of Hate (14 div)");
  });

  it("economy demo quotes items verified against poe.ninja", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const text = container.textContent ?? "";
    expect(text).toContain("Bottled Faith");
    expect(text).toContain("Ashes of the Stars");
  });

  it("ships social meta and JSON-LD pointing at the poe OG card", () => {
    render(Page, { props: { data: { game: mockGame } } });
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/poe.png",
    );
    expect(document.head.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe(
      "summary_large_image",
    );
    expect(document.head.querySelector('script[type="application/ld+json"]')).not.toBeNull();
  });

  it("tree audit swap arithmetic is stated correctly", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const text = container.textContent ?? "";
    // Frees 6 points, spends 7 — it costs a point, it doesn't save one.
    expect(text).not.toContain("saves 1 point");
    expect(text).toContain("one extra point");
  });
});
