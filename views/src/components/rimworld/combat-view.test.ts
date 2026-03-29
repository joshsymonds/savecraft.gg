import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Combat from "../../../../plugins/rimworld/reference/views/combat.svelte";

afterEach(cleanup);

describe("Combat view", () => {
  it("renders ranged weapon with DPS", () => {
    const { container } = render(Combat, {
      props: {
        data: {
          weapon: "assault rifle",
          type: "ranged",
          raw_dps: 8.91,
          accuracy: 0.72,
          dps_at_range: 6.42,
          damage_per_shot: 11,
          expected_damage: 11,
        },
      },
    });
    expect(container.textContent).toContain("assault rifle");
    expect(container.textContent).toContain("6.42");
    expect(container.textContent).toContain("RANGED");
  });

  it("renders melee weapon with true DPS", () => {
    const { container } = render(Combat, {
      props: {
        data: {
          weapon: "longsword",
          type: "melee",
          true_dps: 12.5,
        },
      },
    });
    expect(container.textContent).toContain("longsword");
    expect(container.textContent).toContain("12.50");
    expect(container.textContent).toContain("MELEE");
  });

  it("shows expected damage vs armor when different from raw", () => {
    const { container } = render(Combat, {
      props: {
        data: {
          weapon: "bolt-action rifle",
          type: "ranged",
          raw_dps: 5.5,
          accuracy: 0.85,
          dps_at_range: 4.68,
          damage_per_shot: 18,
          expected_damage: 12.3,
        },
      },
    });
    expect(container.textContent).toContain("Expected vs armor");
    expect(container.textContent).toContain("12.3");
  });
});
