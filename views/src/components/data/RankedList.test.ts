import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import RankedList from "./RankedList.svelte";

afterEach(cleanup);

const items = [
  { rank: 1, label: "Lightning Bolt", value: 8.7, badge: { label: "A+", variant: "positive" } },
  { rank: 2, label: "Go for the Throat", sublabel: "Instant", value: 7.2 },
  { rank: 3, label: "Sheoldred", sublabel: "Legendary Creature", value: 9.1, variant: "positive" },
];

describe("RankedList", () => {
  it("renders all items", () => {
    const { container } = render(RankedList, { props: { items } });
    const rows = container.querySelectorAll(".ranked-item");
    expect(rows).toHaveLength(3);
  });

  it("renders rank numbers", () => {
    const { container } = render(RankedList, { props: { items } });
    const ranks = container.querySelectorAll(".rank");
    expect(ranks[0].textContent).toBe("1");
    expect(ranks[2].textContent).toBe("3");
  });

  it("renders labels", () => {
    const { container } = render(RankedList, { props: { items } });
    const labels = container.querySelectorAll(".label");
    expect(labels[0].textContent).toBe("Lightning Bolt");
  });

  it("renders sublabel when provided", () => {
    const { container } = render(RankedList, { props: { items } });
    const sublabels = container.querySelectorAll(".sublabel");
    // First item has no sublabel, second and third do
    expect(sublabels).toHaveLength(2);
    expect(sublabels[0].textContent).toBe("Instant");
  });

  it("renders values", () => {
    const { container } = render(RankedList, { props: { items } });
    const values = container.querySelectorAll(".value");
    expect(values[0].textContent).toContain("8.7");
  });

  it("renders badge when provided", () => {
    const { container } = render(RankedList, { props: { items } });
    const badges = container.querySelectorAll(".badge");
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe("A+");
  });

  it("applies variant color to value", () => {
    const { container } = render(RankedList, { props: { items } });
    const thirdValue = container.querySelectorAll(".value")[2] as HTMLElement;
    expect(thirdValue.style.color).toBe("var(--color-positive)");
  });

  it("handles empty items", () => {
    const { container } = render(RankedList, { props: { items: [] } });
    expect(container.querySelectorAll(".ranked-item")).toHaveLength(0);
  });
});
