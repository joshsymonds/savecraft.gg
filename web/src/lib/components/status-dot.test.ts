import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import StatusDot from "./StatusDot.svelte";

describe("StatusDot", () => {
  it("renders the dot element", () => {
    const { container } = render(StatusDot, { props: { status: "online" } });
    expect(container.querySelector(".dot")).toBeInTheDocument();
  });

  it("shows pulse animation when online", () => {
    const { container } = render(StatusDot, { props: { status: "online" } });
    expect(container.querySelector(".pulse")).toBeInTheDocument();
  });

  it("hides pulse when offline", () => {
    const { container } = render(StatusDot, { props: { status: "offline" } });
    expect(container.querySelector(".pulse")).not.toBeInTheDocument();
  });

  it("hides pulse when error", () => {
    const { container } = render(StatusDot, { props: { status: "error" } });
    expect(container.querySelector(".pulse")).not.toBeInTheDocument();
  });

  it("applies custom size", () => {
    const { container } = render(StatusDot, {
      props: { status: "online", size: 12 },
    });
    const dot = container.querySelector<HTMLElement>(".status-dot")!;
    expect(dot.style.getPropertyValue("--dot-size")).toBe("12px");
  });
});
