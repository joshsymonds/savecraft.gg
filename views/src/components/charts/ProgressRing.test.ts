import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ProgressRing from "./ProgressRing.svelte";

afterEach(cleanup);

describe("ProgressRing", () => {
  it("renders SVG element", () => {
    const { container } = render(ProgressRing, { props: { value: 50, label: "Test" } });
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders background and foreground circles", () => {
    const { container } = render(ProgressRing, { props: { value: 75 } });
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });

  it("renders label when provided", () => {
    const { container } = render(ProgressRing, { props: { value: 85, label: "85%" } });
    expect(container.textContent).toContain("85%");
  });

  it("uses default size of 80", () => {
    const { container } = render(ProgressRing, { props: { value: 50 } });
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("width")).toBe("80");
  });

  it("applies custom size", () => {
    const { container } = render(ProgressRing, { props: { value: 50, size: 120 } });
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("width")).toBe("120");
  });
});
