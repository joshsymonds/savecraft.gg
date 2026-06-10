/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import MarketingSection from "./MarketingSection.svelte";

afterEach(cleanup);

describe("MarketingSection", () => {
  it("renders eyebrow, title, and subtitle", () => {
    const { getByText } = render(MarketingSection, {
      props: {
        eyebrow: "TEST EYEBROW",
        title: "Test Title",
        subtitle: "Test subtitle text",
      },
    });
    expect(getByText("TEST EYEBROW")).toBeInTheDocument();
    expect(getByText("Test Title")).toBeInTheDocument();
    expect(getByText("Test subtitle text")).toBeInTheDocument();
  });

  it("renders legacy styling when no treatment is given", () => {
    const { container } = render(MarketingSection, {
      props: { eyebrow: "E", title: "T" },
    });
    expect(container.querySelector(".evolved")).toBeNull();
    expect(container.querySelector("[class*='treatment-']")).toBeNull();
  });

  it.each(["plain", "tinted", "bleed"] as const)(
    "treatment=%s applies its treatment class and the evolved class",
    (treatment) => {
      const { container } = render(MarketingSection, {
        props: { eyebrow: "E", title: "T", treatment },
      });
      expect(container.querySelector(`.treatment-${treatment}`)).not.toBeNull();
      expect(container.querySelector(".evolved")).not.toBeNull();
    },
  );

  it("applies only the requested treatment class", () => {
    const { container } = render(MarketingSection, {
      props: { eyebrow: "E", title: "T", treatment: "tinted" },
    });
    expect(container.querySelector(".treatment-plain")).toBeNull();
    expect(container.querySelector(".treatment-bleed")).toBeNull();
  });

  it("sets the section id for anchor links", () => {
    const { container } = render(MarketingSection, {
      props: { eyebrow: "E", title: "T", id: "how" },
    });
    expect(container.querySelector("section#how")).not.toBeNull();
  });
});
