import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Research from "../../../../plugins/rimworld/reference/views/research.svelte";

afterEach(cleanup);

describe("Research view", () => {
  it("renders project list as table", () => {
    const { container } = render(Research, {
      props: {
        data: {
          projects: [
            { name: "Smithing", def_name: "Smithing", cost: 500, tech_level: "Neolithic", prerequisites: [] },
            { name: "Machining", def_name: "Machining", cost: 1000, tech_level: "Industrial", prerequisites: ["Smithing"] },
          ],
          count: 2,
        },
      },
    });
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
  });

  it("renders research chain as timeline", () => {
    const { container } = render(Research, {
      props: {
        data: {
          chain: ["Smithing", "Machining", "Microelectronics"],
          total_cost: 4500,
          colony_tech: "Industrial",
        },
      },
    });
    expect(container.textContent).toContain("4,500");
    expect(container.textContent).toContain("Total Research Cost");
    expect(container.textContent).toContain("Smithing");
    expect(container.textContent).toContain("Machining");
    expect(container.textContent).toContain("Microelectronics");
  });

  it("shows colony tech level badge", () => {
    const { container } = render(Research, {
      props: {
        data: {
          chain: ["Smithing"],
          total_cost: 500,
          colony_tech: "Industrial",
        },
      },
    });
    expect(container.textContent).toContain("INDUSTRIAL");
  });
});
