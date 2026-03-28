import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import StackedBar from "./StackedBar.svelte";

afterEach(cleanup);

const segments = [
  { label: "White", value: 8, color: "var(--color-text)" },
  { label: "Blue", value: 12, color: "var(--color-info)" },
  { label: "Black", value: 6, color: "var(--color-text-muted)" },
];

describe("StackedBar", () => {
  it("renders all segments", () => {
    const { container } = render(StackedBar, { props: { segments } });
    const segs = container.querySelectorAll(".segment");
    expect(segs).toHaveLength(3);
  });

  it("renders legend entries", () => {
    const { container } = render(StackedBar, { props: { segments } });
    const entries = container.querySelectorAll(".legend-entry");
    expect(entries).toHaveLength(3);
  });

  it("renders legend labels", () => {
    const { container } = render(StackedBar, { props: { segments } });
    expect(container.textContent).toContain("White");
    expect(container.textContent).toContain("Blue");
  });

  it("handles single segment", () => {
    const { container } = render(StackedBar, {
      props: { segments: [{ label: "All", value: 100, color: "var(--color-gold)" }] },
    });
    expect(container.querySelectorAll(".segment")).toHaveLength(1);
  });
});
