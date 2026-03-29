import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import MultiResultView from "./MultiResultView.svelte";
// Use Panel as a real component stub — it accepts any props silently
import Panel from "./Panel.svelte";

afterEach(cleanup);

describe("MultiResultView", () => {
  it("derives tab labels from result titles", () => {
    const { container } = render(MultiResultView, {
      props: {
        component: Panel,
        results: [
          { title: "Harlequin Crest", mode: "item" },
          { title: "Shako", mode: "item" },
        ],
        moduleId: "drop_calc",
        app: {},
      },
    });
    const buttons = container.querySelectorAll(".tab-button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain("Harlequin Crest");
    expect(buttons[1].textContent).toContain("Shako");
  });

  it("falls back to 'Result N' when title is missing", () => {
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

  it("falls back to 'Result N' when title is non-string", () => {
    const { container } = render(MultiResultView, {
      props: {
        component: Panel,
        results: [{ title: 42, mode: "item" }, { title: null, mode: "item" }],
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
        results: [{ title: "Only One", mode: "item" }],
        moduleId: "drop_calc",
        app: {},
      },
    });
    expect(container.querySelector(".tab-bar")).toBeNull();
  });
});
