import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Tag from "./Tag.svelte";

afterEach(cleanup);

describe("Tag", () => {
  it("renders label text", () => {
    const { container } = render(Tag, { props: { label: "Creature" } });
    expect(container.querySelector(".tag")!.textContent).toBe("Creature");
  });

  it("applies default color when none specified", () => {
    const { container } = render(Tag, { props: { label: "Test" } });
    const tag = container.querySelector(".tag") as HTMLElement;
    expect(tag.style.getPropertyValue("--tag-color")).toBe("var(--color-text-muted)");
  });

  it("applies custom color", () => {
    const { container } = render(Tag, { props: { label: "Blue", color: "#4a9aea" } });
    const tag = container.querySelector(".tag") as HTMLElement;
    expect(tag.style.getPropertyValue("--tag-color")).toBe("#4a9aea");
  });

  it("applies CSS variable color", () => {
    const { container } = render(Tag, { props: { label: "Fire", color: "var(--color-red)" } });
    const tag = container.querySelector(".tag") as HTMLElement;
    expect(tag.style.getPropertyValue("--tag-color")).toBe("var(--color-red)");
  });
});
