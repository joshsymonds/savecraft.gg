import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import CardStats from "../../../../plugins/mtga/reference/views/card-stats.svelte";

afterEach(cleanup);

const setOverview = {
  set_code: "MKM",
  format: "PremierDraft",
  total_games: 250000,
  card_count: 286,
  avg_gihwr: 56.2,
  top_gihwr: [
    { card_name: "Aurelia's Vindicator", gihwr: 64.5, iwd: 8.3, ata: 2.1, games_in_hand: 5400 },
    { card_name: "Massacre Girl", gihwr: 63.1, iwd: 6.9, ata: 1.8, games_in_hand: 4200 },
  ],
  bottom_gihwr: [
    { card_name: "Granite Witness", gihwr: 44.2, iwd: -12.0, ata: 11.5, games_in_hand: 3100 },
  ],
  top_iwd: [
    { card_name: "Aurelia's Vindicator", gihwr: 64.5, iwd: 8.3, ata: 2.1, games_in_hand: 5400 },
  ],
  undervalued: [
    { card_name: "Hidden Gem", gihwr: 59.0, iwd: 3.2, ata: 8.5, games_in_hand: 2800 },
  ],
};

const cardDetail = {
  set_code: "MKM",
  format: "PremierDraft",
  query: "Aurelia",
  cards: [
    {
      card_name: "Aurelia's Vindicator",
      gihwr: 64.5,
      ohwr: 66.2,
      gdwr: 58.1,
      gnswr: 55.3,
      iwd: 8.3,
      alsa: 2.5,
      ata: 2.1,
      games_in_hand: 5400,
      games_played: 3200,
      set_avg_gihwr: 56.2,
      archetypes: [
        { archetype: "WB", gihwr: 67.2, iwd: 11.0, games_in_hand: 1800 },
        { archetype: "WR", gihwr: 63.8, iwd: 7.6, games_in_hand: 1200 },
        { archetype: "WU", gihwr: 61.5, iwd: 5.3, games_in_hand: 900 },
      ],
    },
  ],
  more: 0,
};

describe("CardStats view", () => {
  describe("set overview", () => {
    it("renders set code and game count", () => {
      const { container } = render(CardStats, { props: { data: setOverview } });
      expect(container.textContent).toContain("MKM");
      expect(container.textContent).toContain("250");
    });

    it("renders top cards", () => {
      const { container } = render(CardStats, { props: { data: setOverview } });
      expect(container.textContent).toContain("Aurelia's Vindicator");
      expect(container.textContent).toContain("64.5");
    });

    it("renders bottom cards", () => {
      const { container } = render(CardStats, { props: { data: setOverview } });
      expect(container.textContent).toContain("Granite Witness");
    });
  });

  describe("card detail", () => {
    it("renders card name and win rate", () => {
      const { container } = render(CardStats, { props: { data: cardDetail } });
      expect(container.textContent).toContain("Aurelia's Vindicator");
      expect(container.textContent).toContain("64.5");
    });

    it("renders archetype breakdown", () => {
      const { container } = render(CardStats, { props: { data: cardDetail } });
      expect(container.textContent).toContain("WB");
      expect(container.textContent).toContain("67.2");
    });
  });
});
