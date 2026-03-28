import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import BarChart from "./BarChart.svelte";

afterEach(cleanup);

const items = [
  { label: "Premier Draft", value: 59.2 },
  { label: "Quick Draft", value: 52.5 },
  { label: "Traditional", value: 66.7 },
];

describe("BarChart", () => {
  it("renders all bars", () => {
    const { container } = render(BarChart, { props: { items } });
    const bars = container.querySelectorAll(".bar-row");
    expect(bars).toHaveLength(3);
  });

  it("renders labels", () => {
    const { container } = render(BarChart, { props: { items } });
    const labels = container.querySelectorAll(".bar-label");
    expect(labels[0].textContent).toBe("Premier Draft");
  });

  it("renders values", () => {
    const { container } = render(BarChart, { props: { items } });
    const values = container.querySelectorAll(".bar-value");
    expect(values[0].textContent).toBe("59.2");
  });

  it("renders bar fills", () => {
    const { container } = render(BarChart, { props: { items } });
    const fills = container.querySelectorAll(".bar-fill");
    expect(fills).toHaveLength(3);
  });

  it("handles empty items", () => {
    const { container } = render(BarChart, { props: { items: [] } });
    expect(container.querySelectorAll(".bar-row")).toHaveLength(0);
  });
});
