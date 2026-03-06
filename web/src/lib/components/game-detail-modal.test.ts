import type { Game } from "$lib/types/source";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import GameDetailModal from "./GameDetailModal.svelte";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    gameId: "d2r",
    name: "Diablo II: Resurrected",
    statusLine: "2 saves",
    sourceCount: 1,
    saves: [
      {
        saveUuid: "s1",
        saveName: "Hammerdin",
        summary: "Paladin · Level 89",
        lastUpdated: "2m ago",
        status: "success",
        sourceId: "src-1",
        sourceName: "STEAM-DECK",
      },
      {
        saveUuid: "s2",
        saveName: "BlizzSorc",
        summary: "Sorceress · Level 76",
        lastUpdated: "1d ago",
        status: "success",
        sourceId: "src-1",
        sourceName: "STEAM-DECK",
      },
    ],
    ...overrides,
  };
}

describe("GameDetailModal", () => {
  afterEach(cleanup);

  it("renders save names from the game", () => {
    render(GameDetailModal, {
      props: {
        game: makeGame(),
        onclose: vi.fn(),
        onsaveclick: vi.fn(),
      },
    });
    expect(screen.getByText("Hammerdin")).toBeInTheDocument();
    expect(screen.getByText("BlizzSorc")).toBeInTheDocument();
  });

  it("shows empty state when game has no saves", () => {
    render(GameDetailModal, {
      props: {
        game: makeGame({ saves: [] }),
        onclose: vi.fn(),
        onsaveclick: vi.fn(),
      },
    });
    expect(screen.getByText("No saves detected")).toBeInTheDocument();
  });

  it("calls onsaveclick when a save row is clicked", async () => {
    const onsaveclick = vi.fn();
    const game = makeGame();
    render(GameDetailModal, {
      props: { game, onclose: vi.fn(), onsaveclick },
    });
    await userEvent.click(screen.getByText("Hammerdin"));
    expect(onsaveclick).toHaveBeenCalledExactlyOnceWith(game.saves[0]);
  });

  it("shows remove confirmation when REMOVE GAME is clicked", async () => {
    render(GameDetailModal, {
      props: {
        game: makeGame(),
        onclose: vi.fn(),
        onsaveclick: vi.fn(),
        onremovegame: vi.fn(),
      },
    });
    await userEvent.click(screen.getByText("REMOVE GAME"));
    expect(screen.getByPlaceholderText("Diablo II: Resurrected")).toBeInTheDocument();
    expect(screen.getByText("CANCEL")).toBeInTheDocument();
  });

  it("ESC cancels remove confirmation instead of closing modal", async () => {
    const onclose = vi.fn();
    render(GameDetailModal, {
      props: {
        game: makeGame(),
        onclose,
        onsaveclick: vi.fn(),
        onremovegame: vi.fn(),
      },
    });
    // Enter remove confirmation
    await userEvent.click(screen.getByText("REMOVE GAME"));
    expect(screen.getByText("CANCEL")).toBeInTheDocument();

    // ESC should cancel confirmation, not close modal
    await fireEvent.keyDown(globalThis.window, { key: "Escape" });
    expect(screen.queryByText("CANCEL")).not.toBeInTheDocument();
    // Modal is still open (onclose was NOT called to actually close)
    expect(screen.getByText("Hammerdin")).toBeInTheDocument();
  });

  it("enables remove button only when name matches", async () => {
    const onremovegame = vi.fn().mockResolvedValue(null);
    render(GameDetailModal, {
      props: {
        game: makeGame(),
        onclose: vi.fn(),
        onsaveclick: vi.fn(),
        onremovegame,
      },
    });
    await userEvent.click(screen.getByText("REMOVE GAME"));

    // The confirmation REMOVE GAME button should be disabled
    const removeButtons = screen.getAllByText("REMOVE GAME");
    const confirmButton = removeButtons.find((button) =>
      button.classList.contains("modal-btn-danger"),
    )!;
    expect(confirmButton).toBeDisabled();

    // Type the game name
    await userEvent.type(
      screen.getByPlaceholderText("Diablo II: Resurrected"),
      "Diablo II: Resurrected",
    );
    expect(confirmButton).toBeEnabled();
  });

  it("shows error message when onremovegame rejects", async () => {
    const onremovegame = vi.fn().mockRejectedValue(new Error("Network error"));
    const onclose = vi.fn();
    render(GameDetailModal, {
      props: {
        game: makeGame(),
        onclose,
        onsaveclick: vi.fn(),
        onremovegame,
      },
    });

    // Enter confirm mode and type the game name
    await userEvent.click(screen.getByText("REMOVE GAME"));
    await userEvent.type(
      screen.getByPlaceholderText("Diablo II: Resurrected"),
      "Diablo II: Resurrected",
    );

    // Click the confirm REMOVE GAME button
    const removeButtons = screen.getAllByText("REMOVE GAME");
    const confirmButton = removeButtons.find((button) =>
      button.classList.contains("modal-btn-danger"),
    )!;
    await userEvent.click(confirmButton);

    // Error should be displayed, modal should NOT close
    expect(await screen.findByText("Network error")).toBeInTheDocument();
    expect(onclose).not.toHaveBeenCalled();
  });
});
