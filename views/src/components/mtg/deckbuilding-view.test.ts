import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Deckbuilding from "../../../../plugins/mtga/reference/views/deckbuilding.svelte";

afterEach(cleanup);

const healthCheck = {
  mode: "health_check",
  set: "MKM",
  archetype: "WB",
  sections: [
    { name: "Creature Count", status: "good", actual: 15, expected: "14-17", note: "On target" },
    { name: "Removal", status: "warning", actual: 2, expected: "3-5", note: "Light on removal" },
    { name: "Mana Curve", status: "issue", actual: "top-heavy", expected: "balanced", note: "Too many 5+ drops" },
  ],
  mana: { lands: 17, sources: { W: 9, B: 8 } },
  alternatives: [],
  unresolved_cards: [],
};

const cutAdvisor = {
  mode: "cut_advisor",
  set: "MKM",
  archetype: "WB",
  cuts_requested: 3,
  candidates: [
    { card: "Granite Witness", score: 0.15, reason: "Weakest performer, off-color" },
    { card: "Basilica Stalker", score: 0.28, reason: "Below curve, replaceable" },
    { card: "Undercity Sewers", score: 0.35, reason: "Enters tapped, have enough fixing" },
  ],
};

describe("Deckbuilding view", () => {
  describe("health check", () => {
    it("renders section names", () => {
      const { container } = render(Deckbuilding, { props: { data: healthCheck } });
      expect(container.textContent).toContain("Creature Count");
      expect(container.textContent).toContain("Removal");
    });

    it("renders status indicators", () => {
      const { container } = render(Deckbuilding, { props: { data: healthCheck } });
      expect(container.textContent).toContain("good");
      expect(container.textContent).toContain("warning");
      expect(container.textContent).toContain("issue");
    });

    it("renders archetype", () => {
      const { container } = render(Deckbuilding, { props: { data: healthCheck } });
      expect(container.textContent).toContain("WB");
    });
  });

  describe("constructed", () => {
    const constructed = {
      mode: "constructed",
      format: "standard",
      total_cards: 60,
      composition: { creatures: 25, noncreatures: 11, lands: 24 },
      sideboard_count: 15,
      curve: [
        { cmc: 1, count: 8 },
        { cmc: 2, count: 11 },
        { cmc: 3, count: 4 },
      ],
      mana: {
        pip_distribution: { W: 18, U: 14 },
        colors: [
          { color: "W", color_name: "White", sources_needed: 16, sources_actual: 14, surplus: -2, status: "warning", most_demanding: "The Wandering Emperor", cost_pattern: "2WW", is_gold_adjusted: false },
          { color: "U", color_name: "Blue", sources_needed: 14, sources_actual: 15, surplus: 1, status: "good", most_demanding: "No More Lies", cost_pattern: "WU", is_gold_adjusted: true },
        ],
        swap_suggestions: [
          { cut: "Plains", add: "Azorius Chancery", reason: "Adds a Blue source" },
        ],
      },
    };

    it("renders composition stats", () => {
      const { container } = render(Deckbuilding, { props: { data: constructed } });
      expect(container.textContent).toContain("60");
      expect(container.textContent).toContain("25");
      expect(container.textContent).toContain("Creatures");
      expect(container.textContent).toContain("Lands");
    });

    it("renders legality badge when format provided", () => {
      const { container } = render(Deckbuilding, { props: { data: constructed } });
      expect(container.textContent).toContain("All legal in standard");
    });

    it("renders illegal cards as badges", () => {
      const data = {
        ...constructed,
        illegal_cards: [{ name: "Smuggler's Copter", status: "not_legal" }],
      };
      const { container } = render(Deckbuilding, { props: { data } });
      expect(container.textContent).toContain("Smuggler's Copter");
      expect(container.textContent).toContain("not_legal");
    });

    it("renders mana curve bar chart", () => {
      const { container } = render(Deckbuilding, { props: { data: constructed } });
      expect(container.querySelector(".bar-chart")).not.toBeNull();
    });

    it("renders mana base sources", () => {
      const { container } = render(Deckbuilding, { props: { data: constructed } });
      expect(container.textContent).toContain("White");
      expect(container.textContent).toContain("Blue");
    });

    it("renders swap suggestions as timeline", () => {
      const { container } = render(Deckbuilding, { props: { data: constructed } });
      expect(container.textContent).toContain("Plains");
      expect(container.textContent).toContain("Azorius Chancery");
    });
  });

  describe("cut advisor", () => {
    it("renders cut candidates", () => {
      const { container } = render(Deckbuilding, { props: { data: cutAdvisor } });
      expect(container.textContent).toContain("Granite Witness");
      expect(container.textContent).toContain("Basilica Stalker");
    });

    it("renders cut reasons", () => {
      const { container } = render(Deckbuilding, { props: { data: cutAdvisor } });
      expect(container.textContent).toContain("off-color");
    });
  });
});
