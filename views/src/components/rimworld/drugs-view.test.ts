import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Drugs from "../../../../plugins/rimworld/reference/views/drugs.svelte";

afterEach(cleanup);

describe("Drugs view", () => {
  it("renders drug list as table", () => {
    const { container } = render(Drugs, {
      props: {
        data: {
          drugs: [
            { name: "flake", market_value: 14, category: "Hard", addictiveness: 0.2, ingredients: ["Psychoid_leaves:4"] },
            { name: "beer", market_value: 12, category: "Social", addictiveness: 0.01, ingredients: ["RawHops:25"] },
          ],
        },
      },
    });
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
  });

  it("renders drug detail with economy and risk", () => {
    const { container } = render(Drugs, {
      props: {
        data: {
          drug: "flake",
          category: "Hard",
          market_value: 14,
          addictiveness: 0.2,
          work_amount: 250,
        },
      },
    });
    expect(container.textContent).toContain("flake");
    expect(container.textContent).toContain("HARD");
    expect(container.textContent).toContain("Economy");
    expect(container.textContent).toContain("Risk");
  });

  it("renders production chain with silver/day", () => {
    const { container } = render(Drugs, {
      props: {
        data: {
          drug: "flake",
          category: "Hard",
          crop: "psychoid plant",
          soil_fertility: 1.0,
          actual_grow_days: 5.71,
          leaves_per_day: 1.4,
          drugs_per_day: 0.35,
          silver_per_day: 4.9,
        },
      },
    });
    expect(container.textContent).toContain("Production");
    expect(container.textContent).toContain("4.90");
    expect(container.textContent).toContain("Silver/day/tile");
  });
});
