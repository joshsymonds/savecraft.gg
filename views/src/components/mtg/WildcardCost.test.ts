import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import WildcardCost from "./WildcardCost.svelte";

afterEach(cleanup);

describe("WildcardCost", () => {
  const cost = { common: 4, uncommon: 2, rare: 3, mythic: 1, unknown: 0, total: 10 };

  it("renders total cost", () => {
    const { container } = render(WildcardCost, { props: { cost } });
    expect(container.textContent).toContain("10");
  });

  it("renders rarity badges for non-zero counts", () => {
    const { container } = render(WildcardCost, { props: { cost } });
    const badges = container.querySelectorAll(".badge");
    expect(badges.length).toBeGreaterThanOrEqual(4);
  });

  it("skips zero-count rarities", () => {
    const { container } = render(WildcardCost, {
      props: { cost: { common: 0, uncommon: 0, rare: 2, mythic: 0, unknown: 0, total: 2 } },
    });
    expect(container.textContent).not.toContain("common");
    expect(container.textContent).toContain("rare");
  });

  it("renders the wildcard-cost container", () => {
    const { container } = render(WildcardCost, { props: { cost } });
    expect(container.querySelector(".wildcard-cost")).not.toBeNull();
  });
});
