import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import RadarChart from "./RadarChart.svelte";

afterEach(cleanup);

const axes = [
  { label: "Baseline", value: 7.2 },
  { label: "Synergy", value: 5.8 },
  { label: "Role", value: 8.1 },
  { label: "Curve", value: 6.5 },
  { label: "Castability", value: 9.0 },
  { label: "Signal", value: 4.3 },
];

describe("RadarChart", () => {
  it("renders SVG element", () => {
    const { container } = render(RadarChart, { props: { axes } });
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders axis lines for each axis", () => {
    const { container } = render(RadarChart, { props: { axes } });
    const lines = container.querySelectorAll(".axis-line");
    expect(lines).toHaveLength(6);
  });

  it("renders axis labels", () => {
    const { container } = render(RadarChart, { props: { axes } });
    const labels = container.querySelectorAll(".axis-label");
    expect(labels).toHaveLength(6);
    expect(labels[0].textContent).toBe("Baseline");
  });

  it("renders the data polygon", () => {
    const { container } = render(RadarChart, { props: { axes } });
    expect(container.querySelector(".data-polygon")).toBeTruthy();
  });

  it("renders grid rings", () => {
    const { container } = render(RadarChart, { props: { axes } });
    const rings = container.querySelectorAll(".grid-ring");
    expect(rings.length).toBeGreaterThan(0);
  });

  it("handles custom max value", () => {
    const customAxes = [{ label: "A", value: 50, max: 100 }, { label: "B", value: 75, max: 100 }, { label: "C", value: 25, max: 100 }];
    const { container } = render(RadarChart, { props: { axes: customAxes } });
    expect(container.querySelector(".data-polygon")).toBeTruthy();
  });

  it("handles 3 axes (minimum)", () => {
    const triAxes = [{ label: "A", value: 5 }, { label: "B", value: 7 }, { label: "C", value: 3 }];
    const { container } = render(RadarChart, { props: { axes: triAxes } });
    expect(container.querySelectorAll(".axis-line")).toHaveLength(3);
  });
});
