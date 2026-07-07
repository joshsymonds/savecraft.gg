/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import SocialMeta from "./SocialMeta.svelte";

afterEach(cleanup);

const baseProps = {
  slug: "poe",
  title: "Path of Exile -- Build Planner for Claude & ChatGPT | Savecraft",
  description: "GGG-approved account connect: your AI reads your live PoE characters.",
  url: "https://savecraft.gg/poe",
};

describe("SocialMeta", () => {
  it("emits og:title, og:description, and og:url from props", () => {
    render(SocialMeta, { props: baseProps });
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe(
      baseProps.title,
    );
    expect(
      document.head.querySelector('meta[property="og:description"]')?.getAttribute("content"),
    ).toBe(baseProps.description);
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(
      baseProps.url,
    );
  });

  it("defaults og:type to website when not provided", () => {
    render(SocialMeta, { props: baseProps });
    expect(document.head.querySelector('meta[property="og:type"]')?.getAttribute("content")).toBe(
      "website",
    );
  });

  it("accepts an explicit type prop that overrides the website default", () => {
    render(SocialMeta, { props: { ...baseProps, type: "article" } });
    expect(document.head.querySelector('meta[property="og:type"]')?.getAttribute("content")).toBe(
      "article",
    );
  });

  it("emits a canonical link pointing at the url prop", () => {
    render(SocialMeta, { props: baseProps });
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      baseProps.url,
    );
  });

  it("emits twitter:title, twitter:description, and twitter:image from props", () => {
    render(SocialMeta, { props: baseProps });
    expect(
      document.head.querySelector('meta[name="twitter:title"]')?.getAttribute("content"),
    ).toBe(baseProps.title);
    expect(
      document.head.querySelector('meta[name="twitter:description"]')?.getAttribute("content"),
    ).toBe(baseProps.description);
    expect(document.head.querySelector('meta[name="twitter:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/poe.png",
    );
  });

  it("still emits og:image, og:image dimensions, and twitter:card from slug", () => {
    render(SocialMeta, { props: baseProps });
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/poe.png",
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
  });
});
