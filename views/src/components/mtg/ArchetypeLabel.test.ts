import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ArchetypeLabel from "./ArchetypeLabel.svelte";

afterEach(cleanup);

describe("ArchetypeLabel", () => {
  it("renders archetype code", () => {
    const { container } = render(ArchetypeLabel, { props: { colors: ["W", "B"] } });
    expect(container.textContent).toContain("WB");
  });

  it("renders custom name when provided", () => {
    const { container } = render(ArchetypeLabel, { props: { colors: ["W", "B"], name: "Orzhov" } });
    expect(container.textContent).toContain("Orzhov");
  });

  it("renders the label element", () => {
    const { container } = render(ArchetypeLabel, { props: { colors: ["U", "R"] } });
    expect(container.querySelector(".archetype-label")).not.toBeNull();
  });

  it("applies gradient background for two colors", () => {
    const { container } = render(ArchetypeLabel, { props: { colors: ["R", "G"] } });
    const label = container.querySelector(".archetype-label") as HTMLElement;
    expect(label.style.getPropertyValue("--arch-bg")).toContain("linear-gradient");
  });

  it("applies solid background for single color", () => {
    const { container } = render(ArchetypeLabel, { props: { colors: ["U"] } });
    const label = container.querySelector(".archetype-label") as HTMLElement;
    expect(label.style.getPropertyValue("--arch-bg")).not.toContain("linear-gradient");
  });
});
