import type { Game } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import GameCard from "./GameCard.svelte";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    gameId: "d2r",
    name: "Diablo II: Resurrected",
    statusLine: "3 saves",
    saves: [],
    sourceCount: 1,
    ...overrides,
  };
}

describe("GameCard", () => {
  afterEach(cleanup);

  it("renders game name and status line", () => {
    render(GameCard, { props: { game: makeGame() } });
    expect(screen.getByText("Diablo II: Resurrected")).toBeInTheDocument();
    expect(screen.getByText("3 saves")).toBeInTheDocument();
  });

  it("renders save names when present", () => {
    const game = makeGame({
      saves: [
        {
          saveUuid: "1",
          saveName: "Atmus",
          summary: "Level 74 Warlock",
          lastUpdated: "now",
          status: "success" as const,
          sourceId: "src-1",
          sourceName: "STEAM-DECK",
        },
        {
          saveUuid: "2",
          saveName: "Bowazon",
          summary: "Level 89 Amazon",
          lastUpdated: "now",
          status: "success" as const,
          sourceId: "src-1",
          sourceName: "STEAM-DECK",
        },
      ],
    });
    render(GameCard, { props: { game } });
    expect(screen.getByText("Atmus")).toBeInTheDocument();
    expect(screen.getByText("Bowazon")).toBeInTheDocument();
  });

  it("renders first letter as icon", () => {
    render(GameCard, { props: { game: makeGame() } });
    expect(screen.getByText("D")).toBeInTheDocument();
  });

  describe("onclick behavior", () => {
    it("calls onclick when card is clicked", async () => {
      const onclick = vi.fn();
      render(GameCard, { props: { game: makeGame(), onclick } });
      await userEvent.click(screen.getByText("Diablo II: Resurrected"));
      expect(onclick).toHaveBeenCalledOnce();
    });

    it("triggers onclick on Enter key", async () => {
      const onclick = vi.fn();
      const { container } = render(GameCard, { props: { game: makeGame(), onclick } });
      const card = container.querySelector("[role='button']")!;
      (card as HTMLElement).focus();
      await userEvent.keyboard("{Enter}");
      expect(onclick).toHaveBeenCalledOnce();
    });

    it("triggers onclick on Space key", async () => {
      const onclick = vi.fn();
      const { container } = render(GameCard, { props: { game: makeGame(), onclick } });
      const card = container.querySelector("[role='button']")!;
      (card as HTMLElement).focus();
      await userEvent.keyboard(" ");
      expect(onclick).toHaveBeenCalledOnce();
    });

    it("has role=button and tabindex=0 when onclick provided", () => {
      const { container } = render(GameCard, {
        props: { game: makeGame(), onclick: vi.fn() },
      });
      const card = container.querySelector(".game-card")!;
      expect(card.getAttribute("role")).toBe("button");
      expect(card.getAttribute("tabindex")).toBe("0");
    });

    it("has no role or tabindex when onclick not provided", () => {
      const { container } = render(GameCard, { props: { game: makeGame() } });
      const card = container.querySelector(".game-card")!;
      expect(card.getAttribute("role")).toBeNull();
      expect(card.getAttribute("tabindex")).toBeNull();
    });
  });
});
