import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Genes from "../../../../plugins/rimworld/reference/views/genes.svelte";

afterEach(cleanup);

describe("Genes view", () => {
  it("renders gene browse table", () => {
    const { container } = render(Genes, {
      props: {
        data: {
          genes: [
            { name: "tough skin", complexity: 1, metabolism: -1, archite: 0, category: "Misc", conflicts: [] },
            { name: "great memory", complexity: 1, metabolism: -1, archite: 0, category: "Misc", conflicts: [] },
          ],
          count: 2,
        },
      },
    });
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
  });

  it("renders validation with budget bars", () => {
    const { container } = render(Genes, {
      props: {
        data: {
          total_complexity: 4,
          total_metabolism: -3,
          total_archite: 0,
          complexity_ok: true,
          metabolism_ok: true,
          conflicts: [],
        },
      },
    });
    expect(container.textContent).toContain("Complexity");
    expect(container.textContent).toContain("Metabolism");
    expect(container.textContent).toContain("4/6");
  });

  it("shows over badge when complexity exceeds budget", () => {
    const { container } = render(Genes, {
      props: {
        data: {
          total_complexity: 8,
          total_metabolism: -3,
          total_archite: 0,
          complexity_ok: false,
          metabolism_ok: true,
          conflicts: [],
        },
      },
    });
    expect(container.textContent).toContain("OVER");
  });

  it("renders conflicts", () => {
    const { container } = render(Genes, {
      props: {
        data: {
          total_complexity: 3,
          total_metabolism: -2,
          total_archite: 0,
          complexity_ok: true,
          metabolism_ok: true,
          conflicts: [{ Gene1: "tough skin", Gene2: "delicate", Tag: "Toughness" }],
        },
      },
    });
    expect(container.textContent).toContain("CONFLICT");
    expect(container.textContent).toContain("tough skin vs delicate");
  });
});
