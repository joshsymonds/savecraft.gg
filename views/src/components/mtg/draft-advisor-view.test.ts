import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import DraftAdvisor from "../../../../plugins/mtga/reference/views/draft-advisor.svelte";

afterEach(cleanup);

const axis = (raw: number, norm: number, weight: number) => ({
  raw,
  normalized: norm,
  weight,
  contribution: weight * norm,
});

const makeRec = (card: string, score: number, rank: number) => ({
  card,
  composite_score: score,
  rank,
  axes: {
    baseline: { ...axis(0.55, 0.7, 0.3), gihwr: 55.0, source: "archetype" },
    synergy: { ...axis(0.2, 0.5, 0.15), top_synergies: [] },
    role: { ...axis(0.3, 0.6, 0.1), roles: ["removal"], detail: "premium removal" },
    curve: { ...axis(0.4, 0.8, 0.1), cmc: 2, pool_at_cmc: 3, ideal_at_cmc: 4 },
    castability: { ...axis(0.9, 0.9, 0.1), max_pips: 1, estimated_sources: 7, potential_sources: 8, effective_sources: 7.5, source_model: "current", bomb_dampening: 0 },
    signal: { ...axis(0.3, 0.5, 0.1), ata: 4.5, current_pick: 3 },
    color_commitment: { ...axis(0.8, 0.8, 0.1), color_fit: 0.8 },
    opportunity_cost: axis(0.1, 0.3, 0.05),
  },
  waspas: { wsm: 0.65, wpm: 0.62, lambda: 0.5 },
});

const data = {
  archetype: {
    primary: "WB",
    candidates: [
      { archetype: "WB", weight: 0.85, deck_count: 1200, deck_share: 0.12, viability: "staple", format_context: "above average" },
    ],
    confidence: 0.85,
  },
  pick_number: 3,
  recommendations: [
    makeRec("Go for the Throat", 0.78, 1),
    makeRec("Preacher of the Schism", 0.72, 2),
    makeRec("Plains", 0.15, 3),
  ],
};

describe("DraftAdvisor view", () => {
  it("renders card names", () => {
    const { container } = render(DraftAdvisor, { props: { data } });
    expect(container.textContent).toContain("Go for the Throat");
    expect(container.textContent).toContain("Preacher of the Schism");
  });

  it("renders rank numbers", () => {
    const { container } = render(DraftAdvisor, { props: { data } });
    const ranks = container.querySelectorAll(".rank");
    expect(ranks.length).toBe(3);
    expect(ranks[0].textContent).toBe("1");
    expect(ranks[1].textContent).toBe("2");
  });

  it("renders grade badges", () => {
    const { container } = render(DraftAdvisor, { props: { data } });
    const badges = container.querySelectorAll(".badge");
    expect(badges.length).toBeGreaterThanOrEqual(3);
  });

  it("renders archetype label", () => {
    const { container } = render(DraftAdvisor, { props: { data } });
    expect(container.querySelector(".archetype-label")).not.toBeNull();
  });

  it("renders pick number in subtitle", () => {
    const { container } = render(DraftAdvisor, { props: { data } });
    expect(container.textContent).toContain("Pick 3");
  });

  it("renders ranked list", () => {
    const { container } = render(DraftAdvisor, { props: { data } });
    expect(container.querySelector(".ranked-list")).not.toBeNull();
  });
});
