import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Panel from "./Panel.svelte";

afterEach(cleanup);

describe("Panel", () => {
  it("renders with panel class", () => {
    const { container } = render(Panel);
    expect(container.querySelector(".panel")).toBeTruthy();
  });

  it("renders four corner decorations", () => {
    const { container } = render(Panel);
    expect(container.querySelectorAll(".corner")).toHaveLength(4);
  });

  it("applies default border color", () => {
    const { container } = render(Panel);
    const panel = container.querySelector(".panel") as HTMLElement;
    expect(panel.style.getPropertyValue("--panel-border")).toBe("var(--color-border)");
  });

  it("applies accent color to border and corners", () => {
    const { container } = render(Panel, { props: { accent: "var(--color-rarity-legendary)" } });
    const panel = container.querySelector(".panel") as HTMLElement;
    expect(panel.style.getPropertyValue("--panel-border")).toBe("var(--color-rarity-legendary)");
    expect(panel.style.getPropertyValue("--panel-corner")).toBe("var(--color-rarity-legendary)");
  });

  it("applies custom padding", () => {
    const { container } = render(Panel, { props: { padding: "var(--space-sm)" } });
    const panel = container.querySelector(".panel") as HTMLElement;
    expect(panel.style.getPropertyValue("--panel-padding")).toBe("var(--space-sm)");
  });

  it("uses default padding when none specified", () => {
    const { container } = render(Panel);
    const panel = container.querySelector(".panel") as HTMLElement;
    expect(panel.style.getPropertyValue("--panel-padding")).toBe("var(--space-lg)");
  });

  it("renders as nested variant without corners", () => {
    const { container } = render(Panel, { props: { nested: true } });
    expect(container.querySelectorAll(".corner")).toHaveLength(0);
  });

  it("applies nested class when nested prop is true", () => {
    const { container } = render(Panel, { props: { nested: true } });
    const panel = container.querySelector(".panel") as HTMLElement;
    expect(panel.classList.contains("nested")).toBe(true);
  });

  it("does not apply nested class by default", () => {
    const { container } = render(Panel);
    const panel = container.querySelector(".panel") as HTMLElement;
    expect(panel.classList.contains("nested")).toBe(false);
  });

  it("renders watermark img when watermark prop provided", () => {
    const { container } = render(Panel, { props: { watermark: "https://example.com/icon.png" } });
    const img = container.querySelector(".panel-watermark") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe("https://example.com/icon.png");
    expect(img.getAttribute("aria-hidden")).toBe("true");
  });

  it("does not render watermark when prop absent", () => {
    const { container } = render(Panel);
    expect(container.querySelector(".panel-watermark")).toBeNull();
  });

  it("applies compact class when compact prop is true", () => {
    const { container } = render(Panel, { props: { compact: true } });
    const panel = container.querySelector(".panel") as HTMLElement;
    expect(panel.classList.contains("compact")).toBe(true);
  });

  it("does not apply compact class by default", () => {
    const { container } = render(Panel);
    const panel = container.querySelector(".panel") as HTMLElement;
    expect(panel.classList.contains("compact")).toBe(false);
  });

  it("renders compact variant without corners", () => {
    const { container } = render(Panel, { props: { compact: true } });
    expect(container.querySelectorAll(".corner")).toHaveLength(0);
  });

  it("uses space-md default padding when compact", () => {
    const { container } = render(Panel, { props: { compact: true } });
    const panel = container.querySelector(".panel") as HTMLElement;
    expect(panel.style.getPropertyValue("--panel-padding")).toBe("var(--space-md)");
  });

  it("allows padding override on compact variant", () => {
    const { container } = render(Panel, { props: { compact: true, padding: "var(--space-xl)" } });
    const panel = container.querySelector(".panel") as HTMLElement;
    expect(panel.style.getPropertyValue("--panel-padding")).toBe("var(--space-xl)");
  });
});
