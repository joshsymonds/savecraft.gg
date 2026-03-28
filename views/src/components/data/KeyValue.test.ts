import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import KeyValue from "./KeyValue.svelte";

afterEach(cleanup);

describe("KeyValue", () => {
  const basicItems = [
    { key: "Class", value: "Paladin" },
    { key: "Level", value: 92 },
  ];

  it("renders all key-value pairs", () => {
    const { container } = render(KeyValue, { props: { items: basicItems } });
    const pairs = container.querySelectorAll(".pair");
    expect(pairs).toHaveLength(2);
  });

  it("renders key text", () => {
    const { container } = render(KeyValue, { props: { items: basicItems } });
    const keys = container.querySelectorAll(".key");
    expect(keys[0].textContent).toBe("Class");
    expect(keys[1].textContent).toBe("Level");
  });

  it("renders string and number values", () => {
    const { container } = render(KeyValue, { props: { items: basicItems } });
    const values = container.querySelectorAll(".value");
    expect(values[0].textContent).toBe("Paladin");
    expect(values[1].textContent).toBe("92");
  });

  it("defaults to 1 column", () => {
    const { container } = render(KeyValue, { props: { items: basicItems } });
    const kv = container.querySelector(".kv") as HTMLElement;
    expect(kv.style.getPropertyValue("--kv-columns")).toBe("1");
  });

  it("applies 2-column layout", () => {
    const { container } = render(KeyValue, { props: { items: basicItems, columns: 2 } });
    const kv = container.querySelector(".kv") as HTMLElement;
    expect(kv.style.getPropertyValue("--kv-columns")).toBe("2");
  });

  it("applies variant color to values", () => {
    const items = [
      { key: "Fire Res", value: "75%", variant: "positive" as const },
      { key: "Poison Res", value: "-12%", variant: "negative" as const },
    ];
    const { container } = render(KeyValue, { props: { items } });
    const values = container.querySelectorAll(".value");
    expect((values[0] as HTMLElement).style.color).toBe("var(--color-positive)");
    expect((values[1] as HTMLElement).style.color).toBe("var(--color-negative)");
  });

  it("uses default text color when no variant specified", () => {
    const { container } = render(KeyValue, { props: { items: basicItems } });
    const value = container.querySelector(".value") as HTMLElement;
    expect(value.style.color).toBe("var(--color-text)");
  });

  it("handles empty items array", () => {
    const { container } = render(KeyValue, { props: { items: [] } });
    expect(container.querySelectorAll(".pair")).toHaveLength(0);
  });
});
