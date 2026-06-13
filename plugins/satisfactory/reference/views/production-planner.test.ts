import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ProductionPlanner from "./production-planner.svelte";

afterEach(cleanup);

const basePlan = {
  target: "Iron Plate",
  ratePerMinute: 20,
  machinesByRecipe: [
    {
      recipe: "Iron Ingot",
      recipeClassName: "Recipe_IngotIron_C",
      building: "Smelter",
      alternate: false,
      machines: 1.67,
      machinesCeil: 2,
      powerMW: 6.67,
    },
    {
      recipe: "Iron Plate",
      recipeClassName: "Recipe_IronPlate_C",
      building: "Constructor",
      alternate: false,
      machines: 1,
      machinesCeil: 1,
      powerMW: 4,
    },
  ],
  rawResources: [{ name: "Iron Ore", className: "Desc_OreIron_C", perMinute: 50 }],
  byproducts: [],
  totalPowerMW: 10.67,
};

describe("ProductionPlanner", () => {
  it("sums Build counts into the machines stat", () => {
    const { container } = render(ProductionPlanner, { props: { data: basePlan } });
    const stats = [...container.querySelectorAll(".stats .stat")].map(
      (s) => s.textContent ?? "",
    );
    expect(stats.some((s) => s.includes("3"))).toBe(true);
    expect(container.textContent).toContain("Iron Plate — 20/min");
  });

  it("omits the Have column without existing capacity", () => {
    const { container } = render(ProductionPlanner, { props: { data: basePlan } });
    expect(container.textContent).not.toContain("HAVE");
    expect(container.textContent).not.toContain("machine equivalents");
  });

  it("shows existing capacity as the Have column with its caption", () => {
    const data = {
      ...basePlan,
      machinesByRecipe: [
        { ...basePlan.machinesByRecipe[0], existingCapacity: 4.5 },
        basePlan.machinesByRecipe[1],
      ],
    };
    const { container } = render(ProductionPlanner, { props: { data } });
    expect(container.textContent).toContain("4.5");
    expect(container.textContent).toContain("machine equivalents");
  });

  it("renders Game Mode chips and caption only when multipliers apply", () => {
    const vanilla = render(ProductionPlanner, { props: { data: basePlan } });
    expect(vanilla.container.textContent).not.toContain("Game Mode");
    cleanup();

    const modded = render(ProductionPlanner, {
      props: {
        data: {
          ...basePlan,
          gameMode: { partsCostMultiplier: 1.5, energyCostMultiplier: 0.5 },
        },
      },
    });
    expect(modded.container.textContent).toContain("Game Mode: parts cost ×1.5");
    expect(modded.container.textContent).toContain("Game Mode: power use ×0.5");
    expect(modded.container.textContent).toContain("already");
  });

  it("hides the byproducts section when empty and shows it when present", () => {
    const { container } = render(ProductionPlanner, { props: { data: basePlan } });
    expect(container.textContent).not.toContain("Byproducts");
    cleanup();

    const withByproducts = render(ProductionPlanner, {
      props: {
        data: {
          ...basePlan,
          byproducts: [
            { name: "Water", className: "Desc_Water_C", perMinute: 30, unit: "m3" },
          ],
        },
      },
    });
    expect(withByproducts.container.textContent).toContain("Water 30 m³/min");
  });
});
