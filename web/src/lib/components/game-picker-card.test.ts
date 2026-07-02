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
    methods: ["daemon"],
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

  it("badges an unwatched game by its connection method (#17)", () => {
    const cases: { methods: PickerGame["methods"]; badge: string }[] = [
      { methods: ["daemon"], badge: "Set up" },
      { methods: ["adapter"], badge: "Connect account" },
      { methods: ["mod"], badge: "Install mod" },
      { methods: ["reference"], badge: "Ready" },
      // hybrid: priority adapter > mod > daemon > reference
      { methods: ["daemon", "mod"], badge: "Install mod" },
    ];
    for (const { methods, badge } of cases) {
      const { unmount } = render(GamePickerCard, {
        props: { game: makePickerGame({ watched: false, methods }) },
      });
      expect(screen.getByText(badge, { exact: false })).toBeInTheDocument();
      unmount();
    }
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

  it("hints that the connect covers a sibling game sharing the same OAuth provider", () => {
    render(GamePickerCard, {
      props: {
        game: makePickerGame({
          gameId: "poe2",
          name: "Path of Exile 2",
          methods: ["adapter"],
          adapter: { authProvider: "ggg", regions: ["poe2"] },
          sharedConnectGames: ["Path of Exile"],
        }),
      },
    });
    expect(screen.getByText(/also connects Path of Exile/i)).toBeInTheDocument();
  });

  it("shows no shared-connect hint for an adapter game with no sibling on its provider", () => {
    render(GamePickerCard, {
      props: {
        game: makePickerGame({
          gameId: "wow",
          name: "World of Warcraft",
          methods: ["adapter"],
          adapter: { authProvider: "battlenet", regions: ["us"] },
        }),
      },
    });
    expect(screen.queryByText(/also connects/i)).not.toBeInTheDocument();
  });

  it("hides the shared-connect hint once the game is already watched", () => {
    render(GamePickerCard, {
      props: {
        game: makePickerGame({
          gameId: "poe2",
          name: "Path of Exile 2",
          methods: ["adapter"],
          watched: true,
          adapter: { authProvider: "ggg", regions: ["poe2"] },
          sharedConnectGames: ["Path of Exile"],
        }),
      },
    });
    expect(screen.queryByText(/also connects/i)).not.toBeInTheDocument();
  });
});
