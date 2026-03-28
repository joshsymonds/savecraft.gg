import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import LegendBar from "./LegendBar.svelte";

afterEach(cleanup);

const items = [
  { label: "Series A", color: "var(--color-info)" },
  { label: "Series B", color: "var(--color-positive)" },
  { label: "Series C", color: "var(--color-warning)" },
];

describe("LegendBar", () => {
  it("renders all legend entries", () => {
    const { container } = render(LegendBar, { props: { items } });
    const entries = container.querySelectorAll(".legend-entry");
    expect(entries).toHaveLength(3);
  });

  it("renders color swatches", () => {
    const { container } = render(LegendBar, { props: { items } });
    const swatches = container.querySelectorAll(".legend-swatch");
    expect(swatches).toHaveLength(3);
    expect((swatches[0] as HTMLElement).style.background).toBe("var(--color-info)");
  });

  it("renders labels", () => {
    const { container } = render(LegendBar, { props: { items } });
    expect(container.textContent).toContain("Series A");
    expect(container.textContent).toContain("Series B");
  });

  it("renders legend title", () => {
    const { container } = render(LegendBar, { props: { items } });
    expect(container.querySelector(".legend-title")!.textContent).toBe("Legend");
  });

  it("defaults to horizontal layout", () => {
    const { container } = render(LegendBar, { props: { items } });
    const bar = container.querySelector(".legend-bar") as HTMLElement;
    expect(bar.style.getPropertyValue("--legend-direction")).toBe("row");
  });

  it("supports vertical layout", () => {
    const { container } = render(LegendBar, { props: { items, layout: "vertical" } });
    const bar = container.querySelector(".legend-bar") as HTMLElement;
    expect(bar.style.getPropertyValue("--legend-direction")).toBe("column");
  });
});
