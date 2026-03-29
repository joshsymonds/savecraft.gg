import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ManaCost from "./ManaCost.svelte";

afterEach(cleanup);

describe("ManaCost", () => {
  describe("parsing", () => {
    it("renders one pip for {R}", () => {
      const { container } = render(ManaCost, { props: { cost: "{R}" } });
      const pips = container.querySelectorAll(".pip");
      expect(pips.length).toBe(1);
    });

    it("renders three pips for {2}{W}{B}", () => {
      const { container } = render(ManaCost, { props: { cost: "{2}{W}{B}" } });
      const pips = container.querySelectorAll(".pip");
      expect(pips.length).toBe(3);
    });

    it("renders four pips for {X}{R}{R}{R}", () => {
      const { container } = render(ManaCost, { props: { cost: "{X}{R}{R}{R}" } });
      const pips = container.querySelectorAll(".pip");
      expect(pips.length).toBe(4);
    });

    it("handles hybrid symbols in cost string", () => {
      const { container } = render(ManaCost, { props: { cost: "{2}{W/U}{W/U}" } });
      const hybrids = container.querySelectorAll(".pip.hybrid");
      expect(hybrids.length).toBe(2);
    });

    it("handles phyrexian symbols in cost string", () => {
      const { container } = render(ManaCost, { props: { cost: "{W/P}{W/P}" } });
      const phyrexian = container.querySelectorAll(".pip.phyrexian");
      expect(phyrexian.length).toBe(2);
    });
  });

  describe("empty and edge cases", () => {
    it("renders nothing for empty string", () => {
      const { container } = render(ManaCost, { props: { cost: "" } });
      const pips = container.querySelectorAll(".pip");
      expect(pips.length).toBe(0);
    });

    it("renders nothing for string with no braces", () => {
      const { container } = render(ManaCost, { props: { cost: "no mana" } });
      const pips = container.querySelectorAll(".pip");
      expect(pips.length).toBe(0);
    });
  });

  describe("layout", () => {
    it("wraps pips in a mana-cost container", () => {
      const { container } = render(ManaCost, { props: { cost: "{2}{W}" } });
      const wrapper = container.querySelector(".mana-cost");
      expect(wrapper).not.toBeNull();
    });

    it("does not render mana-cost container for empty cost", () => {
      const { container } = render(ManaCost, { props: { cost: "" } });
      const wrapper = container.querySelector(".mana-cost");
      expect(wrapper).toBeNull();
    });
  });

  describe("size passthrough", () => {
    it("passes size to ManaPip children", () => {
      const { container } = render(ManaCost, { props: { cost: "{W}", size: "lg" } });
      const pip = container.querySelector(".pip") as HTMLElement;
      expect(pip.style.getPropertyValue("--pip-size")).toBe("34px");
    });
  });
});
