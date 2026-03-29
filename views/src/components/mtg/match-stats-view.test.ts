import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import MatchStats from "../../../../plugins/mtga/reference/views/match-stats.svelte";

afterEach(cleanup);

const overviewData = {
  total_matches: 50,
  total_wins: 30,
  total_losses: 20,
  win_rate: 60.0,
  by_format: [
    { format: "Premier Draft", wins: 20, losses: 10, total: 30, win_rate: 66.7 },
    { format: "Quick Draft", wins: 10, losses: 10, total: 20, win_rate: 50.0 },
  ],
};

const deckData = {
  decks: [
    { deck: "WB Midrange", wins: 15, losses: 5, total: 20, win_rate: 75.0 },
    { deck: "UR Spells", wins: 8, losses: 12, total: 20, win_rate: 40.0 },
  ],
};

describe("MatchStats view", () => {
  describe("overview mode", () => {
    it("renders hero win rate stat", () => {
      const { container } = render(MatchStats, { props: { data: overviewData } });
      expect(container.textContent).toContain("60.0%");
    });

    it("renders total matches", () => {
      const { container } = render(MatchStats, { props: { data: overviewData } });
      expect(container.textContent).toContain("50");
    });

    it("renders win-loss record", () => {
      const { container } = render(MatchStats, { props: { data: overviewData } });
      expect(container.textContent).toContain("30");
      expect(container.textContent).toContain("20");
    });

    it("renders format breakdown bars", () => {
      const { container } = render(MatchStats, { props: { data: overviewData } });
      expect(container.textContent).toContain("Premier Draft");
      expect(container.textContent).toContain("Quick Draft");
    });
  });

  describe("deck mode", () => {
    it("renders deck names", () => {
      const { container } = render(MatchStats, { props: { data: deckData } });
      expect(container.textContent).toContain("WB Midrange");
      expect(container.textContent).toContain("UR Spells");
    });

    it("renders deck win rates", () => {
      const { container } = render(MatchStats, { props: { data: deckData } });
      expect(container.textContent).toContain("75");
    });
  });
});
