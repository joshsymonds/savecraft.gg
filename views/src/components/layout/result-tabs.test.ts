import { cleanup, render, fireEvent } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ResultTabs from "./ResultTabs.svelte";

afterEach(cleanup);

describe("ResultTabs", () => {
  it("renders tab buttons from labels", () => {
    const { container } = render(ResultTabs, {
      props: { tabs: [{ label: "Harlequin Crest" }, { label: "Shako" }] },
    });
    const buttons = container.querySelectorAll(".tab-button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain("Harlequin Crest");
    expect(buttons[1].textContent).toContain("Shako");
  });

  it("marks first tab active by default", () => {
    const { container } = render(ResultTabs, {
      props: { tabs: [{ label: "Tab A" }, { label: "Tab B" }] },
    });
    const buttons = container.querySelectorAll(".tab-button");
    expect(buttons[0].classList.contains("active")).toBe(true);
    expect(buttons[1].classList.contains("active")).toBe(false);
  });

  it("switches active tab on click", async () => {
    const { container } = render(ResultTabs, {
      props: { tabs: [{ label: "Tab A" }, { label: "Tab B" }] },
    });
    const buttons = container.querySelectorAll(".tab-button");
    await fireEvent.click(buttons[1]);
    expect(buttons[0].classList.contains("active")).toBe(false);
    expect(buttons[1].classList.contains("active")).toBe(true);
  });

  it("hides tab bar for single tab", () => {
    const { container } = render(ResultTabs, {
      props: { tabs: [{ label: "Only One" }] },
    });
    expect(container.querySelector(".tab-bar")).toBeNull();
  });

  it("renders tab bar for multiple tabs", () => {
    const { container } = render(ResultTabs, {
      props: { tabs: [{ label: "A" }, { label: "B" }] },
    });
    expect(container.querySelector(".tab-bar")).toBeTruthy();
  });

  it("renders nothing for empty tabs", () => {
    const { container } = render(ResultTabs, {
      props: { tabs: [] },
    });
    expect(container.querySelector(".tab-bar")).toBeNull();
    expect(container.querySelector(".tab-button")).toBeNull();
  });
});
