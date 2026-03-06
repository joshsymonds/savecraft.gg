import type { AvailableSource, GameSourceEntry } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import GameConfigModal from "./GameConfigModal.svelte";

function makeSource(overrides: Partial<GameSourceEntry> = {}): GameSourceEntry {
  return {
    sourceId: "src-1",
    sourceName: "STEAM-DECK",
    hostname: "steamdeck",
    status: "watching",
    saveCount: 3,
    ...overrides,
  };
}

function makeAvailableSource(overrides: Partial<AvailableSource> = {}): AvailableSource {
  return {
    id: "avail-1",
    name: "Desktop PC",
    hostname: "desktop-pc",
    ...overrides,
  };
}

describe("GameConfigModal", () => {
  afterEach(cleanup);

  it("renders game name uppercased in title bar", () => {
    render(GameConfigModal, {
      props: {
        gameName: "Diablo II: Resurrected",
        gameId: "d2r",
        sources: [makeSource()],
        onclose: vi.fn(),
      },
    });
    expect(screen.getByText("DIABLO II: RESURRECTED")).toBeInTheDocument();
  });

  it("renders source rows with names and status badges", () => {
    render(GameConfigModal, {
      props: {
        gameName: "Diablo II: Resurrected",
        gameId: "d2r",
        sources: [
          makeSource({ sourceId: "src-1", sourceName: "STEAM-DECK", status: "watching" }),
          makeSource({ sourceId: "src-2", sourceName: "DESKTOP", status: "error" }),
          makeSource({ sourceId: "src-3", sourceName: "LAPTOP", status: "not_found" }),
        ],
        onclose: vi.fn(),
      },
    });
    expect(screen.getByText("STEAM-DECK")).toBeInTheDocument();
    expect(screen.getByText("DESKTOP")).toBeInTheDocument();
    expect(screen.getByText("LAPTOP")).toBeInTheDocument();
    expect(screen.getByText("WATCHING")).toBeInTheDocument();
    expect(screen.getByText("ERROR")).toBeInTheDocument();
    expect(screen.getByText("NOT FOUND")).toBeInTheDocument();
  });

  it("shows path below source row", () => {
    render(GameConfigModal, {
      props: {
        gameName: "Diablo II: Resurrected",
        gameId: "d2r",
        sources: [makeSource({ path: "/home/user/.d2r/saves" })],
        onclose: vi.fn(),
      },
    });
    expect(screen.getByText("/home/user/.d2r/saves")).toBeInTheDocument();
  });

  it("shows error message below source row", () => {
    // Use multiple sources to avoid auto-open of SourceEditModal
    render(GameConfigModal, {
      props: {
        gameName: "Diablo II: Resurrected",
        gameId: "d2r",
        sources: [
          makeSource({ sourceId: "src-1", status: "error", error: "Path does not exist" }),
          makeSource({ sourceId: "src-2", status: "watching" }),
        ],
        onclose: vi.fn(),
      },
    });
    expect(screen.getByText("Path does not exist")).toBeInTheDocument();
  });

  it("shows empty state when no sources", () => {
    render(GameConfigModal, {
      props: {
        gameName: "Diablo II: Resurrected",
        gameId: "d2r",
        sources: [],
        availableSources: [makeAvailableSource()],
        onclose: vi.fn(),
      },
    });
    expect(screen.getByText("No sources configured for this game.")).toBeInTheDocument();
  });

  it("shows 'Link a device first' hint when no sources and no available sources", () => {
    render(GameConfigModal, {
      props: {
        gameName: "Diablo II: Resurrected",
        gameId: "d2r",
        sources: [],
        availableSources: [],
        onclose: vi.fn(),
      },
    });
    expect(screen.getByText("No sources configured for this game.")).toBeInTheDocument();
    expect(screen.getByText("Link a device first to configure this game.")).toBeInTheDocument();
  });

  it("DISMISS button calls onclose", async () => {
    const onclose = vi.fn();
    render(GameConfigModal, {
      props: {
        gameName: "Diablo II: Resurrected",
        gameId: "d2r",
        sources: [makeSource()],
        onclose,
      },
    });
    await userEvent.click(screen.getByText("DISMISS"));
    expect(onclose).toHaveBeenCalledOnce();
  });

  it("shows ADD SOURCE button when availableSources has items", () => {
    render(GameConfigModal, {
      props: {
        gameName: "Diablo II: Resurrected",
        gameId: "d2r",
        sources: [makeSource()],
        availableSources: [makeAvailableSource()],
        onclose: vi.fn(),
      },
    });
    expect(screen.getByText("ADD SOURCE")).toBeInTheDocument();
  });
});
