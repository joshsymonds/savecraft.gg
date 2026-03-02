import type { DeviceGame } from "$lib/types/device";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import GameCard from "./GameCard.svelte";

function makeGame(overrides: Partial<DeviceGame> = {}): DeviceGame {
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
          { saveUuid: "1", saveName: "Atmus", summary: "Level 74 Warlock", lastUpdated: "now" },
          { saveUuid: "2", saveName: "Bowazon", summary: "Level 89 Amazon", lastUpdated: "now" },
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

    it("applies detected styling", () => {
      const game = makeGame({ status: "detected", statusLine: "Detected" });
      const { container } = render(GameCard, { props: { game } });
      expect(container.querySelector(".detected")).not.toBeNull();
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

  describe("not_found state", () => {
    it("renders dimmed", () => {
      const game = makeGame({ status: "not_found", statusLine: "Not installed" });
      const { container } = render(GameCard, { props: { game } });
      expect(container.querySelector(".dimmed")).not.toBeNull();
    });

    it("does not show ACTIVATE button", () => {
      const game = makeGame({ status: "not_found", statusLine: "Not installed" });
      render(GameCard, { props: { game } });
      expect(screen.queryByText("ACTIVATE")).not.toBeInTheDocument();
    });
  });
});
