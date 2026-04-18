/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Page from "./+page.svelte";

afterEach(cleanup);

const mockGame = {
  gameId: "magic",
  sources: ["wasm"],
  name: "Magic: The Gathering",
  description: "test description",
  channel: "beta",
  coverage: "partial",
  limitations: [],
  iconHtml: '<img src="data:image/png;base64,AA==" alt="" width="32" height="32" />',
  referenceModules: [
    { name: "Card Search", description: "instant module", requires_save: false },
    { name: "Match Stats", description: "save-gated module", requires_save: true },
  ],
};

describe("Games listing module badges", () => {
  it("renders INSTANT badge for a requires_save=false module", () => {
    const { getAllByText } = render(Page, { props: { data: { games: [mockGame] } } });
    expect(getAllByText("INSTANT")).toHaveLength(1);
  });

  it("renders NEEDS SAVE badge for a requires_save=true module", () => {
    const { getAllByText } = render(Page, { props: { data: { games: [mockGame] } } });
    expect(getAllByText("NEEDS SAVE")).toHaveLength(1);
  });

  it("renders no module badges when plugin has zero reference modules", () => {
    const emptyGame = { ...mockGame, referenceModules: [] };
    const { queryByText } = render(Page, { props: { data: { games: [emptyGame] } } });
    expect(queryByText("INSTANT")).toBeNull();
    expect(queryByText("NEEDS SAVE")).toBeNull();
  });

  it("places the badge inline with the module name in the same title row", () => {
    const { container } = render(Page, { props: { data: { games: [mockGame] } } });
    const row = container.querySelector(".module-title-row");
    expect(row).toBeInTheDocument();
    expect(row?.querySelector(".module-name")?.textContent).toBe("Card Search");
    expect(row?.textContent).toContain("INSTANT");
  });
});
