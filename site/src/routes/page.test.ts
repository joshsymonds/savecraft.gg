/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/static/public", () => ({
  PUBLIC_APP_URL: "https://test-app.savecraft.gg",
  PUBLIC_INSTALL_URL: "https://test-install.savecraft.gg",
}));

import Page from "./+page.svelte";

const TEST_APP_URL = "https://test-app.savecraft.gg";

// Save and restore the original cookie descriptor between tests
const originalCookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;

afterEach(cleanup);

describe("Marketing page", () => {
  beforeEach(() => {
    // Restore real cookie behavior before each test
    Object.defineProperty(document, "cookie", originalCookieDescriptor);
  });

  it("renders the nav", () => {
    const { container } = render(Page);
    expect(container.querySelector(".nav")).toBeInTheDocument();
  });

  it("renders the hero title", () => {
    const { container } = render(Page);
    expect(container.querySelector(".hero-title")).toBeInTheDocument();
    expect(container.querySelector(".hero-title")?.textContent).toContain("Your AI already");
  });

  it("defaults auth CTA to GET STARTED when no session cookie", () => {
    const { container } = render(Page);
    const cta = container.querySelector(".nav-cta");
    expect(cta).toBeInTheDocument();
    expect(cta?.textContent).toBe("GET STARTED");
    expect(cta?.getAttribute("href")).toBe(`${TEST_APP_URL}/sign-up`);
  });

  it("shows MY SAVECRAFT when Clerk session cookie is set", () => {
    Object.defineProperty(document, "cookie", {
      get: () => "__client_uat=1719000000",
      configurable: true,
    });
    const { container } = render(Page);
    const cta = container.querySelector(".nav-cta");
    expect(cta).toBeInTheDocument();
    expect(cta?.textContent).toBe("MY SAVECRAFT");
    expect(cta?.getAttribute("href")).toBe(TEST_APP_URL);
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
