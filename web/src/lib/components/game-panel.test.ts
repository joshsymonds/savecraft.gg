import type { Game } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import GamePanel from "./GamePanel.svelte";

function makeGames(): Game[] {
  return [
    {
      gameId: "d2r",
      name: "Diablo II: Resurrected",
      statusLine: "2 saves",
      sourceCount: 1,
      sources: [],
      needsConfig: false,
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
    },
    {
      gameId: "sdv",
      name: "Stardew Valley",
      statusLine: "1 save",
      sourceCount: 1,
      sources: [],
      needsConfig: false,
      saves: [
        {
          saveUuid: "s3",
          saveName: "Sunrise Farm",
          summary: "Year 3 · Fall",
          lastUpdated: "4h ago",
          status: "success",
          sourceId: "src-1",
          sourceName: "STEAM-DECK",
        },
      ],
    },
  ];
}

describe("GamePanel", () => {
  afterEach(cleanup);

  it("renders game names", () => {
    render(GamePanel, { props: { games: makeGames() } });
    expect(screen.getByText("Diablo II: Resurrected")).toBeInTheDocument();
    expect(screen.getByText("Stardew Valley")).toBeInTheDocument();
  });

  it("renders GAMES title", () => {
    render(GamePanel, { props: { games: makeGames() } });
    expect(screen.getByText("GAMES")).toBeInTheDocument();
  });

  it("renders Add a game button", () => {
    render(GamePanel, { props: { games: makeGames() } });
    expect(screen.getByText("Add a game")).toBeInTheDocument();
  });

  it("calls onadd when Add a game is clicked", async () => {
    const onadd = vi.fn();
    render(GamePanel, { props: { games: makeGames(), onadd } });
    await userEvent.click(screen.getByText("Add a game"));
    expect(onadd).toHaveBeenCalledOnce();
  });

  it("shows empty grid with only add button when no games", () => {
    render(GamePanel, { props: { games: [] } });
    expect(screen.getByText("Add a game")).toBeInTheDocument();
  });

  it("calls ongameclick when a game card is clicked", async () => {
    const ongameclick = vi.fn();
    const games = makeGames();
    render(GamePanel, { props: { games, ongameclick } });
    await userEvent.click(screen.getByText("Diablo II: Resurrected"));
    expect(ongameclick).toHaveBeenCalledExactlyOnceWith(games[0]);
  });
});
