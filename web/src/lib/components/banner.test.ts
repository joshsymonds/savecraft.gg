import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Banner from "./Banner.svelte";

function textSnippet(text: string) {
  return (($$anchor: Comment) => {
    const el = document.createElement("span");
    el.textContent = text;
    $$anchor.before(el);
  }) as any;
}

describe("Banner", () => {
  afterEach(cleanup);

  it("renders children text", () => {
    render(Banner, { props: { children: textSnippet("Source is offline") } });
    expect(screen.getByText("Source is offline")).toBeInTheDocument();
  });

  it("has role=status for accessibility", () => {
    render(Banner, { props: { children: textSnippet("Notice") } });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows dot when dot prop is true", () => {
    const { container } = render(Banner, {
      props: { dot: true, children: textSnippet("Warning") },
    });
    expect(container.querySelector(".banner-dot")).toBeInTheDocument();
  });

  it("hides dot when dot prop is false", () => {
    const { container } = render(Banner, {
      props: { dot: false, children: textSnippet("Info") },
    });
    expect(container.querySelector(".banner-dot")).not.toBeInTheDocument();
  });

  it("applies custom color via CSS variable", () => {
    const { container } = render(Banner, {
      props: { color: "#e85a5a", children: textSnippet("Error") },
    });
    const banner = container.querySelector(".banner")!;
    expect((banner as HTMLElement).style.getPropertyValue("--banner-color")).toBe("#e85a5a");
  });

  it("applies custom background via CSS variable", () => {
    const { container } = render(Banner, {
      props: {
        background: "rgba(232, 90, 90, 0.1)",
        children: textSnippet("Error"),
      },
    });
    const banner = container.querySelector(".banner")!;
    expect((banner as HTMLElement).style.getPropertyValue("--banner-bg")).toBe(
      "rgba(232, 90, 90, 0.1)",
    );
  });

  it("applies custom border color via CSS variable", () => {
    const { container } = render(Banner, {
      props: {
        borderColor: "rgba(232, 90, 90, 0.2)",
        children: textSnippet("Error"),
      },
    });
    const banner = container.querySelector(".banner")!;
    expect((banner as HTMLElement).style.getPropertyValue("--banner-border")).toBe(
      "rgba(232, 90, 90, 0.2)",
    );
  });
});
