/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Page from "./+page.svelte";

afterEach(cleanup);

describe("Privacy page", () => {
  it("ships exactly one canonical link and one of each og:title/description/url", () => {
    render(Page);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/privacy",
    );
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[property="og:description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[property="og:url"]')).toHaveLength(1);
  });

  it("ships twitter:title and twitter:description", () => {
    render(Page);
    expect(
      document.head.querySelector('meta[name="twitter:title"]')?.getAttribute("content"),
    ).not.toBeNull();
    expect(
      document.head.querySelector('meta[name="twitter:description"]')?.getAttribute("content"),
    ).not.toBeNull();
  });

  it("ships a JSON-LD script tag", () => {
    render(Page);
    expect(document.head.querySelector('script[type="application/ld+json"]')).not.toBeNull();
  });
});
