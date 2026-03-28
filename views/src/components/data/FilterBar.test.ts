import { cleanup, render, fireEvent } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import FilterBar from "./FilterBar.svelte";

afterEach(cleanup);

const filters = [
  { label: "Good", value: "good" },
  { label: "Average", value: "avg" },
  { label: "Bad", value: "bad" },
];

describe("FilterBar", () => {
  it("renders all filter chips", () => {
    const { container } = render(FilterBar, { props: { filters, active: [], onchange: () => {} } });
    const chips = container.querySelectorAll(".filter-chip");
    expect(chips).toHaveLength(3);
  });

  it("renders chip labels", () => {
    const { container } = render(FilterBar, { props: { filters, active: [], onchange: () => {} } });
    const chips = container.querySelectorAll(".filter-chip");
    expect(chips[0].textContent).toBe("Good");
  });

  it("renders filter label", () => {
    const { container } = render(FilterBar, { props: { filters, active: [], onchange: () => {} } });
    expect(container.querySelector(".filter-label")!.textContent).toBe("Filter");
  });

  it("marks active chips", () => {
    const { container } = render(FilterBar, { props: { filters, active: ["good"], onchange: () => {} } });
    const chips = container.querySelectorAll(".filter-chip");
    expect(chips[0].classList.contains("active")).toBe(true);
    expect(chips[1].classList.contains("active")).toBe(false);
  });

  it("calls onchange with toggled value (multi-select)", async () => {
    const onchange = vi.fn();
    const { container } = render(FilterBar, { props: { filters, active: ["good"], onchange } });
    const chips = container.querySelectorAll(".filter-chip");
    await fireEvent.click(chips[1]); // click "Average"
    expect(onchange).toHaveBeenCalledWith(["good", "avg"]);
  });

  it("calls onchange with removed value (multi-select)", async () => {
    const onchange = vi.fn();
    const { container } = render(FilterBar, { props: { filters, active: ["good", "avg"], onchange } });
    const chips = container.querySelectorAll(".filter-chip");
    await fireEvent.click(chips[0]); // unclick "Good"
    expect(onchange).toHaveBeenCalledWith(["avg"]);
  });

  it("single-select replaces active value", async () => {
    const onchange = vi.fn();
    const { container } = render(FilterBar, { props: { filters, active: ["good"], onchange, multiSelect: false } });
    const chips = container.querySelectorAll(".filter-chip");
    await fireEvent.click(chips[1]); // click "Average"
    expect(onchange).toHaveBeenCalledWith(["avg"]);
  });
});
