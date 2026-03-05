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
});
