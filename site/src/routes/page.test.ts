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
      sources: ["wasm"],
      name: "Diablo II: Resurrected",
      description: "D2R parser",
      channel: "beta",
      coverage: "partial",
      limitations: [],
      iconHtml: '<img src="data:image/png;base64,AA==" alt="" width="32" height="32" />',
      referenceModules: [
        { name: "Drop Calculator", description: "Drop odds", requires_save: false },
        { name: "Runeword Lookup", description: "Runewords", requires_save: false },
        { name: "Breakpoint Tables", description: "FCR/FHR", requires_save: false },
      ],
    },
    {
      gameId: "rimworld",
      sources: ["mod"],
      name: "RimWorld",
      description: "RimWorld mod",
      channel: "alpha",
      coverage: "full",
      limitations: [],
      iconHtml: '<img src="data:image/png;base64,AA==" alt="" width="32" height="32" />',
      referenceModules: [
        { name: "Crops", description: "Crop data", requires_save: false },
        { name: "Surgery", description: "Surgery odds", requires_save: false },
      ],
    },
  ],
};

describe("Marketing page", () => {
  it("renders the hero title", () => {
    const { container } = render(Page, { props: { data: mockData } });
    expect(container.querySelector(".hero-title")).toBeInTheDocument();
    expect(container.querySelector(".hero-title")?.textContent).toContain(
      "Real game data for your AI",
    );
  });

  it("renders game cards for available and planned games", () => {
    const { container } = render(Page, { props: { data: mockData } });
    const cards = container.querySelectorAll(".games-grid .game-card");
    // 2 auto-discovered + 1 hardcoded planned (Baldur's Gate 3)
    expect(cards).toHaveLength(3);
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

  it("derives proof bar counts from the plugin manifest data", () => {
    const { container } = render(Page, { props: { data: mockData } });
    const proofText = container.querySelector(".proof-bar")?.textContent ?? "";
    // 2 games in fixture, 3 + 2 = 5 reference modules
    expect(proofText).toContain("2 games");
    expect(proofText).toContain("5 expert modules");
  });

  it("shows the Magic rotation demo, not the D2R Warlock demo", () => {
    const { container, queryByText } = render(Page, { props: { data: mockData } });
    expect(queryByText(/Echoing Strike Warlock/)).toBeNull();
    expect(container.textContent).toContain("Sheoldred");
  });

  it("contains no source-kind taxonomy cards", () => {
    const { queryByText } = render(Page, { props: { data: mockData } });
    expect(queryByText("YOUR ACCOUNT")).toBeNull();
    expect(queryByText("YOUR SAVE FILES")).toBeNull();
    expect(queryByText("AN IN-GAME MOD")).toBeNull();
  });

  it("ships social meta pointing at the generated OG card", () => {
    render(Page, { props: { data: mockData } });
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/home.png",
    );
    expect(
      document.head.querySelector('meta[property="og:image:width"]')?.getAttribute("content"),
    ).toBe("1200");
    expect(
      document.head.querySelector('meta[property="og:image:height"]')?.getAttribute("content"),
    ).toBe("630");
    expect(document.head.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe(
      "summary_large_image",
    );
    expect(document.head.querySelector('meta[name="twitter:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/home.png",
    );
  });

  it("ships exactly one canonical link and one of each og:title/description/url", () => {
    render(Page, { props: { data: mockData } });
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg",
    );
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[property="og:description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[property="og:url"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg",
    );
    expect(
      document.head.querySelector('meta[name="twitter:title"]')?.getAttribute("content"),
    ).toBe("Savecraft -- Real game data for your AI assistant");
    expect(
      document.head.querySelector('meta[name="twitter:description"]')?.getAttribute("content"),
    ).not.toBeNull();
  });

  it("ships WebSite + SoftwareApplication JSON-LD", () => {
    render(Page, { props: { data: mockData } });
    const script = document.head.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script?.textContent ?? "{}");
    const types = data["@graph"].map((n: { "@type": string }) => n["@type"]);
    expect(types).toContain("WebSite");
    expect(types).toContain("SoftwareApplication");
  });

  it("uses at least 3 distinct section treatments", () => {
    const { container } = render(Page, { props: { data: mockData } });
    const used = new Set(
      ["plain", "tinted", "bleed"].filter(
        (t) => container.querySelector(`.treatment-${t}`) !== null,
      ),
    );
    expect(used.size).toBeGreaterThanOrEqual(3);
  });
});
