import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import SourceChip from "./SourceChip.svelte";

describe("SourceChip", () => {
  afterEach(cleanup);

  it("renders name", () => {
    render(SourceChip, { props: { name: "STEAM-DECK", status: "online", lastSeen: "now" } });
    expect(screen.getByText("STEAM-DECK")).toBeInTheDocument();
  });

  it("shows lastSeen when offline", () => {
    render(SourceChip, { props: { name: "PC", status: "offline", lastSeen: "2h ago" } });
    expect(screen.getByText("2h ago")).toBeInTheDocument();
  });

  it("hides lastSeen when online", () => {
    render(SourceChip, { props: { name: "PC", status: "online", lastSeen: "now" } });
    expect(screen.queryByText("now")).not.toBeInTheDocument();
  });

  it("calls onclick when clicked", async () => {
    const onclick = vi.fn();
    render(SourceChip, { props: { name: "PC", status: "online", lastSeen: "now", onclick } });
    await userEvent.click(screen.getByText("PC"));
    expect(onclick).toHaveBeenCalledOnce();
  });

  it("applies offline class when status is offline", () => {
    const { container } = render(SourceChip, {
      props: { name: "PC", status: "offline", lastSeen: "2h ago" },
    });
    expect(container.querySelector(".offline")).not.toBeNull();
  });

  it("applies error class when status is error", () => {
    const { container } = render(SourceChip, {
      props: { name: "PC", status: "error", lastSeen: "now" },
    });
    expect(container.querySelector(".error")).not.toBeNull();
  });
});
