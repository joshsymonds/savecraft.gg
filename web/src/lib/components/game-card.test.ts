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

    it("does not show ACTIVATE button", () => {
      render(GameCard, { props: { game: makeGame() } });
      expect(screen.queryByText("ACTIVATE")).not.toBeInTheDocument();
    });

    it("does not apply dimmed styling", () => {
      const { container } = render(GameCard, { props: { game: makeGame() } });
      expect(container.querySelector(".detected")).toBeNull();
    });
  });

  describe("detected state", () => {
    it("renders game name and status", () => {
      const game = makeGame({ status: "detected", statusLine: "Detected" });
      render(GameCard, { props: { game } });
      expect(screen.getByText("Diablo II: Resurrected")).toBeInTheDocument();
      expect(screen.getByText("Detected")).toBeInTheDocument();
    });

    it("shows ACTIVATE button when onactivate provided", () => {
      const game = makeGame({ status: "detected", statusLine: "Detected" });
      render(GameCard, { props: { game, onactivate: vi.fn() } });
      expect(screen.getByText("ACTIVATE")).toBeInTheDocument();
    });

    it("calls onactivate when ACTIVATE clicked", async () => {
      const onactivate = vi.fn();
      const game = makeGame({ status: "detected", statusLine: "Detected" });
      render(GameCard, { props: { game, onactivate } });
      await userEvent.click(screen.getByText("ACTIVATE"));
      expect(onactivate).toHaveBeenCalledWith("d2r");
    });

    it("does not show ACTIVATE button when onactivate not provided", () => {
      const game = makeGame({ status: "detected", statusLine: "Detected" });
      render(GameCard, { props: { game } });
      expect(screen.queryByText("ACTIVATE")).not.toBeInTheDocument();
    });

    it("applies detected styling", () => {
      const game = makeGame({ status: "detected", statusLine: "Detected" });
      const { container } = render(GameCard, { props: { game } });
      expect(container.querySelector(".detected")).not.toBeNull();
    });
  });

  describe("activate states", () => {
    it("shows ACTIVATING... and disables button when activating", () => {
      const game = makeGame({ status: "detected", statusLine: "Detected" });
      render(GameCard, { props: { game, onactivate: vi.fn(), activateState: "activating" } });
      expect(screen.getByText("ACTIVATING...")).toBeInTheDocument();
      expect(screen.queryByText("ACTIVATE")).not.toBeInTheDocument();
    });

    it("shows FAILED when activation fails", () => {
      const game = makeGame({ status: "detected", statusLine: "Detected" });
      render(GameCard, { props: { game, onactivate: vi.fn(), activateState: "failed" } });
      expect(screen.getByText("FAILED")).toBeInTheDocument();
      expect(screen.queryByText("ACTIVATE")).not.toBeInTheDocument();
    });

    it("disables button during activating state", async () => {
      const onactivate = vi.fn();
      const game = makeGame({ status: "detected", statusLine: "Detected" });
      render(GameCard, { props: { game, onactivate, activateState: "activating" } });
      await userEvent.click(screen.getByText("ACTIVATING..."));
      expect(onactivate).not.toHaveBeenCalled();
    });

    it("shows fail reason when activation fails with a reason", () => {
      const game = makeGame({ status: "detected", statusLine: "Detected" });
      render(GameCard, {
        props: { game, onactivate: vi.fn(), activateState: "failed", failReason: "network error" },
      });
      expect(screen.getByText("FAILED")).toBeInTheDocument();
      expect(screen.getByText("network error")).toBeInTheDocument();
    });

    it("does not show fail reason when activateState is not failed", () => {
      const game = makeGame({ status: "detected", statusLine: "Detected" });
      render(GameCard, {
        props: { game, onactivate: vi.fn(), activateState: "idle", failReason: "stale reason" },
      });
      expect(screen.queryByText("stale reason")).not.toBeInTheDocument();
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

    it("does not call onclick when detected card is clicked", async () => {
      const onclick = vi.fn();
      const game = makeGame({ status: "detected", statusLine: "Detected" });
      render(GameCard, { props: { game, onclick } });
      await userEvent.click(screen.getByText("Diablo II: Resurrected"));
      expect(onclick).not.toHaveBeenCalled();
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

    it("does not show ACTIVATE button", () => {
      const game = makeGame({ status: "error", statusLine: "Parse error" });
      render(GameCard, { props: { game } });
      expect(screen.queryByText("ACTIVATE")).not.toBeInTheDocument();
    });
  });
});
