import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ManaPip from "./ManaPip.svelte";

afterEach(cleanup);

describe("ManaPip", () => {
  describe("single color symbols", () => {
    const colors = ["W", "U", "B", "R", "G", "C"] as const;

    for (const color of colors) {
      it(`renders ${color} as a pip element`, () => {
        const { container } = render(ManaPip, { props: { symbol: color } });
        const pip = container.querySelector(".pip");
        expect(pip).not.toBeNull();
      });

      it(`applies unique gradient for ${color}`, () => {
        const { container } = render(ManaPip, { props: { symbol: color } });
        const pip = container.querySelector(".pip") as HTMLElement;
        const bg = pip.style.getPropertyValue("--pip-bg");
        expect(bg).toContain("linear-gradient");
      });
    }

    it("renders different gradients for each color", () => {
      const gradients = new Set<string>();
      for (const color of colors) {
        const { container } = render(ManaPip, { props: { symbol: color } });
        const pip = container.querySelector(".pip") as HTMLElement;
        gradients.add(pip.style.getPropertyValue("--pip-bg"));
        cleanup();
      }
      expect(gradients.size).toBe(colors.length);
    });
  });

  describe("generic mana (numbers)", () => {
    for (const num of ["0", "1", "2", "5", "10", "15"]) {
      it(`renders number ${num} as text inside pip`, () => {
        const { container } = render(ManaPip, { props: { symbol: num } });
        const pip = container.querySelector(".pip");
        expect(pip).not.toBeNull();
        expect(pip!.textContent!.trim()).toBe(num);
      });
    }

    it("renders X symbol", () => {
      const { container } = render(ManaPip, { props: { symbol: "X" } });
      const pip = container.querySelector(".pip");
      expect(pip!.textContent!.trim()).toBe("X");
    });
  });

  describe("hybrid mana", () => {
    it("renders W/U as a hybrid pip", () => {
      const { container } = render(ManaPip, { props: { symbol: "W/U" } });
      const pip = container.querySelector(".pip.hybrid");
      expect(pip).not.toBeNull();
    });

    it("contains an SVG for split-circle rendering", () => {
      const { container } = render(ManaPip, { props: { symbol: "W/U" } });
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
    });

    it("renders B/G as hybrid", () => {
      const { container } = render(ManaPip, { props: { symbol: "B/G" } });
      expect(container.querySelector(".pip.hybrid")).not.toBeNull();
    });

    it("renders R/W as hybrid", () => {
      const { container } = render(ManaPip, { props: { symbol: "R/W" } });
      expect(container.querySelector(".pip.hybrid")).not.toBeNull();
    });
  });

  describe("phyrexian mana", () => {
    it("renders W/P as phyrexian pip", () => {
      const { container } = render(ManaPip, { props: { symbol: "W/P" } });
      const pip = container.querySelector(".pip.phyrexian");
      expect(pip).not.toBeNull();
    });

    it("renders standalone P as phyrexian", () => {
      const { container } = render(ManaPip, { props: { symbol: "P" } });
      const pip = container.querySelector(".pip.phyrexian");
      expect(pip).not.toBeNull();
    });

    it("uses phi symbol for phyrexian display", () => {
      const { container } = render(ManaPip, { props: { symbol: "W/P" } });
      const pip = container.querySelector(".pip.phyrexian");
      expect(pip!.textContent!.trim()).toBe("\u03C6");
    });
  });

  describe("sizes", () => {
    const sizes = [
      ["sm", "18"],
      ["md", "24"],
      ["lg", "34"],
    ] as const;

    for (const [size, expectedPx] of sizes) {
      it(`sets --pip-size to ${expectedPx}px for ${size}`, () => {
        const { container } = render(ManaPip, { props: { symbol: "W", size } });
        const pip = container.querySelector(".pip") as HTMLElement;
        expect(pip.style.getPropertyValue("--pip-size")).toBe(`${expectedPx}px`);
      });
    }

    it("defaults to md size", () => {
      const { container } = render(ManaPip, { props: { symbol: "W" } });
      const pip = container.querySelector(".pip") as HTMLElement;
      expect(pip.style.getPropertyValue("--pip-size")).toBe("24px");
    });
  });

  describe("accessibility", () => {
    it("has aria-label for color symbol", () => {
      const { container } = render(ManaPip, { props: { symbol: "W" } });
      const pip = container.querySelector("[aria-label]");
      expect(pip).not.toBeNull();
      expect(pip!.getAttribute("aria-label")).toContain("W");
    });

    it("has aria-label for hybrid", () => {
      const { container } = render(ManaPip, { props: { symbol: "W/U" } });
      const pip = container.querySelector("[aria-label]");
      expect(pip!.getAttribute("aria-label")).toContain("W/U");
    });

    it("has title attribute", () => {
      const { container } = render(ManaPip, { props: { symbol: "R" } });
      const pip = container.querySelector("[title]");
      expect(pip).not.toBeNull();
    });
  });

  describe("case insensitivity", () => {
    it("handles lowercase input", () => {
      const { container } = render(ManaPip, { props: { symbol: "w" } });
      const pip = container.querySelector(".pip") as HTMLElement;
      expect(pip.style.getPropertyValue("--pip-bg")).toContain("linear-gradient");
    });
  });
});
