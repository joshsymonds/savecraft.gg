import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import EmptyState from "./EmptyState.svelte";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renders default message", () => {
    const { container } = render(EmptyState);
    expect(container.querySelector(".message")!.textContent).toBe("No results found");
  });

  it("renders custom message", () => {
    const { container } = render(EmptyState, { props: { message: "No cards match" } });
    expect(container.querySelector(".message")!.textContent).toBe("No cards match");
  });

  it("renders detail when provided", () => {
    const { container } = render(EmptyState, { props: { detail: "Try broadening your search" } });
    expect(container.querySelector(".detail")!.textContent).toBe("Try broadening your search");
  });

  it("omits detail when not provided", () => {
    const { container } = render(EmptyState);
    expect(container.querySelector(".detail")).toBeNull();
  });

  it("renders icon", () => {
    const { container } = render(EmptyState);
    expect(container.querySelector(".icon")).toBeTruthy();
  });
});
