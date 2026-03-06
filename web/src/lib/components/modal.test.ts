import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import Modal from "./Modal.svelte";

describe("Modal", () => {
  afterEach(cleanup);

  it("renders children inside a dialog", () => {
    render(Modal, {
      props: {
        id: "test",
        onclose: vi.fn(),
        children: makeSnippet("Hello modal"),
      },
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Hello modal")).toBeInTheDocument();
  });

  it("calls onclose when backdrop is clicked", async () => {
    const onclose = vi.fn();
    render(Modal, {
      props: {
        id: "test-backdrop",
        onclose,
        children: makeSnippet("Content"),
      },
    });
    // Click the backdrop div directly (the dialog role element)
    await userEvent.click(screen.getByRole("dialog"));
    expect(onclose).toHaveBeenCalledOnce();
  });

  it("does not call onclose when content is clicked", async () => {
    const onclose = vi.fn();
    render(Modal, {
      props: {
        id: "test-no-close",
        onclose,
        children: makeSnippet("Inner content"),
      },
    });
    await userEvent.click(screen.getByText("Inner content"));
    expect(onclose).not.toHaveBeenCalled();
  });

  it("calls onclose when Escape is pressed", async () => {
    const onclose = vi.fn();
    render(Modal, {
      props: {
        id: "test-esc",
        onclose,
        children: makeSnippet("Esc test"),
      },
    });
    await fireEvent.keyDown(globalThis.window, { key: "Escape" });
    expect(onclose).toHaveBeenCalledOnce();
  });

  it("ESC closes topmost modal in a stack, leaving the one below open", async () => {
    const oncloseFirst = vi.fn();
    const oncloseSecond = vi.fn();
    render(Modal, {
      props: {
        id: "stack-first",
        onclose: oncloseFirst,
        children: makeSnippet("First"),
      },
    });
    render(Modal, {
      props: {
        id: "stack-second",
        onclose: oncloseSecond,
        children: makeSnippet("Second"),
      },
    });

    // First ESC closes topmost (second) modal only
    await fireEvent.keyDown(globalThis.window, { key: "Escape" });
    expect(oncloseSecond).toHaveBeenCalledOnce();
    expect(oncloseFirst).not.toHaveBeenCalled();
  });
});

function makeSnippet(text: string) {
  return createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));
}
