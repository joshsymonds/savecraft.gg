import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import EmptySourceState from "./EmptySourceState.svelte";

describe("EmptySourceState (#17b — add-a-game-first)", () => {
  afterEach(cleanup);

  it("leads with an Add a game call to action", () => {
    render(EmptySourceState, { props: { onaddgame: vi.fn() } });
    expect(screen.getByRole("button", { name: /add a game/i })).toBeInTheDocument();
  });

  it("calls onaddgame when the call to action is clicked", async () => {
    const onaddgame = vi.fn();
    render(EmptySourceState, { props: { onaddgame } });
    await userEvent.click(screen.getByRole("button", { name: /add a game/i }));
    expect(onaddgame).toHaveBeenCalledOnce();
  });

  it("does not lead with a daemon-install headline or pairing input", () => {
    const { container } = render(EmptySourceState, { props: { onaddgame: vi.fn() } });
    expect(screen.queryByText(/download for windows/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/curl -sSL/)).not.toBeInTheDocument();
    // The 6-digit pairing input is now a per-game leaf, not first-run.
    expect(container.querySelector(".hidden-input")).toBeNull();
  });
});
