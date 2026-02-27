import { render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import TinyButton from "./TinyButton.svelte";

describe("TinyButton", () => {
  it("renders the label", () => {
    render(TinyButton, { props: { label: "RESCAN" } });
    expect(screen.getByText("RESCAN")).toBeInTheDocument();
  });

  it("calls onclick handler when clicked", async () => {
    const handler = vi.fn();
    render(TinyButton, { props: { label: "CONFIG", onclick: handler } });

    await userEvent.click(screen.getByText("CONFIG"));
    expect(handler).toHaveBeenCalledOnce();
  });
});
