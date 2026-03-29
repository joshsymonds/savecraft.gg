import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Raids from "../../../../plugins/rimworld/reference/views/raids.svelte";

afterEach(cleanup);

const baseData = {
  total_wealth: 50000,
  wealth_points: 1200,
  pawn_points: 300,
  total_points: 1500,
};

describe("Raids view", () => {
  it("renders total raid points", () => {
    const { container } = render(Raids, { props: { data: baseData } });
    expect(container.textContent).toContain("1500");
    expect(container.textContent).toContain("Total Raid Points");
  });

  it("renders stacked bar for breakdown", () => {
    const { container } = render(Raids, { props: { data: baseData } });
    expect(container.textContent).toContain("From wealth");
    expect(container.textContent).toContain("From colonists");
  });

  it("renders wealth details", () => {
    const { container } = render(Raids, { props: { data: baseData } });
    expect(container.textContent).toContain("50,000");
  });
});
