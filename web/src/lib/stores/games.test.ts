import type { Game, Save, Source } from "$lib/types/source";
import { describe, expect, it } from "vitest";

import { mergeGames } from "./games";

function makeSource(overrides: Partial<Source> & { id: string }): Source {
  return {
    name: overrides.id,
    sourceKind: "daemon",
    hostname: overrides.id,
    platform: "linux",
    status: "online",
    version: "0.1.0",
    lastSeen: "now",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [],
    ...overrides,
  };
}

describe("mergeGames", () => {
  it("returns empty array for empty sources", () => {
    expect(mergeGames([])).toEqual([]);
  });

  it("merges a single source with one game", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "1 save",
            saves: [
              {
                saveUuid: "s1",
                saveName: "Atmus",
                summary: "Paladin",
                lastUpdated: "now",
                status: "success",
              },
            ],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result).toHaveLength(1);
    const game = result[0]!;
    expect(game.gameId).toBe("d2r");
    expect(game.sourceCount).toBe(1);
    expect(game.saves).toHaveLength(1);
    expect(game.saves[0]!.sourceId).toBe("src-1");
    expect(game.saves[0]!.sourceName).toBe("src-1");
    expect(game.sources).toHaveLength(1);
    expect(game.sources[0]!.sourceId).toBe("src-1");
    expect(game.sources[0]!.status).toBe("watching");
    expect(game.needsConfig).toBe(false);
  });

  it("merges same game across two sources", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "1 save",
            saves: [
              {
                saveUuid: "s1",
                saveName: "Atmus",
                summary: "Paladin",
                lastUpdated: "now",
                status: "success",
              },
            ],
          },
        ],
      }),
      makeSource({
        id: "src-2",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "1 save",
            saves: [
              {
                saveUuid: "s2",
                saveName: "Blizzara",
                summary: "Sorc",
                lastUpdated: "1h ago",
                status: "success",
              },
            ],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result).toHaveLength(1);
    const game = result[0]!;
    expect(game.gameId).toBe("d2r");
    expect(game.sourceCount).toBe(2);
    expect(game.saves).toHaveLength(2);
    expect(game.saves.map((s: Save) => s.sourceId)).toEqual(["src-1", "src-2"]);
  });

  it("keeps different games separate", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            saves: [],
          },
          { gameId: "sdv", name: "Stardew Valley", status: "watching", statusLine: "", saves: [] },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result).toHaveLength(2);
    const gameIds = result.map((g: Game) => g.gameId);
    expect(gameIds).toContain("d2r");
    expect(gameIds).toContain("sdv");
  });

  it("sorts games alphabetically by name", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          { gameId: "sdv", name: "Stardew Valley", status: "watching", statusLine: "", saves: [] },
          { gameId: "bg3", name: "Baldur's Gate 3", status: "watching", statusLine: "", saves: [] },
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            saves: [],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result.map((g: Game) => g.name)).toEqual([
      "Baldur's Gate 3",
      "Diablo II: Resurrected",
      "Stardew Valley",
    ]);
  });

  it("sets Save sourceId and sourceName correctly", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        name: "GAMING-PC",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            saves: [
              {
                saveUuid: "s1",
                saveName: "Atmus",
                summary: "Paladin",
                lastUpdated: "now",
                status: "success",
              },
            ],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result[0]!.saves[0]!.sourceId).toBe("src-1");
    expect(result[0]!.saves[0]!.sourceName).toBe("GAMING-PC");
  });

  it("generates statusLine from save count", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            saves: [
              { saveUuid: "s1", saveName: "A", summary: "", lastUpdated: "now", status: "success" },
              { saveUuid: "s2", saveName: "B", summary: "", lastUpdated: "now", status: "success" },
            ],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result[0]!.statusLine).toBe("2 saves");
  });

  it("handles singular save count", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            saves: [
              { saveUuid: "s1", saveName: "A", summary: "", lastUpdated: "now", status: "success" },
            ],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result[0]!.statusLine).toBe("1 save");
  });

  it("sets needsConfig when a source has not_found status", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "not_found",
            statusLine: "",
            saves: [],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result[0]!.needsConfig).toBe(true);
    expect(result[0]!.sources[0]!.status).toBe("not_found");
  });

  it("sets needsConfig when a source has error status", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "error",
            statusLine: "",
            saves: [],
            error: "plugin crashed",
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result[0]!.needsConfig).toBe(true);
    expect(result[0]!.sources[0]!.error).toBe("plugin crashed");
  });

  it("populates source entries with path and hostname", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        name: "DAEMON · JOSH-PC",
        hostname: "josh-pc",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            path: "/home/josh/.d2r/saves",
            saves: [
              { saveUuid: "s1", saveName: "A", summary: "", lastUpdated: "now", status: "success" },
            ],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    const se = result[0]!.sources[0]!;
    expect(se.sourceName).toBe("DAEMON · JOSH-PC");
    expect(se.hostname).toBe("josh-pc");
    expect(se.path).toBe("/home/josh/.d2r/saves");
    expect(se.saveCount).toBe(1);
  });

  it("shows 'No saves' when empty", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            saves: [],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result[0]!.statusLine).toBe("No saves");
  });
});
