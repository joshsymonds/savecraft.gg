import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Materials from "../../../../plugins/rimworld/reference/views/materials.svelte";

afterEach(cleanup);

describe("Materials view", () => {
  it("renders material list as table", () => {
    const { container } = render(Materials, {
      props: {
        data: {
          materials: [
            { name: "steel", sharp_armor: 0.5, blunt_armor: 0.25, sharp_damage: 1.0, blunt_damage: 1.0, market_value: 1.9, max_hp_factor: 1.0, categories: ["Metallic"] },
            { name: "plasteel", sharp_armor: 1.2, blunt_armor: 0.6, sharp_damage: 1.0, blunt_damage: 1.0, market_value: 9.0, max_hp_factor: 1.3, categories: ["Metallic"] },
          ],
        },
      },
    });
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
  });

  it("renders material detail with quality badge", () => {
    const { container } = render(Materials, {
      props: {
        data: {
          material: "plasteel",
          quality: "masterwork",
          sharp_armor: 1.5,
          blunt_armor: 0.75,
          heat_armor: 0.3,
          sharp_damage: 1.15,
          blunt_damage: 1.15,
          max_hp: 1.95,
        },
      },
    });
    expect(container.textContent).toContain("plasteel");
    expect(container.textContent).toContain("MASTERWORK");
    expect(container.textContent).toContain("1.50");
  });
});
