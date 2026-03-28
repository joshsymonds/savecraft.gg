import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Divider from "./Divider.svelte";

afterEach(cleanup);

describe("Divider", () => {
  it("renders divider element", () => {
    const { container } = render(Divider);
    expect(container.querySelector(".divider")).toBeTruthy();
  });

  it("renders diamond decoration by default", () => {
    const { container } = render(Divider);
    expect(container.querySelector(".decoration")).toBeTruthy();
    expect(container.querySelector(".decoration")!.textContent).toBe("◆");
  });

  it("renders cross decoration", () => {
    const { container } = render(Divider, { props: { decoration: "cross" } });
    expect(container.querySelector(".decoration")!.textContent).toBe("✦");
  });

  it("renders no decoration when none specified", () => {
    const { container } = render(Divider, { props: { decoration: "none" } });
    expect(container.querySelector(".decoration")).toBeNull();
  });

  it("defaults to horizontal direction", () => {
    const { container } = render(Divider);
    const divider = container.querySelector(".divider") as HTMLElement;
    expect(divider.classList.contains("vertical")).toBe(false);
  });

  it("supports vertical direction", () => {
    const { container } = render(Divider, { props: { direction: "vertical" } });
    const divider = container.querySelector(".divider") as HTMLElement;
    expect(divider.classList.contains("vertical")).toBe(true);
  });
});
