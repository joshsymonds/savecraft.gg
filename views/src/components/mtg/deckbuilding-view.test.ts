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
