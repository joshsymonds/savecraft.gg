import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Badge from "./Badge.svelte";

afterEach(cleanup);

describe("Badge", () => {
  it("renders label text", () => {
    const { container } = render(Badge, { props: { label: "Mythic" } });
    expect(container.querySelector(".badge")!.textContent).toBe("Mythic");
  });

  it("defaults to muted variant", () => {
    const { container } = render(Badge, { props: { label: "Test" } });
    const badge = container.querySelector(".badge") as HTMLElement;
    expect(badge.style.getPropertyValue("--badge-color")).toBe("var(--color-text-muted)");
  });

  const rarityVariants = [
    ["legendary", "var(--color-rarity-legendary)"],
    ["epic", "var(--color-rarity-epic)"],
    ["rare", "var(--color-rarity-rare)"],
    ["uncommon", "var(--color-rarity-uncommon)"],
    ["common", "var(--color-rarity-common)"],
    ["poor", "var(--color-rarity-poor)"],
  ] as const;

  for (const [variant, expected] of rarityVariants) {
    it(`applies ${variant} rarity color`, () => {
      const { container } = render(Badge, { props: { label: variant, variant } });
      const badge = container.querySelector(".badge") as HTMLElement;
      expect(badge.style.getPropertyValue("--badge-color")).toBe(expected);
    });
  }

  const semanticVariants = [
    ["positive", "var(--color-positive)"],
    ["negative", "var(--color-negative)"],
    ["info", "var(--color-info)"],
    ["warning", "var(--color-warning)"],
    ["highlight", "var(--color-highlight)"],
    ["muted", "var(--color-text-muted)"],
  ] as const;

  for (const [variant, expected] of semanticVariants) {
    it(`applies ${variant} semantic color`, () => {
      const { container } = render(Badge, { props: { label: variant, variant } });
      const badge = container.querySelector(".badge") as HTMLElement;
      expect(badge.style.getPropertyValue("--badge-color")).toBe(expected);
    });
  }
});
