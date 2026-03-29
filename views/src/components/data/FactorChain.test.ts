import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import FactorChain from "./FactorChain.svelte";

afterEach(cleanup);

const surgeryFactors = [
  { label: "Surgeon", value: 0.9 },
  { label: "Bed", value: 1.1 },
  { label: "Medicine", value: 1.0 },
  { label: "Difficulty", value: 1.0 },
];

const surgeryResult = { label: "Success", value: 0.853 };

describe("FactorChain", () => {
  it("renders all factors", () => {
    const { container } = render(FactorChain, {
      props: { factors: surgeryFactors, result: surgeryResult },
    });
    // 4 factors + 1 result (which also has .factor-item)
    const items = container.querySelectorAll(".factor-item:not(.factor-result)");
    expect(items).toHaveLength(4);
  });

  it("renders factor labels", () => {
    const { container } = render(FactorChain, {
      props: { factors: surgeryFactors, result: surgeryResult },
    });
    const labels = container.querySelectorAll(".factor-label");
    expect(labels[0]!.textContent).toBe("Surgeon");
    expect(labels[1]!.textContent).toBe("Bed");
  });

  it("renders factor values with default precision", () => {
    const { container } = render(FactorChain, {
      props: { factors: surgeryFactors, result: surgeryResult },
    });
    const values = container.querySelectorAll(".factor-value");
    expect(values[0]!.textContent).toBe("0.90");
  });

  it("renders custom precision", () => {
    const { container } = render(FactorChain, {
      props: { factors: surgeryFactors, result: surgeryResult, precision: 3 },
    });
    const values = container.querySelectorAll(".factor-value");
    expect(values[0]!.textContent).toBe("0.900");
  });

  it("renders the result", () => {
    const { container } = render(FactorChain, {
      props: { factors: surgeryFactors, result: surgeryResult },
    });
    const resultEl = container.querySelector(".factor-result .factor-value");
    expect(resultEl!.textContent).toBe("0.85");
  });

  it("renders operator symbols between factors", () => {
    const { container } = render(FactorChain, {
      props: { factors: surgeryFactors, result: surgeryResult },
    });
    const operators = container.querySelectorAll(".factor-operator");
    // 3 operators between 4 factors + 1 equals sign before result = 4 total
    expect(operators).toHaveLength(4);
  });

  it("uses custom operator", () => {
    const { container } = render(FactorChain, {
      props: { factors: surgeryFactors, result: surgeryResult, operator: "+" },
    });
    const operators = container.querySelectorAll(".factor-operator");
    // First 3 should be +, last should be =
    expect(operators[0]!.textContent).toBe("+");
    expect(operators[3]!.textContent).toBe("=");
  });

  it("applies variant color to factor values", () => {
    const factors = [
      { label: "Good", value: 1.5, variant: "positive" as const },
      { label: "Bad", value: 0.3, variant: "negative" as const },
    ];
    const { container } = render(FactorChain, {
      props: { factors, result: { label: "Total", value: 0.45 } },
    });
    const values = container.querySelectorAll(".factor-value");
    expect(values[0]!.className).toContain("positive");
    expect(values[1]!.className).toContain("negative");
  });

  it("applies variant to result", () => {
    const { container } = render(FactorChain, {
      props: {
        factors: [{ label: "A", value: 1.0 }],
        result: { label: "Total", value: 0.98, variant: "positive" },
      },
    });
    const resultValue = container.querySelector(".factor-result .factor-value");
    expect(resultValue!.className).toContain("positive");
  });
});
