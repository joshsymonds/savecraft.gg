import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Sparkline from "./Sparkline.svelte";

afterEach(cleanup);

describe("Sparkline", () => {
  it("renders SVG element", () => {
    const { container } = render(Sparkline, { props: { values: [1, 2, 3] } });
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders a polyline", () => {
    const { container } = render(Sparkline, { props: { values: [10, 20, 30, 15] } });
    expect(container.querySelector("polyline")).toBeTruthy();
  });

  it("uses default dimensions", () => {
    const { container } = render(Sparkline, { props: { values: [1, 2] } });
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("width")).toBe("80");
    expect(svg.getAttribute("height")).toBe("24");
  });

  it("applies custom dimensions", () => {
    const { container } = render(Sparkline, { props: { values: [1, 2], width: 120, height: 32 } });
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("width")).toBe("120");
    expect(svg.getAttribute("height")).toBe("32");
  });

  it("handles single value", () => {
    const { container } = render(Sparkline, { props: { values: [42] } });
    expect(container.querySelector("polyline")).toBeTruthy();
  });

  it("handles empty values array", () => {
    const { container } = render(Sparkline, { props: { values: [] } });
    const polyline = container.querySelector("polyline");
    expect(polyline).toBeTruthy();
    expect(polyline!.getAttribute("points")).toBe("");
  });
});
