/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/static/public", () => ({
  PUBLIC_APP_URL: "https://test-app.savecraft.gg",
  PUBLIC_INSTALL_URL: "https://test-install.savecraft.gg",
}));

import Page from "./+page.svelte";

afterEach(cleanup);

const mockData = {
  availableGames: [
    {
      gameId: "d2r",
      source: "wasm",
      name: "Diablo II: Resurrected",
      description: "D2R parser",
      channel: "beta",
      coverage: "partial",
      limitations: [],
      iconHtml: '<img src="data:image/png;base64,AA==" alt="" width="32" height="32" />',
      referenceModules: [],
    },
    {
      gameId: "rimworld",
      source: "mod",
      name: "RimWorld",
      description: "RimWorld mod",
      channel: "alpha",
      coverage: "full",
      limitations: [],
      iconHtml: '<img src="data:image/png;base64,AA==" alt="" width="32" height="32" />',
      referenceModules: [],
    },
  ],
};

describe("Marketing page", () => {
  it("renders the hero title", () => {
    const { container } = render(Page, { props: { data: mockData } });
    expect(container.querySelector(".hero-title")).toBeInTheDocument();
    expect(container.querySelector(".hero-title")?.textContent).toContain("Your AI is making");
  });

  it("renders game cards for available and planned games", () => {
    const { container } = render(Page, { props: { data: mockData } });
    const cards = container.querySelectorAll(".games-grid .game-card");
    // 2 auto-discovered + 2 hardcoded planned
    expect(cards).toHaveLength(4);
  });

  it("renders the conversation demo area", () => {
    const { container } = render(Page, { props: { data: mockData } });
    expect(container.querySelector(".demo-panel")).toBeInTheDocument();
  });

  it("renders security section", () => {
    const { container } = render(Page, { props: { data: mockData } });
    const securityItems = container.querySelectorAll(".security-item");
    expect(securityItems).toHaveLength(4);
  });

  it("renders community section with Discord and GitHub links", () => {
    const { container } = render(Page, { props: { data: mockData } });
    const communityCards = container.querySelectorAll(".community-card");
    expect(communityCards).toHaveLength(2);
  });
});
