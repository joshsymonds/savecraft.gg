/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/static/public", () => ({
  PUBLIC_APP_URL: "https://test-app.savecraft.gg",
}));

import Page from "./+page.svelte";

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

  it("derives the instant tier from requires_save (9 instant modules from the mock)", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const tierInstant = container.querySelector(".tier-instant")?.parentElement;
    const items = tierInstant?.querySelectorAll(".tier-features li");
    expect(items).toHaveLength(9);
  });

  it("renders an EDHREC methodology entry", () => {
    const { container } = render(Page, { props: { data: { game: mockGame } } });
    const sources = container.querySelectorAll(".method-source");
    const texts = Array.from(sources).map((s) => s.textContent?.trim());
    expect(texts).toContain("EDHREC");
  });
});
