import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import MultiResultView from "./MultiResultView.svelte";
// Use Panel as a real component stub — it accepts any props silently
import Panel from "./Panel.svelte";

afterEach(cleanup);

describe("MultiResultView", () => {
  it("derives tab labels from result labels", () => {
    const { container } = render(MultiResultView, {
      props: {
        component: Panel,
        results: [
          { label: "Spring Year 1", mode: "item" },
          { label: "Summer Year 2", mode: "item" },
        ],
        moduleId: "crop_planner",
        app: {},
      },
    });
    const buttons = container.querySelectorAll(".tab-button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain("Spring Year 1");
    expect(buttons[1].textContent).toContain("Summer Year 2");
  });

  it("falls back to 'Result N' when label is missing", () => {
    const { container } = render(MultiResultView, {
      props: {
        component: Panel,
        results: [{ mode: "item" }, { mode: "item" }],
        moduleId: "drop_calc",
        app: {},
      },
    });
    const buttons = container.querySelectorAll(".tab-button");
    expect(buttons[0].textContent).toContain("Result 1");
    expect(buttons[1].textContent).toContain("Result 2");
  });

  it("falls back to 'Result N' when label is non-string", () => {
    const { container } = render(MultiResultView, {
      props: {
        component: Panel,
        results: [
          { label: 42, mode: "item" },
          { label: null, mode: "item" },
        ],
        moduleId: "drop_calc",
        app: {},
      },
    });
    const buttons = container.querySelectorAll(".tab-button");
    expect(buttons[0].textContent).toContain("Result 1");
    expect(buttons[1].textContent).toContain("Result 2");
  });

  it("hides tab bar for single result", () => {
    const { container } = render(MultiResultView, {
      props: {
        component: Panel,
        results: [{ label: "Only One", mode: "item" }],
        moduleId: "drop_calc",
        app: {},
      },
    });
    expect(container.querySelector(".tab-bar")).toBeNull();
  });
});
