/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/static/public", () => ({
  PUBLIC_APP_URL: "https://test-app.savecraft.gg",
}));

vi.mock("$app/stores", async () => {
  const { readable } = await import("svelte/store");
  return {
    page: readable({ url: new URL("https://savecraft.gg/") }),
  };
});

vi.mock("$app/environment", () => ({
  browser: true,
}));

import SiteNav from "./SiteNav.svelte";

const TEST_APP_URL = "https://test-app.savecraft.gg";
const originalCookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;

afterEach(cleanup);

describe("SiteNav", () => {
  beforeEach(() => {
    Object.defineProperty(document, "cookie", originalCookieDescriptor);
  });

  it("renders the nav", () => {
    const { container } = render(SiteNav);
    expect(container.querySelector(".nav")).toBeInTheDocument();
  });

  it("defaults auth CTA to GET STARTED when no session cookie", () => {
    const { container } = render(SiteNav);
    const cta = container.querySelector(".nav-cta");
    expect(cta).toBeInTheDocument();
    expect(cta?.textContent?.trim()).toBe("GET STARTED");
    expect(cta?.getAttribute("href")).toBe(`${TEST_APP_URL}/sign-in`);
  });

  it("shows MY SAVECRAFT when Clerk session cookie is set", () => {
    Object.defineProperty(document, "cookie", {
      get: () => "__client_uat=1719000000",
      configurable: true,
    });
    const { container } = render(SiteNav);
    const cta = container.querySelector(".nav-cta");
    expect(cta).toBeInTheDocument();
    expect(cta?.textContent?.trim()).toBe("MY SAVECRAFT");
    expect(cta?.getAttribute("href")).toBe(TEST_APP_URL);
  });

  it("renders GAMES and SUPPORT nav links", () => {
    const { container } = render(SiteNav);
    const links = container.querySelectorAll(".nav-link");
    const texts = Array.from(links).map((l) => l.textContent?.trim());
    expect(texts).toContain("GAMES");
    expect(texts).toContain("DOCS");
    expect(texts).toContain("SUPPORT");
  });
});
