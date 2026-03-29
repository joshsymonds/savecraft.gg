import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ColorBar from "./ColorBar.svelte";

afterEach(cleanup);

describe("ColorBar", () => {
  it("renders a bar element", () => {
    const { container } = render(ColorBar, { props: { colors: ["U"] } });
    expect(container.querySelector(".color-bar")).not.toBeNull();
  });

  it("renders single-color bar with solid background", () => {
    const { container } = render(ColorBar, { props: { colors: ["R"] } });
    const bar = container.querySelector(".color-bar") as HTMLElement;
    expect(bar.style.getPropertyValue("--bar-bg")).toBe("#c83020");
  });

  it("renders multi-color bar with gradient", () => {
    const { container } = render(ColorBar, { props: { colors: ["W", "U", "B"] } });
    const bar = container.querySelector(".color-bar") as HTMLElement;
    expect(bar.style.getPropertyValue("--bar-bg")).toContain("linear-gradient");
  });

  it("renders all five WUBRG colors", () => {
    const { container } = render(ColorBar, { props: { colors: ["W", "U", "B", "R", "G"] } });
    const bar = container.querySelector(".color-bar") as HTMLElement;
    const bg = bar.style.getPropertyValue("--bar-bg");
    expect(bg).toContain("linear-gradient");
  });

  it("renders grey bar for empty colors", () => {
    const { container } = render(ColorBar, { props: { colors: [] } });
    const bar = container.querySelector(".color-bar") as HTMLElement;
    expect(bar.style.getPropertyValue("--bar-bg")).toBe("#6a6a78");
  });

  it("applies custom height", () => {
    const { container } = render(ColorBar, { props: { colors: ["G"], height: 5 } });
    const bar = container.querySelector(".color-bar") as HTMLElement;
    expect(bar.style.getPropertyValue("--bar-height")).toBe("5px");
  });

  it("defaults to 3px height", () => {
    const { container } = render(ColorBar, { props: { colors: ["G"] } });
    const bar = container.querySelector(".color-bar") as HTMLElement;
    expect(bar.style.getPropertyValue("--bar-height")).toBe("3px");
  });
});
