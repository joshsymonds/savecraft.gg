import type { SourceGame } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import GameCard from "./GameCard.svelte";

function makeGame(overrides: Partial<SourceGame> = {}): SourceGame {
  return {
    gameId: "d2r",
    name: "Diablo II: Resurrected",
    status: "watching",
    statusLine: "Watching 3 saves",
    saves: [],
    ...overrides,
  };
}

describe("GameCard", () => {
  afterEach(cleanup);

  describe("watching state", () => {
    it("renders game name and status line", () => {
      render(GameCard, { props: { game: makeGame() } });
      expect(screen.getByText("Diablo II: Resurrected")).toBeInTheDocument();
      expect(screen.getByText("Watching 3 saves")).toBeInTheDocument();
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
          },
          {
            saveUuid: "2",
            saveName: "Bowazon",
            summary: "Level 89 Amazon",
            lastUpdated: "now",
            status: "success" as const,
          },
        ],
      });
      render(GameCard, { props: { game } });
      expect(screen.getByText("Atmus")).toBeInTheDocument();
      expect(screen.getByText("Bowazon")).toBeInTheDocument();
    });

    it("does not apply dimmed styling", () => {
      const { container } = render(GameCard, { props: { game: makeGame() } });
      expect(container.querySelector(".not-found")).toBeNull();
    });
  });

  describe("onclick behavior", () => {
    it("calls onclick when watching card is clicked", async () => {
      const onclick = vi.fn();
      const game = makeGame({ status: "watching" });
      render(GameCard, { props: { game, onclick } });
      await userEvent.click(screen.getByText("Diablo II: Resurrected"));
      expect(onclick).toHaveBeenCalledOnce();
    });

    it("calls onclick when error card is clicked", async () => {
      const onclick = vi.fn();
      const game = makeGame({ status: "error", statusLine: "Parse error" });
      render(GameCard, { props: { game, onclick } });
      await userEvent.click(screen.getByText("Diablo II: Resurrected"));
      expect(onclick).toHaveBeenCalledOnce();
    });

    it("does not call onclick when not_found card is clicked", async () => {
      const onclick = vi.fn();
      const game = makeGame({ status: "not_found", statusLine: "not installed" });
      render(GameCard, { props: { game, onclick } });
      await userEvent.click(screen.getByText("Diablo II: Resurrected"));
      expect(onclick).not.toHaveBeenCalled();
    });

    it("triggers onclick on Enter key", async () => {
      const onclick = vi.fn();
      const game = makeGame({ status: "watching" });
      const { container } = render(GameCard, { props: { game, onclick } });
      const card = container.querySelector("[role='button']")!;
      (card as HTMLElement).focus();
      await userEvent.keyboard("{Enter}");
      expect(onclick).toHaveBeenCalledOnce();
    });

    it("triggers onclick on Space key", async () => {
      const onclick = vi.fn();
      const game = makeGame({ status: "watching" });
      const { container } = render(GameCard, { props: { game, onclick } });
      const card = container.querySelector("[role='button']")!;
      (card as HTMLElement).focus();
      await userEvent.keyboard(" ");
      expect(onclick).toHaveBeenCalledOnce();
    });

    it("has role=button and tabindex=0 when clickable", () => {
      const game = makeGame({ status: "watching" });
      const { container } = render(GameCard, { props: { game, onclick: vi.fn() } });
      const card = container.querySelector(".game-card")!;
      expect(card.getAttribute("role")).toBe("button");
      expect(card.getAttribute("tabindex")).toBe("0");
    });

    it("has no role or tabindex when not clickable", () => {
      const game = makeGame({ status: "watching" });
      const { container } = render(GameCard, { props: { game } });
      const card = container.querySelector(".game-card")!;
      expect(card.getAttribute("role")).toBeNull();
      expect(card.getAttribute("tabindex")).toBeNull();
    });
  });

  describe("error state", () => {
    it("renders error status", () => {
      const game = makeGame({ status: "error", statusLine: "Parse error" });
      render(GameCard, { props: { game } });
      expect(screen.getByText("Parse error")).toBeInTheDocument();
    });
  });
});
