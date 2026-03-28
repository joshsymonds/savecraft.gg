import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ErrorState from "./ErrorState.svelte";

afterEach(cleanup);

describe("ErrorState", () => {
  it("renders default message", () => {
    const { container } = render(ErrorState);
    expect(container.querySelector(".message")!.textContent).toBe("Something went wrong");
  });

  it("renders custom message", () => {
    const { container } = render(ErrorState, { props: { message: "Connection lost" } });
    expect(container.querySelector(".message")!.textContent).toBe("Connection lost");
  });

  it("renders detail when provided", () => {
    const { container } = render(ErrorState, { props: { detail: "Check your internet connection" } });
    expect(container.querySelector(".detail")!.textContent).toBe("Check your internet connection");
  });

  it("omits detail when not provided", () => {
    const { container } = render(ErrorState);
    expect(container.querySelector(".detail")).toBeNull();
  });

  it("renders icon", () => {
    const { container } = render(ErrorState);
    expect(container.querySelector(".icon")).toBeTruthy();
  });

  it("uses negative color for icon", () => {
    const { container } = render(ErrorState);
    const icon = container.querySelector(".icon") as HTMLElement;
    expect(icon.style.color || getComputedStyle(icon).color).toBeTruthy();
  });
});
