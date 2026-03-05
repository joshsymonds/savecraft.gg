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

  describe("games grid", () => {
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
  });

  describe("saves list navigation", () => {
    it("shows saves when game is clicked", async () => {
      render(GamePanel, { props: { games: makeGames() } });
      await userEvent.click(screen.getByText("Diablo II: Resurrected"));
      expect(screen.getByText("Hammerdin")).toBeInTheDocument();
      expect(screen.getByText("BlizzSorc")).toBeInTheDocument();
    });

    it("shows game name in breadcrumb", async () => {
      render(GamePanel, { props: { games: makeGames() } });
      await userEvent.click(screen.getByText("Diablo II: Resurrected"));
      expect(screen.getByText("Diablo II: Resurrected")).toBeInTheDocument();
    });

    it("navigates back to games grid via GAMES breadcrumb", async () => {
      render(GamePanel, { props: { games: makeGames() } });
      await userEvent.click(screen.getByText("Diablo II: Resurrected"));
      // In saves list — save rows visible
      expect(screen.getByText("Paladin · Level 89")).toBeInTheDocument();
      await userEvent.click(screen.getByText("GAMES"));
      // Back in games grid — save summaries not visible, but game cards are
      expect(screen.getByText("Stardew Valley")).toBeInTheDocument();
      expect(screen.queryByText("Paladin · Level 89")).not.toBeInTheDocument();
    });

    it("shows source badges when showSourceBadges is true and sourceCount > 1", async () => {
      const games = makeGames();
      games[0]!.sourceCount = 2;
      render(GamePanel, { props: { games, showSourceBadges: true } });
      await userEvent.click(screen.getByText("Diablo II: Resurrected"));
      const badges = screen.getAllByText("STEAM-DECK");
      expect(badges.length).toBe(2);
    });

    it("shows empty message when game has no saves", async () => {
      const games: Game[] = [
        {
          gameId: "empty",
          name: "Empty Game",
          statusLine: "No saves",
          sourceCount: 1,
          saves: [],
        },
      ];
      render(GamePanel, { props: { games } });
      await userEvent.click(screen.getByText("Empty Game"));
      expect(screen.getByText("No saves detected")).toBeInTheDocument();
    });
  });

  describe("pre-navigation via initialGameId", () => {
    it("starts at saves list when initialGameId is provided", () => {
      render(GamePanel, { props: { games: makeGames(), initialGameId: "d2r" } });
      expect(screen.getByText("Hammerdin")).toBeInTheDocument();
      expect(screen.getByText("BlizzSorc")).toBeInTheDocument();
    });
  });
});
