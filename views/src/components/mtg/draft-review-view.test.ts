import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import DraftAdvisor from "../../../../plugins/mtga/reference/views/draft-advisor.svelte";

afterEach(cleanup);

const makePick = (
  pickNum: number,
  chosen: string,
  recommended: string,
  classification: "optimal" | "good" | "questionable" | "miss",
) => ({
  pick_number: pickNum,
  pack_number: Math.floor((pickNum - 1) / 14) + 1,
  pick_in_pack: ((pickNum - 1) % 14) + 1,
  display_label: `P${Math.floor((pickNum - 1) / 14) + 1}P${((pickNum - 1) % 14) + 1}`,
  chosen,
  chosen_rank: classification === "optimal" ? 1 : classification === "good" ? 2 : classification === "questionable" ? 3 : 5,
  chosen_composite: classification === "optimal" ? 0.8 : classification === "good" ? 0.65 : 0.4,
  recommended,
  recommended_composite: 0.82,
  classification,
  archetype_snapshot: { primary: "WB", confidence: 0.8, viability: "staple", phase: "committed" as const },
});

const batchData = {
  summary: {
    total_picks: 6,
    optimal: 3,
    good: 1,
    questionable: 1,
    misses: 1,
    score: "3/6 optimal, 1 good, 1 questionable, 1 misses",
    archetype_warnings: ["WB: drift from WU to WB"],
  },
  picks: [
    makePick(1, "Go for the Throat", "Go for the Throat", "optimal"),
    makePick(2, "Sheoldred", "Sheoldred", "optimal"),
    makePick(3, "Cut Down", "Cut Down", "optimal"),
    makePick(4, "Preacher of the Schism", "Virtue of Persistence", "good"),
    makePick(5, "Plains", "Hopeless Nightmare", "questionable"),
    makePick(6, "Swamp", "Deep-Cavern Bat", "miss"),
  ],
};

describe("DraftAdvisor batch review mode", () => {
  it("renders summary counts", () => {
    const { container } = render(DraftAdvisor, { props: { data: batchData } });
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("Optimal");
  });

  it("defaults to showing misses and questionable picks", () => {
    const { container } = render(DraftAdvisor, { props: { data: batchData } });
    const dots = container.querySelectorAll(".dot");
    // Only miss (Swamp) + questionable (Plains) = 2 picks shown by default
    expect(dots.length).toBe(2);
  });

  it("renders miss and questionable card names by default", () => {
    const { container } = render(DraftAdvisor, { props: { data: batchData } });
    // Misses and questionable are shown
    expect(container.textContent).toContain("Swamp");
    expect(container.textContent).toContain("Plains");
  });

  it("shows recommended card for non-optimal picks", () => {
    const { container } = render(DraftAdvisor, { props: { data: batchData } });
    expect(container.textContent).toContain("Deep-Cavern Bat");
  });

  it("renders archetype warnings", () => {
    const { container } = render(DraftAdvisor, { props: { data: batchData } });
    expect(container.textContent).toContain("drift");
  });
});
