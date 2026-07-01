import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Verdict from "./Verdict.svelte";

afterEach(cleanup);

// Non-numeric values render as-is with no tween, so assertions are
// deterministic without faking timers.
const base = {
  value: "Factory Stalled",
  caption: "3 Critical Bottlenecks",
};

describe("Verdict", () => {
  it("renders the value", () => {
    const { container } = render(Verdict, { props: base });
    expect(container.querySelector(".value")?.textContent).toBe("Factory Stalled");
  });

  it("renders the caption", () => {
    const { container } = render(Verdict, { props: base });
    expect(container.querySelector(".caption")?.textContent).toBe("3 Critical Bottlenecks");
  });

  it("renders the sub line when provided", () => {
    const { container } = render(Verdict, {
      props: { ...base, sub: "Steel plate starvation cascades to 4 product lines" },
    });
    expect(container.querySelector(".sub")?.textContent).toBe(
      "Steel plate starvation cascades to 4 product lines",
    );
  });

  it("omits the sub line when absent", () => {
    const { container } = render(Verdict, { props: base });
    expect(container.querySelector(".sub")).toBeNull();
  });

  it("renders the stamp plate only when provided", () => {
    const without = render(Verdict, { props: base });
    expect(without.container.querySelector(".stamp")).toBeNull();
    cleanup();
    const with_ = render(Verdict, { props: { ...base, stamp: "!" } });
    expect(with_.container.querySelector(".stamp")?.textContent).toBe("!");
  });

  it("shrinks multi-character stamps", () => {
    const { container } = render(Verdict, { props: { ...base, stamp: "B+" } });
    expect(container.querySelector(".stamp")?.classList.contains("small")).toBe(true);
  });

  it("exposes the variant color on the root", () => {
    const { container } = render(Verdict, { props: { ...base, variant: "negative" } });
    const root = container.querySelector(".verdict") as HTMLElement;
    expect(root.style.getPropertyValue("--verdict-color")).toBe("var(--color-negative)");
  });

  it("defaults to the highlight variant with the brighter gold text", () => {
    const { container } = render(Verdict, { props: base });
    const root = container.querySelector(".verdict") as HTMLElement;
    expect(root.style.getPropertyValue("--verdict-color")).toBe("var(--color-gold)");
    expect(root.style.getPropertyValue("--verdict-text")).toBe("var(--color-gold-light)");
  });
});
