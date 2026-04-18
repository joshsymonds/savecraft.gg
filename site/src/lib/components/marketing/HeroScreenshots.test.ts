/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import HeroScreenshots from "./HeroScreenshots.svelte";

afterEach(cleanup);

const twoFrames = [
  { src: "/images/a.jpg", alt: "first frame" },
  { src: "/images/b.jpg", alt: "second frame" },
];

const threeFrames = [
  ...twoFrames,
  { src: "/images/c.jpg", alt: "third frame" },
];

describe("HeroScreenshots", () => {
  it("stacked variant renders every frame as an img", () => {
    const { container } = render(HeroScreenshots, {
      props: { frames: threeFrames, variant: "stacked" },
    });
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(3);
    expect(imgs[0]?.getAttribute("alt")).toBe("first frame");
  });

  it("overlap variant clamps to the first two frames", () => {
    const { container } = render(HeroScreenshots, {
      props: { frames: threeFrames, variant: "overlap" },
    });
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
  });

  it("carousel variant renders dots equal to frame count when more than one", () => {
    const { container } = render(HeroScreenshots, {
      props: { frames: threeFrames, variant: "carousel", autoAdvanceMs: 0 },
    });
    const dots = container.querySelectorAll(".dot");
    expect(dots).toHaveLength(3);
    // Exactly one dot starts active
    expect(container.querySelectorAll(".dot.active")).toHaveLength(1);
  });

  it("carousel variant hides dots when only one frame supplied", () => {
    const { container } = render(HeroScreenshots, {
      props: {
        frames: [{ src: "/x.jpg", alt: "solo" }],
        variant: "carousel",
        autoAdvanceMs: 0,
      },
    });
    expect(container.querySelector(".carousel-dots")).toBeNull();
  });

  it("accent prop applies the matching CSS class", () => {
    const { container } = render(HeroScreenshots, {
      props: { frames: twoFrames, variant: "stacked", accent: "blue" },
    });
    expect(container.querySelector(".accent-blue")).not.toBeNull();
    expect(container.querySelector(".accent-gold")).toBeNull();
  });

  it("renders eyebrow and title when provided", () => {
    const { getByText } = render(HeroScreenshots, {
      props: {
        frames: twoFrames,
        variant: "stacked",
        eyebrow: "TEST EYEBROW",
        title: "Test Title",
      },
    });
    expect(getByText("TEST EYEBROW")).toBeInTheDocument();
    expect(getByText("Test Title")).toBeInTheDocument();
  });
});
