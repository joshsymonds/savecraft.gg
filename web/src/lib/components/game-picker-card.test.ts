import type { PickerGame } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import GamePickerCard from "./GamePickerCard.svelte";

function makePickerGame(overrides: Partial<PickerGame> = {}): PickerGame {
  return {
    gameId: "d2r",
    name: "Diablo II: Resurrected",
    description: "Parses .d2s character saves",
    watched: false,
    saveCount: 0,
    ...overrides,
  };
}

describe("GamePickerCard", () => {
  afterEach(cleanup);

  it("renders game name and description", () => {
    render(GamePickerCard, { props: { game: makePickerGame() } });
    expect(screen.getByText("Diablo II: Resurrected")).toBeInTheDocument();
    expect(screen.getByText("Parses .d2s character saves")).toBeInTheDocument();
  });

  it("shows watched badge with save count", () => {
    render(GamePickerCard, { props: { game: makePickerGame({ watched: true, saveCount: 3 }) } });
    expect(screen.getByText(/3 saves/)).toBeInTheDocument();
  });

  it("shows singular save count", () => {
    render(GamePickerCard, { props: { game: makePickerGame({ watched: true, saveCount: 1 }) } });
    expect(screen.getByText(/1 save$/)).toBeInTheDocument();
  });

  it("shows unconfigured badge when not watched", () => {
    render(GamePickerCard, { props: { game: makePickerGame({ watched: false }) } });
    expect(screen.getByText("Not configured")).toBeInTheDocument();
  });

  it("calls onclick when clicked", async () => {
    const onclick = vi.fn();
    render(GamePickerCard, { props: { game: makePickerGame(), onclick } });
    await userEvent.click(screen.getByText("Diablo II: Resurrected"));
    expect(onclick).toHaveBeenCalledOnce();
  });

  it("renders first letter as icon", () => {
    render(GamePickerCard, { props: { game: makePickerGame() } });
    expect(screen.getByText("D")).toBeInTheDocument();
  });
});
