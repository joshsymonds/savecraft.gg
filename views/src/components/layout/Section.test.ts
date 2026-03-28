import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Section from "./Section.svelte";

afterEach(cleanup);

describe("Section", () => {
  it("renders title", () => {
    const { container } = render(Section, { props: { title: "Equipment" } });
    const title = container.querySelector(".title");
    expect(title).toBeTruthy();
    expect(title!.textContent).toBe("Equipment");
  });

  it("shows count badge when count provided", () => {
    const { container } = render(Section, { props: { title: "Results", count: 47 } });
    const count = container.querySelector(".count");
    expect(count).toBeTruthy();
    expect(count!.textContent).toBe("47");
  });

  it("omits count badge when count not provided", () => {
    const { container } = render(Section, { props: { title: "Results" } });
    expect(container.querySelector(".count")).toBeNull();
  });

  it("shows subtitle when provided", () => {
    const { container } = render(Section, { props: { title: "Draft", subtitle: "Pack 1, Pick 3" } });
    const subtitle = container.querySelector(".subtitle");
    expect(subtitle).toBeTruthy();
    expect(subtitle!.textContent).toBe("Pack 1, Pick 3");
  });

  it("omits subtitle when not provided", () => {
    const { container } = render(Section, { props: { title: "Draft" } });
    expect(container.querySelector(".subtitle")).toBeNull();
  });

  it("renders content slot area", () => {
    const { container } = render(Section, { props: { title: "Test" } });
    expect(container.querySelector(".content")).toBeTruthy();
  });
});
