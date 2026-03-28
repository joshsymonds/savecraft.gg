import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Stat from "./Stat.svelte";

afterEach(cleanup);

describe("Stat", () => {
  it("renders string value", () => {
    const { container } = render(Stat, { props: { value: "85.5%", label: "Success" } });
    expect(container.querySelector(".value")!.textContent).toBe("85.5%");
  });

  it("renders number value", () => {
    const { container } = render(Stat, { props: { value: 47, label: "Count" } });
    expect(container.querySelector(".value")!.textContent).toBe("47");
  });

  it("renders label", () => {
    const { container } = render(Stat, { props: { value: "A+", label: "Grade" } });
    expect(container.querySelector(".label")!.textContent).toBe("Grade");
  });

  it("defaults to highlight variant color", () => {
    const { container } = render(Stat, { props: { value: 1, label: "Test" } });
    const value = container.querySelector(".value") as HTMLElement;
    expect(value.style.color).toBe("var(--color-highlight)");
  });

  it("applies positive variant color", () => {
    const { container } = render(Stat, { props: { value: "58%", label: "WR", variant: "positive" } });
    const value = container.querySelector(".value") as HTMLElement;
    expect(value.style.color).toBe("var(--color-positive)");
  });

  it("applies negative variant color", () => {
    const { container } = render(Stat, { props: { value: "32%", label: "WR", variant: "negative" } });
    const value = container.querySelector(".value") as HTMLElement;
    expect(value.style.color).toBe("var(--color-negative)");
  });

  it("applies info variant color", () => {
    const { container } = render(Stat, { props: { value: 3.2, label: "Avg", variant: "info" } });
    const value = container.querySelector(".value") as HTMLElement;
    expect(value.style.color).toBe("var(--color-info)");
  });
});
