import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ProgressBar from "./ProgressBar.svelte";

afterEach(cleanup);

describe("ProgressBar", () => {
  it("renders a fill bar", () => {
    const { container } = render(ProgressBar, { props: { value: 50 } });
    const fill = container.querySelector(".progress-fill") as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.style.width).toBe("50%");
  });

  it("clamps fill to 100% when value exceeds max", () => {
    const { container } = render(ProgressBar, { props: { value: 120, max: 100 } });
    const fill = container.querySelector(".progress-fill") as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("renders label when provided", () => {
    const { container } = render(ProgressBar, { props: { value: 85, label: "85%" } });
    const label = container.querySelector(".progress-label");
    expect(label).toBeTruthy();
    expect(label!.textContent).toBe("85%");
  });

  it("omits label when not provided", () => {
    const { container } = render(ProgressBar, { props: { value: 50 } });
    expect(container.querySelector(".progress-label")).toBeNull();
  });

  it("uses custom max for percentage calculation", () => {
    const { container } = render(ProgressBar, { props: { value: 15, max: 20 } });
    const fill = container.querySelector(".progress-fill") as HTMLElement;
    expect(fill.style.width).toBe("75%");
  });

  it("applies variant color", () => {
    const { container } = render(ProgressBar, { props: { value: 50, variant: "positive" } });
    const fill = container.querySelector(".progress-fill") as HTMLElement;
    expect(fill.style.background).toBe("var(--color-positive)");
  });

  it("defaults to info variant", () => {
    const { container } = render(ProgressBar, { props: { value: 50 } });
    const fill = container.querySelector(".progress-fill") as HTMLElement;
    expect(fill.style.background).toBe("var(--color-info)");
  });

  it("applies custom height", () => {
    const { container } = render(ProgressBar, { props: { value: 50, height: 24 } });
    const track = container.querySelector(".progress-track") as HTMLElement;
    expect(track.style.height).toBe("24px");
  });

  it("handles zero value", () => {
    const { container } = render(ProgressBar, { props: { value: 0 } });
    const fill = container.querySelector(".progress-fill") as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("adds over class when value exceeds max", () => {
    const { container } = render(ProgressBar, { props: { value: 8, max: 6 } });
    const track = container.querySelector(".progress-track");
    expect(track!.classList.contains("over")).toBe(true);
  });
});
