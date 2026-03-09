/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/static/public", () => ({
  PUBLIC_APP_URL: "https://test-app.savecraft.gg",
  PUBLIC_INSTALL_URL: "https://test-install.savecraft.gg",
}));

import Page from "./+page.svelte";

afterEach(cleanup);

describe("Marketing page", () => {
  it("renders the hero title", () => {
    const { container } = render(Page);
    expect(container.querySelector(".hero-title")).toBeInTheDocument();
    expect(container.querySelector(".hero-title")?.textContent).toContain("Your AI already");
  });

  it("renders all six game cards", () => {
    const { container } = render(Page);
    const cards = container.querySelectorAll(".games-grid .game-card");
    expect(cards).toHaveLength(6);
  });

  it("renders the conversation demo area", () => {
    const { container } = render(Page);
    expect(container.querySelector(".demo-panel")).toBeInTheDocument();
  });

  it("renders security section", () => {
    const { container } = render(Page);
    const securityItems = container.querySelectorAll(".security-item");
    expect(securityItems).toHaveLength(4);
  });

  it("renders community section with Discord and GitHub links", () => {
    const { container } = render(Page);
    const communityCards = container.querySelectorAll(".community-card");
    expect(communityCards).toHaveLength(2);
  });
});
