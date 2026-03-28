import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import CardGrid from "./CardGrid.svelte";

afterEach(cleanup);

describe("CardGrid", () => {
  it("renders grid container", () => {
    const { container } = render(CardGrid);
    expect(container.querySelector(".grid")).toBeTruthy();
  });

  it("applies default minWidth of 260px", () => {
    const { container } = render(CardGrid);
    const grid = container.querySelector(".grid") as HTMLElement;
    expect(grid.style.getPropertyValue("--grid-min-width")).toBe("260px");
  });

  it("applies custom minWidth", () => {
    const { container } = render(CardGrid, { props: { minWidth: 180 } });
    const grid = container.querySelector(".grid") as HTMLElement;
    expect(grid.style.getPropertyValue("--grid-min-width")).toBe("180px");
  });

  it("applies default gap", () => {
    const { container } = render(CardGrid);
    const grid = container.querySelector(".grid") as HTMLElement;
    expect(grid.style.getPropertyValue("--grid-gap")).toBe("var(--space-md)");
  });

  it("applies custom gap", () => {
    const { container } = render(CardGrid, { props: { gap: "var(--space-xl)" } });
    const grid = container.querySelector(".grid") as HTMLElement;
    expect(grid.style.getPropertyValue("--grid-gap")).toBe("var(--space-xl)");
  });
});
