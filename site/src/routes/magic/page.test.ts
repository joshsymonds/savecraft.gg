/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/static/public", () => ({
  PUBLIC_APP_URL: "https://test-app.savecraft.gg",
}));

import Page from "./+page.svelte";
import { withCommander, withStandard } from "./demos";

afterEach(cleanup);

const mockGame = {
  gameId: "magic",
  sources: ["wasm"],
  name: "Magic: The Gathering",
  description: "Parses Player.log…",
  channel: "beta",
  coverage: "partial",
  limitations: [],
  iconHtml: "",
  referenceModules: [
    { name: "Rules Search", description: "search rules", requires_save: false },
    { name: "Card Search", description: "search cards", requires_save: false },
    { name: "Card Stats", description: "17Lands stats", requires_save: false },
    { name: "Draft Advisor", description: "WASPAS draft picks", requires_save: false },
    { name: "Deck Health & Cut Advisor", description: "deckbuilding", requires_save: false },
    { name: "Commander Lookup", description: "EDHREC recommendations", requires_save: false },
    { name: "Commander Deck Review", description: "EDHREC review", requires_save: false },
    { name: "Commander Combo Search", description: "EDHREC combos", requires_save: false },
    { name: "Commander Trends", description: "EDHREC trends", requires_save: false },
    { name: "Collection Diff", description: "wildcard cost", requires_save: true },
    { name: "Match Stats", description: "your matches", requires_save: true },
    { name: "Play Advisor", description: "your per-turn play", requires_save: true },
    { name: "Sideboard Analysis", description: "your BO3 records", requires_save: true },
  ],
};

describe("Magic landing page reframe", () => {
  it("no longer calls itself 'Magic: The Gathering Arena' in user-facing hero copy", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const hero = container.querySelector(".hero");
    expect(hero?.textContent).not.toContain("Magic: The Gathering Arena");
  });

  it("renders EDHREC in the proof bar", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const proofBar = container.querySelector(".proof-bar");
    expect(proofBar?.textContent).toContain("EDHREC");
  });

  it("renders a Commander Advisor coaching mode card", () => {
    const { getByText } = render(Page, { props: { data: { game: mockGame } } });
    expect(getByText("COMMANDER ADVISOR")).toBeInTheDocument();
    expect(getByText("DRAFT COACH")).toBeInTheDocument();
    expect(getByText("DECK DOCTOR")).toBeInTheDocument();
  });

  it("renders 13 module cards with ModuleBadge on each", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const cards = container.querySelectorAll(".module-card");
    expect(cards).toHaveLength(13);
    const badges = container.querySelectorAll(".module-card .module-title-row");
    expect(badges).toHaveLength(13);
  });

  it("dropped the two-tier TRY-IT-NOW/GO-DEEPER model for the game-centric spine", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    // The rejected two-tier plumbing menu is gone entirely.
    expect(container.querySelector(".tiers-grid")).toBeNull();
    expect(container.querySelector(".tier-card")).toBeNull();
    // Normalize whitespace so assertions don't depend on Prettier's line wrapping
    // of the source Svelte file (textContent preserves indentation newlines).
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).not.toContain("Two ways in");
    expect(text).not.toContain("GO DEEPER");
    expect(text).not.toContain("TRY IT NOW");
    // Replaced by the one-verb spine: reference is instant, the Player.log
    // path is Magic's nature, and the honest collection limit is stated.
    expect(text).toContain("Add Magic.");
    expect(text).toContain("Reference, immediately");
    expect(text).toContain("Player.log");
    expect(text).toContain("ownership is the one thing Savecraft can't see");
  });

  it("renders an EDHREC methodology entry", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const sources = container.querySelectorAll(".method-source");
    const texts = Array.from(sources).map((s) => s.textContent?.trim());
    expect(texts).toContain("EDHREC");
  });

  // ConversationDemo animates messages in after mount, so the "with Savecraft"
  // answers never appear in jsdom — assert on the demo data directly.
  it("recommends Standard-legal Sephiroth, not rotated Archfiend of the Dross", () => {
    const answer = withStandard.map((m) => m.text).join(" ");
    expect(answer).not.toContain("Archfiend of the Dross");
    expect(answer).toContain("Sephiroth");
  });

  it("uses the evergreen rotation caption, not a dated one", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const text = container.textContent ?? "";
    expect(text).not.toContain("6 months ago");
    expect(text).toContain("Stale training data");
  });

  it("makes no combo-database claims while combo ingest is broken", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const rendered = (container.textContent ?? "").replace(/\s+/g, " ");
    const demoData = withCommander.map((m) => m.text).join(" ");
    for (const text of [rendered, demoData]) {
      expect(text).not.toContain("Chain Veil");
      expect(text).not.toContain("combo lines");
      expect(text).not.toContain("Dockside Extortionist");
    }
  });

  it("contains no stale or fabricated 17Lands stats", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const text = container.textContent ?? "";
    // Liliana/Elenda stale FDN numbers and Raphael's invented GIH WR
    expect(text).not.toContain("63.6%");
    expect(text).not.toContain("60.3%");
    expect(text).not.toContain("52.3%");
  });

  it("ships social meta and JSON-LD pointing at the magic OG card", () => {
    render(Page, { props: { data: { game: mockGame } } });
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/magic.png",
    );
    expect(document.head.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe(
      "summary_large_image",
    );
    expect(document.head.querySelector('script[type="application/ld+json"]')).not.toBeNull();
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
});
