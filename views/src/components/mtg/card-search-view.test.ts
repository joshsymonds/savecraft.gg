import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import CardSearch from "../../../../plugins/mtga/reference/views/card-search.svelte";

afterEach(cleanup);

const bolt = {
  name: "Lightning Bolt",
  manaCost: "{R}",
  typeLine: "Instant",
  oracleText: "Lightning Bolt deals 3 damage to any target.",
  colors: ["R"],
  colorIdentity: ["R"],
  rarity: "common",
};

const sheoldred = {
  name: "Sheoldred, the Apocalypse",
  manaCost: "{2}{B}{B}",
  typeLine: "Legendary Creature — Phyrexian Praetor",
  oracleText: "Deathtouch\nWhenever you draw a card, you gain 2 life.\nWhenever an opponent draws a card, they lose 2 life.",
  colors: ["B"],
  colorIdentity: ["B"],
  rarity: "mythic",
};

describe("CardSearch view", () => {
  it("renders card names from results", () => {
    const { container } = render(CardSearch, {
      props: { data: { cards: [bolt, sheoldred], total: 2 } },
    });
    expect(container.textContent).toContain("Lightning Bolt");
    expect(container.textContent).toContain("Sheoldred");
  });

  it("renders mana pips for cards", () => {
    const { container } = render(CardSearch, {
      props: { data: { cards: [bolt], total: 1 } },
    });
    const pips = container.querySelectorAll(".pip");
    expect(pips.length).toBeGreaterThan(0);
  });

  it("renders empty state when no cards", () => {
    const { container } = render(CardSearch, {
      props: { data: { cards: [], total: 0 } },
    });
    expect(container.textContent).toContain("No cards found");
  });

  it("renders multiple cards in a grid", () => {
    const { container } = render(CardSearch, {
      props: { data: { cards: [bolt, sheoldred], total: 2 } },
    });
    const cards = container.querySelectorAll(".mtg-card");
    expect(cards.length).toBe(2);
  });
});
