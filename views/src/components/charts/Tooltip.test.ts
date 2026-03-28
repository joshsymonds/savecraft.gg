import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Tooltip from "./Tooltip.svelte";

afterEach(cleanup);

describe("Tooltip", () => {
  it("renders when visible", () => {
    const { container } = render(Tooltip, { props: { text: "65.8%", x: 100, y: 50, visible: true } });
    expect(container.querySelector(".tooltip")).toBeTruthy();
  });

  it("does not render when not visible", () => {
    const { container } = render(Tooltip, { props: { text: "65.8%", x: 100, y: 50, visible: false } });
    expect(container.querySelector(".tooltip")).toBeNull();
  });

  it("renders text content", () => {
    const { container } = render(Tooltip, { props: { text: "GIH WR: 65.8%", x: 0, y: 0, visible: true } });
    expect(container.querySelector(".tooltip")!.textContent).toBe("GIH WR: 65.8%");
  });

  it("positions at x,y coordinates", () => {
    const { container } = render(Tooltip, { props: { text: "test", x: 120, y: 80, visible: true } });
    const tip = container.querySelector(".tooltip") as HTMLElement;
    expect(tip.style.left).toBe("120px");
    expect(tip.style.top).toBe("80px");
  });
});
