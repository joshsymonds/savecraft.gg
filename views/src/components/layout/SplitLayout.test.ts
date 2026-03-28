import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import SplitLayout from "./SplitLayout.svelte";

afterEach(cleanup);

describe("SplitLayout", () => {
  it("renders split layout container", () => {
    const { container } = render(SplitLayout);
    expect(container.querySelector(".split-layout")).toBeTruthy();
  });

  it("defaults to vertical direction", () => {
    const { container } = render(SplitLayout);
    const layout = container.querySelector(".split-layout") as HTMLElement;
    expect(layout.classList.contains("horizontal")).toBe(false);
  });

  it("supports horizontal direction", () => {
    const { container } = render(SplitLayout, { props: { direction: "horizontal" } });
    const layout = container.querySelector(".split-layout") as HTMLElement;
    expect(layout.classList.contains("horizontal")).toBe(true);
  });

  it("renders a divider between sections", () => {
    const { container } = render(SplitLayout);
    expect(container.querySelector(".divider")).toBeTruthy();
  });

  it("renders primary and secondary slots", () => {
    const { container } = render(SplitLayout);
    expect(container.querySelector(".split-primary")).toBeTruthy();
    expect(container.querySelector(".split-secondary")).toBeTruthy();
  });
});
