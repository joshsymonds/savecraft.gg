import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import CollectionDiff from "../../../../plugins/mtga/reference/views/collection-diff.svelte";

afterEach(cleanup);

const fullData = {
  missing: [
    { name: "Sheoldred, the Apocalypse", count: 2, rarity: "mythic" },
    { name: "Go for the Throat", count: 3, rarity: "uncommon" },
    { name: "Swamp", count: 4, rarity: "common" },
  ],
  wildcardCost: { common: 4, uncommon: 3, rare: 0, mythic: 2, unknown: 0, total: 9 },
  unresolvedCards: [],
};

describe("CollectionDiff view", () => {
  it("renders wildcard cost total", () => {
    const { container } = render(CollectionDiff, { props: { data: fullData } });
    expect(container.textContent).toContain("9");
  });

  it("renders missing card names", () => {
    const { container } = render(CollectionDiff, { props: { data: fullData } });
    expect(container.textContent).toContain("Sheoldred, the Apocalypse");
    expect(container.textContent).toContain("Go for the Throat");
  });

  it("renders rarity badges for missing cards", () => {
    const { container } = render(CollectionDiff, { props: { data: fullData } });
    const badges = container.querySelectorAll(".badge");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("renders empty state when nothing missing", () => {
    const { container } = render(CollectionDiff, {
      props: { data: { missing: [], wildcardCost: { common: 0, uncommon: 0, rare: 0, mythic: 0, unknown: 0, total: 0 }, unresolvedCards: [] } },
    });
    expect(container.textContent).toContain("complete");
  });

  it("shows warning for unresolved cards", () => {
    const data = { ...fullData, unresolvedCards: ["Some Unknown Card"] };
    const { container } = render(CollectionDiff, { props: { data } });
    expect(container.textContent).toContain("Some Unknown Card");
  });
});
