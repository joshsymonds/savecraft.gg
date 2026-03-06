import type { PickerGame } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import GamePickerModal from "./GamePickerModal.svelte";

function makeCatalog(): PickerGame[] {
  return [
    {
      gameId: "d2r",
      name: "Diablo II: Resurrected",
      description: "Parses .d2s character saves",
      watched: true,
      saveCount: 3,
    },
    {
      gameId: "sdv",
      name: "Stardew Valley",
      description: "Farm saves and skills",
      watched: false,
      saveCount: 0,
    },
    {
      gameId: "bg3",
      name: "Baldur's Gate 3",
      description: "Party and quest progress",
      watched: false,
      saveCount: 0,
    },
  ];
}

describe("GamePickerModal", () => {
  afterEach(cleanup);

  it("renders all games", () => {
    render(GamePickerModal, { props: { games: makeCatalog() } });
    expect(screen.getByText("Diablo II: Resurrected")).toBeInTheDocument();
    expect(screen.getByText("Stardew Valley")).toBeInTheDocument();
    expect(screen.getByText("Baldur's Gate 3")).toBeInTheDocument();
  });

  it("renders ADD A GAME title", () => {
    render(GamePickerModal, { props: { games: makeCatalog() } });
    expect(screen.getByText("ADD A GAME")).toBeInTheDocument();
  });

  it("filters games by search", async () => {
    render(GamePickerModal, { props: { games: makeCatalog() } });
    const searchInput = screen.getByPlaceholderText("Search games...");
    await userEvent.type(searchInput, "stardew");
    expect(screen.getByText("Stardew Valley")).toBeInTheDocument();
    expect(screen.queryByText("Diablo II: Resurrected")).not.toBeInTheDocument();
    expect(screen.queryByText("Baldur's Gate 3")).not.toBeInTheDocument();
  });

  it("shows empty state when search has no matches", async () => {
    render(GamePickerModal, { props: { games: makeCatalog() } });
    const searchInput = screen.getByPlaceholderText("Search games...");
    await userEvent.type(searchInput, "zzzzz");
    expect(screen.getByText(/No games matching/)).toBeInTheDocument();
  });

  it("calls onselect for watched game click", async () => {
    const onselect = vi.fn();
    render(GamePickerModal, { props: { games: makeCatalog(), onselect } });
    await userEvent.click(screen.getByText("Diablo II: Resurrected"));
    expect(onselect).toHaveBeenCalledOnce();
    expect(onselect.mock.calls[0]![0]!.gameId).toBe("d2r");
  });

  it("does not call onselect for unwatched game click", async () => {
    const onselect = vi.fn();
    render(GamePickerModal, { props: { games: makeCatalog(), onselect } });
    await userEvent.click(screen.getByText("Stardew Valley"));
    expect(onselect).not.toHaveBeenCalled();
  });

  it("calls onclose on close button click", async () => {
    const onclose = vi.fn();
    render(GamePickerModal, { props: { games: makeCatalog(), onclose } });
    await userEvent.click(screen.getByText("✕"));
    expect(onclose).toHaveBeenCalledOnce();
  });

  // -- Source selection step --

  const twoSources = [
    { id: "src-1", name: "Desktop", hostname: "desktop-pc" },
    { id: "src-2", name: "Laptop", hostname: "laptop" },
  ];

  const oneSource = [{ id: "src-1", name: "Desktop", hostname: "desktop-pc" }];

  it("shows source selection when clicking unwatched game with multiple sources", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: twoSources },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    expect(screen.getByText("SELECT SOURCE")).toBeInTheDocument();
    expect(screen.getByText("Desktop")).toBeInTheDocument();
    expect(screen.getByText("Laptop")).toBeInTheDocument();
  });

  it("skips source selection with single source and goes to config form", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: oneSource },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    // Should go straight to config form, not source selection
    expect(screen.queryByText("SELECT SOURCE")).not.toBeInTheDocument();
    expect(screen.getByText(/CONNECT STARDEW VALLEY/)).toBeInTheDocument();
  });

  it("proceeds to config form after selecting a source", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: twoSources },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    await userEvent.click(screen.getByText("Desktop"));
    expect(screen.getByText(/CONNECT STARDEW VALLEY/)).toBeInTheDocument();
  });

  it("passes sourceId to onconfigure callback", async () => {
    const onconfigure = vi.fn().mockResolvedValue(null);
    render(GamePickerModal, {
      props: {
        games: makeCatalog(),
        configurableSources: oneSource,
        onconfigure,
      },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "/saves/stardew");
    await userEvent.click(screen.getByText("Connect Game"));
    expect(onconfigure).toHaveBeenCalledWith("sdv", "/saves/stardew", "src-1");
  });

  it("back from source selection returns to game list", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: twoSources },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    expect(screen.getByText("SELECT SOURCE")).toBeInTheDocument();
    await userEvent.click(screen.getByText("←"));
    expect(screen.getByText("ADD A GAME")).toBeInTheDocument();
  });
});
