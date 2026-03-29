import { cleanup, render, fireEvent } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import CollapseToggle from "./CollapseToggle.svelte";

afterEach(cleanup);

describe("CollapseToggle", () => {
  it("renders toggle button with label", () => {
    const { container } = render(CollapseToggle, { props: { label: "3 modules" } });
    expect(container.querySelector(".toggle-row")).toBeTruthy();
    expect(container.querySelector(".toggle-label")!.textContent).toBe("3 modules");
  });

  it("starts collapsed by default", () => {
    const { container } = render(CollapseToggle, { props: { label: "Items" } });
    expect(container.querySelector(".toggle-content")).toBeNull();
  });

  it("expands on click", async () => {
    const { container } = render(CollapseToggle, { props: { label: "Items" } });
    const button = container.querySelector(".toggle-row") as HTMLElement;
    await fireEvent.click(button);
    expect(container.querySelector(".toggle-content")).toBeTruthy();
  });

  it("collapses on second click", async () => {
    const { container } = render(CollapseToggle, { props: { label: "Items" } });
    const button = container.querySelector(".toggle-row") as HTMLElement;
    await fireEvent.click(button);
    await fireEvent.click(button);
    expect(container.querySelector(".toggle-content")).toBeNull();
  });

  it("applies expanded class to arrow when open", async () => {
    const { container } = render(CollapseToggle, { props: { label: "Items" } });
    const arrow = container.querySelector(".toggle-arrow") as HTMLElement;
    expect(arrow.classList.contains("expanded")).toBe(false);
    await fireEvent.click(container.querySelector(".toggle-row") as HTMLElement);
    expect(arrow.classList.contains("expanded")).toBe(true);
  });

  it("applies muted class when muted prop is true", () => {
    const { container } = render(CollapseToggle, { props: { label: "Removed", muted: true } });
    expect(container.querySelector(".collapse-toggle.muted")).toBeTruthy();
  });

  it("does not apply muted class by default", () => {
    const { container } = render(CollapseToggle, { props: { label: "Items" } });
    const toggle = container.querySelector(".collapse-toggle") as HTMLElement;
    expect(toggle.classList.contains("muted")).toBe(false);
  });

  it("starts expanded when open prop is true", () => {
    const { container } = render(CollapseToggle, { props: { label: "Items", open: true } });
    expect(container.querySelector(".toggle-content")).toBeTruthy();
    expect(container.querySelector(".toggle-arrow.expanded")).toBeTruthy();
  });
});
