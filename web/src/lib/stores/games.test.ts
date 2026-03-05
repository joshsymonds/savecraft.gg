import type { MergedGame, MergedSave, Source } from "$lib/types/source";
import { describe, expect, it } from "vitest";

import { mergeGames } from "./games";

function makeSource(overrides: Partial<Source> & { id: string }): Source {
  return {
    name: overrides.id,
    sourceKind: "daemon",
    hostname: overrides.id,
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
    expect(game.saves.map((s: MergedSave) => s.sourceId)).toEqual(["src-1", "src-2"]);
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
    expect(result.map((g: MergedGame) => g.gameId)).toEqual(["d2r", "sdv"]);
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
    expect(result.map((g: MergedGame) => g.name)).toEqual([
      "Baldur's Gate 3",
      "Diablo II: Resurrected",
      "Stardew Valley",
    ]);
  });

  it("sets MergedSave sourceId and sourceName correctly", () => {
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
